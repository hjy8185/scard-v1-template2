"""Neptune Gremlin client with IAM SigV4 authentication.

Connects to Amazon Neptune for ontology graph traversal queries.
Used to retrieve table relationships, join paths, and semantic context.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import botocore.auth
import botocore.awsrequest
import botocore.session
import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class NeptuneError(Exception):
    """Raised when Neptune query fails."""
    pass


class NeptuneClient:
    """Client for Neptune Graph DB using Gremlin HTTP REST API with SigV4 auth."""

    def __init__(
        self,
        endpoint: str | None = None,
        region: str | None = None,
    ) -> None:
        self._endpoint = (endpoint or settings.NEPTUNE_ENDPOINT).rstrip("/")
        self._region = region or settings.AWS_REGION
        self._session = botocore.session.get_session()

    def _sign_request(self, method: str, url: str, body: bytes) -> dict[str, str]:
        """Sign request with SigV4 for Neptune IAM auth."""
        credentials = self._session.get_credentials().get_frozen_credentials()
        request = botocore.awsrequest.AWSRequest(
            method=method,
            url=url,
            data=body,
            headers={"Content-Type": "application/json"},
        )
        botocore.auth.SigV4Auth(
            credentials, "neptune-db", self._region
        ).add_auth(request)
        return dict(request.headers)

    async def execute_gremlin(self, query: str) -> list[dict[str, Any]]:
        """Execute a Gremlin query and return results."""
        body = json.dumps({"gremlin": query}).encode()
        url = f"{self._endpoint}/gremlin"

        try:
            headers = self._sign_request("POST", url, body)
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, content=body, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                return data.get("result", {}).get("data", [])
        except httpx.HTTPStatusError as e:
            logger.error("Neptune HTTP error: %s %s", e.response.status_code, e.response.text[:200])
            raise NeptuneError(f"Neptune query failed: HTTP {e.response.status_code}") from e
        except Exception as e:
            logger.error("Neptune query failed: %s", e)
            raise NeptuneError(f"Neptune query failed: {e}") from e

    async def get_table_relationships(self, table_name: str) -> list[dict[str, Any]]:
        """Get all relationships for a given table node."""
        query = (
            f"g.V().has('table_name', '{table_name}')"
            f".bothE().otherV().path().by(elementMap())"
        )
        return await self.execute_gremlin(query)

    async def get_join_path(
        self, source_table: str, target_table: str, max_hops: int = 3
    ) -> list[dict[str, Any]]:
        """Find join path between two tables in the ontology graph."""
        query = (
            f"g.V().has('table_name', '{source_table}')"
            f".repeat(bothE().otherV().simplePath()).times({max_hops})"
            f".has('table_name', '{target_table}')"
            f".path().by(elementMap()).limit(5)"
        )
        return await self.execute_gremlin(query)

    async def get_domain_tables(self, domain: str) -> list[dict[str, Any]]:
        """Get all tables belonging to a specific domain."""
        query = (
            f"g.V().has('domain', '{domain}')"
            f".has('node_type', 'table').elementMap()"
        )
        return await self.execute_gremlin(query)

    async def get_table_columns(self, table_name: str) -> list[dict[str, Any]]:
        """Get columns for a table from the graph."""
        query = (
            f"g.V().has('table_name', '{table_name}')"
            f".out('has_column').elementMap()"
        )
        return await self.execute_gremlin(query)

    async def find_tables_by_concept(self, concept: str) -> list[dict[str, Any]]:
        """Find tables related to a business concept."""
        query = (
            f"g.V().has('label', textContains('{concept}'))"
            f".in('belongs_to').has('node_type', 'table').elementMap()"
        )
        return await self.execute_gremlin(query)

    async def health_check(self) -> bool:
        """Check if Neptune is reachable."""
        try:
            url = f"{self._endpoint}/status"
            headers = self._sign_request("GET", url, b"")
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(url, headers=headers)
                return resp.status_code == 200
        except Exception:
            return False
