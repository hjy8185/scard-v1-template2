"""Answer composition agent.

Composes natural language answers from SQL query results,
making data insights accessible to business users.
"""

from __future__ import annotations

import logging
from typing import Any

from app.services.bedrock_client import BedrockClient

logger = logging.getLogger(__name__)


class AnswerComposer:
    """Composes natural language answers from query results."""

    def __init__(self, bedrock_client: BedrockClient) -> None:
        self._bedrock = bedrock_client

    async def compose(
        self,
        query: str,
        sql: str,
        results: dict[str, Any],
        explanation: str | None = None,
    ) -> str:
        """Compose a natural language answer from SQL execution results.

        Args:
            query: Original user question.
            sql: The SQL that was executed.
            results: Query results dict with columns, rows, row_count.
            explanation: Optional SQL explanation from the generator.

        Returns:
            Korean natural language answer.
        """
        rows = results.get("rows", [])
        row_count = results.get("row_count", 0)
        error = results.get("error")

        # Handle error case
        if error:
            return await self._compose_error_response(query, error)

        # Handle empty results
        if row_count == 0:
            return await self._compose_empty_response(query, sql)

        # Compose answer via LLM
        try:
            answer = await self._bedrock.compose_answer(
                query=query,
                sql=sql,
                results=results,
                context=explanation,
            )
            return answer
        except Exception as e:
            logger.warning("LLM answer composition failed: %s, using template", e)
            return self._template_answer(query, results)

    async def _compose_error_response(self, query: str, error: str) -> str:
        """Compose a user-friendly error message."""
        # Common error patterns
        if "timeout" in error.lower():
            return (
                "죄송합니다. 데이터 조회에 시간이 너무 오래 걸렸습니다. "
                "질문의 범위를 좁혀서 다시 시도해 주세요. "
                "예: 특정 기간이나 조건을 추가해 보세요."
            )
        if "syntax" in error.lower() or "parse" in error.lower():
            return (
                "죄송합니다. 질문을 SQL로 변환하는 과정에서 오류가 발생했습니다. "
                "질문을 조금 다르게 표현해 주시면 더 정확한 결과를 드릴 수 있습니다."
            )
        return (
            f"데이터 조회 중 오류가 발생했습니다. "
            f"잠시 후 다시 시도해 주세요."
        )

    async def _compose_empty_response(self, query: str, sql: str) -> str:
        """Compose a response for empty result sets."""
        return (
            "조회 결과가 없습니다. "
            "조건을 변경하거나 기간을 넓혀서 다시 질문해 주세요. "
            "예를 들어, 특정 기간 대신 전체 기간으로 조회하거나 "
            "필터 조건을 완화해 볼 수 있습니다."
        )

    def _template_answer(self, query: str, results: dict[str, Any]) -> str:
        """Fallback template-based answer when LLM is unavailable."""
        rows = results.get("rows", [])
        columns = results.get("columns", [])
        row_count = results.get("row_count", len(rows))
        truncated = results.get("truncated", False)

        lines = []
        lines.append(f"조회 결과 총 {row_count:,}건입니다.")

        if truncated:
            lines.append(f"(결과가 많아 상위 {len(rows):,}건만 표시합니다.)")

        # Show summary of first few rows
        if rows and columns:
            lines.append("")
            # For aggregation results (single row), show key-value pairs
            if row_count == 1:
                row = rows[0]
                for col in columns:
                    val = row.get(col)
                    if val is not None:
                        # Format numbers
                        try:
                            num = float(val)
                            if num == int(num):
                                formatted = f"{int(num):,}"
                            else:
                                formatted = f"{num:,.2f}"
                            lines.append(f"- {col}: {formatted}")
                        except (ValueError, TypeError):
                            lines.append(f"- {col}: {val}")
            else:
                # Multi-row: show first 5 as bullet points
                for i, row in enumerate(rows[:5]):
                    parts = []
                    for col in columns[:4]:
                        val = row.get(col, "")
                        if val is not None:
                            parts.append(f"{col}: {val}")
                    lines.append(f"  {i+1}. {', '.join(parts)}")
                if row_count > 5:
                    lines.append(f"  ... 외 {row_count - 5:,}건")

        return "\n".join(lines)
