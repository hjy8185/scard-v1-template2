"""Athena SQL execution client.

Executes read-only SQL queries against the Onedata Glue database (ai_ready_v2).
Enforces safety constraints: SELECT only, row limits, timeouts.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any

import boto3
from botocore.config import Config

from app.config import settings

logger = logging.getLogger(__name__)

_BOTO_CONFIG = Config(
    region_name=settings.ATHENA_REGION,
    retries={"max_attempts": 2},
)

# SQL safety patterns - only allow SELECT statements
_FORBIDDEN_PATTERNS = [
    r"\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|MERGE|REPLACE)\b",
    r"\b(GRANT|REVOKE)\b",
    r"\bINTO\s+\w+",  # SELECT INTO
]
_FORBIDDEN_RE = re.compile("|".join(_FORBIDDEN_PATTERNS), re.IGNORECASE)


class AthenaError(Exception):
    """Raised when Athena query fails."""
    pass


class SQLSafetyError(AthenaError):
    """Raised when SQL contains forbidden operations."""
    pass


class AthenaClient:
    """Client for executing read-only SQL on Athena."""

    def __init__(
        self,
        database: str | None = None,
        output_bucket: str | None = None,
        workgroup: str | None = None,
        region: str | None = None,
    ) -> None:
        self._database = database or settings.ATHENA_DATABASE
        self._output_bucket = output_bucket or settings.ATHENA_OUTPUT_BUCKET
        self._workgroup = workgroup or settings.ATHENA_WORKGROUP
        self._region = region or settings.AWS_REGION
        self._client = boto3.client("athena", config=_BOTO_CONFIG)
        self._timeout = settings.ATHENA_TIMEOUT_SECONDS
        self._max_rows = settings.ATHENA_MAX_ROWS

    def validate_sql(self, sql: str) -> None:
        """Validate SQL is read-only and safe to execute.

        Raises:
            SQLSafetyError: If SQL contains forbidden operations.
        """
        # Strip comments
        clean_sql = re.sub(r"--.*$", "", sql, flags=re.MULTILINE)
        clean_sql = re.sub(r"/\*.*?\*/", "", clean_sql, flags=re.DOTALL)

        if _FORBIDDEN_RE.search(clean_sql):
            raise SQLSafetyError(
                "SQL contains forbidden operations. Only SELECT queries are allowed."
            )

        # Must start with SELECT (after stripping whitespace/WITH)
        stripped = clean_sql.strip().upper()
        if not (stripped.startswith("SELECT") or stripped.startswith("WITH")):
            raise SQLSafetyError(
                "Query must begin with SELECT or WITH clause."
            )

    def _apply_row_limit(self, sql: str) -> str:
        """Ensure query has a LIMIT clause."""
        stripped = sql.strip().rstrip(";")
        if not re.search(r"\bLIMIT\s+\d+", stripped, re.IGNORECASE):
            stripped += f" LIMIT {self._max_rows}"
        return stripped

    async def execute_query(
        self, sql: str, max_rows: int | None = None
    ) -> dict[str, Any]:
        """Execute a SQL query on Athena and return results.

        Args:
            sql: The SQL query to execute.
            max_rows: Override maximum rows to return.

        Returns:
            Dict with keys: columns, rows, row_count, truncated, execution_time_ms, sql

        Raises:
            SQLSafetyError: If SQL is not read-only.
            AthenaError: If query execution fails.
        """
        # Safety check
        self.validate_sql(sql)

        # Apply row limit
        effective_max = max_rows or self._max_rows
        limited_sql = self._apply_row_limit(sql)

        start_time = time.monotonic()

        try:
            # Start query execution
            response = await asyncio.to_thread(
                self._client.start_query_execution,
                QueryString=limited_sql,
                QueryExecutionContext={"Database": self._database},
                ResultConfiguration={"OutputLocation": self._output_bucket},
                WorkGroup=self._workgroup,
            )
            execution_id = response["QueryExecutionId"]

            # Poll for completion
            result = await self._wait_for_completion(execution_id)

            elapsed_ms = int((time.monotonic() - start_time) * 1000)

            if result["status"] == "FAILED":
                error_msg = result.get("error", "Unknown error")
                raise AthenaError(f"Query failed: {error_msg}")

            # Fetch results
            rows, columns = await self._fetch_results(execution_id, effective_max)
            truncated = len(rows) >= effective_max

            return {
                "sql": limited_sql,
                "columns": columns,
                "rows": rows,
                "row_count": len(rows),
                "truncated": truncated,
                "execution_time_ms": elapsed_ms,
                "error": None,
            }

        except (SQLSafetyError, AthenaError):
            raise
        except Exception as e:
            elapsed_ms = int((time.monotonic() - start_time) * 1000)
            logger.error("Athena query failed: %s", e)
            raise AthenaError(f"Athena execution error: {e}") from e

    async def _wait_for_completion(self, execution_id: str) -> dict[str, str]:
        """Poll Athena for query completion with timeout."""
        deadline = time.monotonic() + self._timeout
        poll_interval = 0.5

        while time.monotonic() < deadline:
            response = await asyncio.to_thread(
                self._client.get_query_execution,
                QueryExecutionId=execution_id,
            )
            state = response["QueryExecution"]["Status"]["State"]

            if state == "SUCCEEDED":
                return {"status": "SUCCEEDED"}
            elif state in ("FAILED", "CANCELLED"):
                reason = response["QueryExecution"]["Status"].get(
                    "StateChangeReason", "Unknown"
                )
                return {"status": "FAILED", "error": reason}

            await asyncio.sleep(poll_interval)
            poll_interval = min(poll_interval * 1.5, 3.0)

        # Timeout - cancel the query
        try:
            await asyncio.to_thread(
                self._client.stop_query_execution,
                QueryExecutionId=execution_id,
            )
        except Exception:
            pass
        raise AthenaError(
            f"Query timed out after {self._timeout}s (execution_id={execution_id})"
        )

    async def _fetch_results(
        self, execution_id: str, max_rows: int
    ) -> tuple[list[dict[str, Any]], list[str]]:
        """Fetch query results from Athena."""
        rows: list[dict[str, Any]] = []
        columns: list[str] = []
        next_token: str | None = None
        first_page = True

        while len(rows) < max_rows:
            kwargs: dict[str, Any] = {
                "QueryExecutionId": execution_id,
                "MaxResults": min(1000, max_rows - len(rows)),
            }
            if next_token:
                kwargs["NextToken"] = next_token

            response = await asyncio.to_thread(
                self._client.get_query_results, **kwargs
            )

            result_set = response["ResultSet"]

            # Extract column names from first page
            if first_page:
                col_info = result_set.get("ResultSetMetadata", {}).get(
                    "ColumnInfo", []
                )
                columns = [c["Name"] for c in col_info]
                first_page = False
                # Skip header row in first page
                data_rows = result_set.get("Rows", [])[1:]
            else:
                data_rows = result_set.get("Rows", [])

            for row in data_rows:
                row_data = {}
                for i, datum in enumerate(row.get("Data", [])):
                    col_name = columns[i] if i < len(columns) else f"col_{i}"
                    row_data[col_name] = datum.get("VarCharValue")
                rows.append(row_data)

            next_token = response.get("NextToken")
            if not next_token:
                break

        return rows[:max_rows], columns

    async def health_check(self) -> bool:
        """Check if Athena is reachable."""
        try:
            await asyncio.to_thread(
                self._client.list_work_groups, MaxResults=1
            )
            return True
        except Exception:
            return False
