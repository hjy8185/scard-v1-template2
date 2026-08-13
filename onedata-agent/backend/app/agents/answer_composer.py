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
        """Compose a user-friendly error message with suggestions."""
        try:
            prompt = (
                f"사용자 질문: {query}\n"
                f"오류 내용: {error[:300]}\n\n"
                "위 질문을 처리하다가 오류가 발생했습니다.\n"
                "1. 오류 원인을 사용자에게 간단히 설명 (1문장)\n"
                "2. 질문을 어떻게 바꾸면 될지 대안 3가지를 '💡 이렇게 질문해 보세요:' 이후 제안\n"
                "친근한 비즈니스 어조로 한국어 작성."
            )
            answer = await self._bedrock.text(
                system="당신은 신한금융그룹 데이터 분석 도우미입니다. 오류 상황에서도 친절하게 대안을 제시합니다.",
                user=prompt,
            )
            return answer
        except Exception:
            if "timeout" in error.lower():
                return (
                    "데이터 조회에 시간이 너무 오래 걸렸습니다.\n\n"
                    "💡 이렇게 질문해 보세요:\n"
                    "- 기간을 좁혀서 질문 (예: 최근 1개월)\n"
                    "- 특정 조건을 추가 (예: 30대만)\n"
                    "- 집계 단위를 줄여서 질문"
                )
            return (
                "데이터 조회 중 오류가 발생했습니다.\n\n"
                "💡 이렇게 질문해 보세요:\n"
                "- 질문을 좀 더 구체적으로 표현해 보세요\n"
                "- 다른 관점에서 질문해 보세요\n"
                "- 특정 테이블이나 지표를 명시해 보세요"
            )

    async def _compose_empty_response(self, query: str, sql: str) -> str:
        """Compose a response for empty result sets with alternative suggestions."""
        try:
            prompt = (
                f"사용자 질문: {query}\n"
                f"실행한 SQL:\n{sql}\n\n"
                "위 쿼리를 실행했으나 결과가 0건입니다.\n"
                "아래 형식으로 한국어로 답변해 주세요:\n"
                "1. 왜 결과가 없을 수 있는지 간단히 추정 (1~2문장)\n"
                "2. 대안 질문 또는 접근법 3개를 '💡 추천 분석:' 이후 줄바꿈하여 제안\n"
                "예시: 기간 조건 완화, 다른 테이블 활용, 유사 지표 조회 등\n"
                "친근한 비즈니스 어조로 작성하세요."
            )
            answer = await self._bedrock.text(
                system="당신은 신한금융그룹 데이터 분석 도우미입니다. 빈 결과에 대해 원인 추정과 대안을 제시합니다.",
                user=prompt,
            )
            return answer
        except Exception as e:
            logger.warning("Empty response LLM failed: %s", e)
            return (
                "조회 결과가 없습니다. 조건을 변경하거나 기간을 넓혀서 다시 질문해 주세요.\n\n"
                "💡 추천 분석:\n"
                "- 기간 조건을 전체 기간으로 넓혀 조회해 보세요\n"
                "- 필터 조건(연령, 지역 등)을 완화해 보세요\n"
                "- 유사한 지표를 다른 테이블에서 조회해 보세요"
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
