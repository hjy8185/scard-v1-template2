"""Bedrock Claude client for LLM operations.

Uses Bedrock Converse API with toolChoice for structured output.
Reference: scard-v2-llm's BedrockLLM pattern.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncGenerator

import boto3
from botocore.config import Config

from app.config import settings

logger = logging.getLogger(__name__)


class BedrockError(Exception):
    """Raised when Bedrock invocation fails."""
    pass


# Tool schema for SQL generation (forced via toolChoice)
TOOL_SQL_GENERATE = {
    "toolSpec": {
        "name": "emit_sql",
        "description": "생성된 SQL 쿼리와 메타데이터를 제출합니다.",
        "inputSchema": {"json": {
            "type": "object",
            "required": ["sql", "explanation", "tables_used"],
            "properties": {
                "sql": {
                    "type": "string",
                    "description": "Athena-compatible SELECT SQL query",
                },
                "explanation": {
                    "type": "string",
                    "description": "쿼리가 하는 일에 대한 간단한 설명 (한국어)",
                },
                "tables_used": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "쿼리에 사용된 테이블 이름 목록",
                },
                "confidence": {
                    "type": "number",
                    "description": "생성 확신도 (0.0-1.0)",
                },
                "assumptions": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "쿼리 생성 시 가정한 사항",
                },
            },
        }},
    }
}

# Tool schema for intent classification
TOOL_INTENT_CLASSIFY = {
    "toolSpec": {
        "name": "classify_intent",
        "description": "사용자 질문의 의도를 분류합니다.",
        "inputSchema": {"json": {
            "type": "object",
            "required": ["intent", "confidence", "requires_sql"],
            "properties": {
                "intent": {
                    "type": "string",
                    "enum": ["data_query", "aggregation", "comparison", "definition", "greeting", "unsupported"],
                    "description": "분류된 의도",
                },
                "confidence": {
                    "type": "number",
                    "description": "분류 확신도 (0.0-1.0)",
                },
                "entities": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "추출된 엔티티",
                },
                "requires_sql": {
                    "type": "boolean",
                    "description": "SQL 실행이 필요한지 여부",
                },
                "domain_hint": {
                    "type": "string",
                    "enum": ["customer", "transaction", "product", "merchant", "soleprop"],
                    "description": "데이터 도메인 힌트",
                },
            },
        }},
    }
}


class BedrockClient:
    """Client for Amazon Bedrock using the Converse API."""

    def __init__(
        self,
        model_id: str | None = None,
        region: str | None = None,
        max_tokens: int | None = None,
    ) -> None:
        self._model_id = model_id or settings.BEDROCK_MODEL_ID
        self._region = region or settings.BEDROCK_REGION
        self._max_tokens = max_tokens or settings.BEDROCK_MAX_TOKENS
        self._client = boto3.client(
            "bedrock-runtime",
            config=Config(
                region_name=self._region,
                retries={"max_attempts": 3},
                read_timeout=60,
            ),
        )

    def _converse(self, **kw) -> dict:
        """Single Converse API call."""
        return self._client.converse(**kw)

    async def tool_call(
        self,
        system: str,
        user: str,
        tool: dict,
        max_tokens: int | None = None,
    ) -> dict[str, Any]:
        """Force structured output via toolChoice.

        The model MUST call the specified tool, giving us guaranteed
        JSON structure without fragile text parsing.
        """
        name = tool["toolSpec"]["name"]

        def _invoke():
            resp = self._converse(
                modelId=self._model_id,
                system=[{"text": system}],
                messages=[{"role": "user", "content": [{"text": user}]}],
                toolConfig={
                    "tools": [tool],
                    "toolChoice": {"tool": {"name": name}},
                },
                inferenceConfig={"maxTokens": max_tokens or self._max_tokens},
            )
            blocks = (resp.get("output") or {}).get("message", {}).get("content") or []
            for b in blocks:
                tu = b.get("toolUse")
                if tu and tu.get("name") == name:
                    return dict(tu.get("input") or {})
            raise BedrockError(f"toolUse block missing for '{name}' (schema enforcement failed)")

        try:
            return await asyncio.to_thread(_invoke)
        except BedrockError:
            raise
        except Exception as e:
            logger.error("Bedrock tool_call failed: %s: %s", type(e).__name__, e)
            raise BedrockError(f"Bedrock tool_call failed: {e}") from e

    async def text(self, system: str, user: str, max_tokens: int | None = None) -> str:
        """Plain text response via Converse API."""
        def _invoke():
            resp = self._converse(
                modelId=self._model_id,
                system=[{"text": system}],
                messages=[{"role": "user", "content": [{"text": user}]}],
                inferenceConfig={"maxTokens": max_tokens or self._max_tokens},
            )
            blocks = (resp.get("output") or {}).get("message", {}).get("content") or []
            return "".join(b.get("text", "") for b in blocks if isinstance(b, dict)).strip()

        try:
            return await asyncio.to_thread(_invoke)
        except Exception as e:
            logger.error("Bedrock text call failed: %s: %s", type(e).__name__, e)
            raise BedrockError(f"Bedrock text call failed: {e}") from e

    async def invoke(
        self,
        messages: list[dict[str, Any]],
        system: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        stop_sequences: list[str] | None = None,
    ) -> str:
        """Legacy invoke method (Messages API format) for backward compatibility.

        Translates to Converse API internally.
        """
        converse_messages = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if isinstance(content, str):
                converse_messages.append({
                    "role": role,
                    "content": [{"text": content}],
                })
            elif isinstance(content, list):
                converse_messages.append({
                    "role": role,
                    "content": content,
                })

        def _invoke():
            kw: dict[str, Any] = {
                "modelId": self._model_id,
                "messages": converse_messages,
                "inferenceConfig": {"maxTokens": max_tokens or self._max_tokens},
            }
            if system:
                kw["system"] = [{"text": system}]

            resp = self._converse(**kw)
            blocks = (resp.get("output") or {}).get("message", {}).get("content") or []
            return "".join(b.get("text", "") for b in blocks if isinstance(b, dict)).strip()

        try:
            return await asyncio.to_thread(_invoke)
        except Exception as e:
            logger.error("Bedrock invoke failed: %s: %s", type(e).__name__, e)
            raise BedrockError(f"Bedrock invocation failed: {e}") from e

    async def invoke_streaming(
        self,
        messages: list[dict[str, Any]],
        system: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
    ) -> AsyncGenerator[str, None]:
        """Streaming text response via Converse stream API."""
        converse_messages = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if isinstance(content, str):
                converse_messages.append({
                    "role": role,
                    "content": [{"text": content}],
                })
            elif isinstance(content, list):
                converse_messages.append({
                    "role": role,
                    "content": content,
                })

        def _invoke_stream():
            kw: dict[str, Any] = {
                "modelId": self._model_id,
                "messages": converse_messages,
                "inferenceConfig": {"maxTokens": max_tokens or self._max_tokens},
            }
            if system:
                kw["system"] = [{"text": system}]
            return self._client.converse_stream(**kw)

        try:
            response = await asyncio.to_thread(_invoke_stream)
            stream = response.get("stream")
            if stream is None:
                raise BedrockError("No response stream from Bedrock")

            for event in stream:
                if "contentBlockDelta" in event:
                    delta = event["contentBlockDelta"].get("delta", {})
                    text = delta.get("text", "")
                    if text:
                        yield text

        except BedrockError:
            raise
        except Exception as e:
            logger.error("Bedrock streaming failed: %s: %s", type(e).__name__, e)
            raise BedrockError(f"Bedrock streaming failed: {e}") from e

    async def classify_intent(self, query: str) -> dict[str, Any]:
        """Classify user intent using forced tool schema."""
        system_prompt = """당신은 신한금융그룹 원데이터 플랫폼의 의도 분류기입니다.
사용자 질문을 다음 의도 중 하나로 분류하세요:
- data_query: 데이터 조회/분석 (SQL 필요)
- aggregation: 요약 통계/집계 (SQL 필요)
- comparison: 차원별 비교 분석 (SQL 필요)
- definition: 용어/개념 정의 질문 (SQL 불필요)
- greeting: 인사/잡담 (SQL 불필요)
- unsupported: 보유하지 않은 데이터에 대한 질문"""

        try:
            result = await self.tool_call(
                system=system_prompt,
                user=query,
                tool=TOOL_INTENT_CLASSIFY,
                max_tokens=512,
            )
            return result
        except BedrockError:
            logger.warning("Intent classification via tool_call failed, returning default")
            return {
                "intent": "data_query",
                "confidence": 0.5,
                "entities": [],
                "requires_sql": True,
                "domain_hint": None,
            }

    async def generate_sql(
        self,
        query: str,
        context: str,
        examples: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        """Generate SQL using forced tool schema (Converse + toolChoice).

        This guarantees structured JSON output without text parsing.
        """
        system_prompt = f"""당신은 신한금융그룹 원데이터 플랫폼의 SQL 생성 전문가입니다.
사용자 질문에 답할 Athena(Presto/Trino) SQL을 생성합니다.

## 필수 규칙

1. SELECT 쿼리만 생성 — INSERT/UPDATE/DELETE/DROP 금지
2. 반드시 LIMIT 포함 (최대 1000행)
3. 아래 온톨로지 컨텍스트에 있는 정확한 테이블·컬럼 이름을 사용
4. 한국어 컬럼명은 반드시 큰따옴표로 감싸기: "그룹md번호", "고객연령"
5. 데이터베이스 접두어: ai_ready_v2.<테이블명>
6. 모든 테이블의 공통 조인 키: "그룹md번호" (고객 ID)
7. 집계 함수 사용 시 GROUP BY 필수
8. 컬럼 별칭도 한국어면 큰따옴표: COUNT(*) AS "이용건수"
9. 날짜 컬럼: date_parse, date_format 사용
10. NULL 처리: COALESCE 적절히 사용

## SQL 포맷 규칙 (반드시 준수)

- 각 절(SELECT, FROM, JOIN, WHERE, GROUP BY, ORDER BY, LIMIT)은 새 줄에서 시작
- SELECT 컬럼은 줄바꿈 후 2칸 들여쓰기로 한 컬럼씩 나열
- JOIN의 ON 조건은 2칸 들여쓰기
- WHERE 조건이 여러 개면 AND/OR를 2칸 들여쓰기로 구분
- 예시:
  SELECT
    "컬럼1",
    COUNT(*) AS "별칭"
  FROM ai_ready_v2.테이블명 t
  JOIN ai_ready_v2.테이블2 c
    ON t."키" = c."키"
  WHERE t."조건" = '값'
  GROUP BY "컬럼1"
  ORDER BY "별칭" DESC
  LIMIT 20

## Athena(Presto) 문법 제약 (반드시 준수)

- PERCENTILE_CONT(...) WITHIN GROUP 사용 금지 → 대신 approx_percentile(column, 0.9) 사용
- MEDIAN 함수 없음 → approx_percentile(column, 0.5) 사용
- LIMIT 절에 서브쿼리/수식 사용 불가 → 반드시 정수 리터럴만 (예: LIMIT 100)
- 한국어 CTE 이름 사용 금지 → 영문 alias만 사용 (예: WITH sol_usage AS ...)
- 서브쿼리에서 컬럼 별칭 사용 시 큰따옴표 금지 (AS cnt → 따옴표 없이)
- HAVING 절에 서브쿼리 사용 가능하나, 단순 CTE(WITH절)로 대체 권장
- 복잡한 쿼리는 WITH절(CTE)로 단계별 분리
- JOIN 시 동일 컬럼명이 여러 테이블에 있으면 반드시 테이블 alias로 구분
- "상위 N%" 패턴: approx_percentile로 임계값 구하고 WHERE로 필터링
  예: WITH stats AS (SELECT approx_percentile("사용건수", 0.9) AS threshold FROM ...) → WHERE x >= threshold
- jaz_sh_fanclub_membership_chghist 테이블의 조인키는 "그룹md" (not "그룹md번호")
- igd_m_cust_base, igd_m_cust_txn_card 등의 조인키는 "그룹md번호"

## 계열사 회원 필터링 패턴

- "카드회원" = cln_d_cust_mas_card에 존재하는 고객 (JOIN으로 필터)
- "은행회원" = cln_d_cust_mas_bank에 존재하는 고객
- "카드 only 회원" = 카드 마스터에는 있지만 은행 마스터에는 없는 고객:
  JOIN cln_d_cust_mas_card ON ... (카드 보유)
  LEFT JOIN cln_d_cust_mas_bank ON ... (은행 미보유 확인)
  WHERE cln_d_cust_mas_bank."그룹md번호" IS NULL
- "X에 대해서만" = 이전 쿼리 결과를 X 조건으로 필터링

## 기간 기본값 규칙 (매우 중요)

- 사용자가 기간을 명시하지 않으면 "최근 1개월" 또는 "가장 최신 기준년월" 데이터를 사용
- 절대로 사용자에게 기간을 되물어보지 말 것 — 항상 최신 데이터로 바로 답변
- 예: "슈퍼솔 앱 사용 고객수 알려줘" → WHERE "기준년월" = (SELECT MAX("기준년월") FROM 해당테이블)
- 기간이 명시된 경우에만 해당 기간으로 필터링

## 쿼리 품질 기준

- 결과는 집계·정렬해 상위 건으로 줄이세요 (LIMIT)
- 기간 필터가 있으면 반드시 WHERE에 포함
- 기간 미지정 시 최신 데이터 사용 (위 규칙 참조)
- 드릴다운 질문("위 결과를 X별로")이면 이전 쿼리를 기반으로 X 차원 추가
  ★ 드릴다운 규칙: 이전 쿼리의 FROM, WHERE, JOIN을 그대로 유지하고 GROUP BY만 변경
  ★ 드릴다운 결과의 합계는 이전 쿼리 총합과 일치해야 함 (데이터 무결성)
  ★ 예: 이전 "총 고객수 8,906" → 성별별 합 = 8,906 이어야 함
- 복잡한 분석(상위 N%, 서브그룹 필터링)은 WITH절(CTE)로 단계별 분리
- 연령대별 분석은 반드시 ORDER BY 연령구간코드 ASC (오름차순)

## 사용자 수정/피드백 패턴 (대화 이력이 있을 때)

- "X로 물어본 적 없고, Y로 알려줘" → 이전 쿼리에서 X 차원 제거하고 Y 조건으로 변경
- "Y에 대해서만 알려줘" → 이전 쿼리에 Y 필터 조건 추가 (WHERE)
- "X only" / "X만" → X에 해당하는 WHERE 필터 추가
- "그게 아니고" / "다시" → 이전 쿼리를 사용자 피드백에 맞게 수정
- 핵심: 사용자의 수정 요청은 이전 SQL을 기반으로 조건을 추가/변경하는 것임

## 온톨로지 컨텍스트

{context}"""

        # Build user message with few-shot examples inline
        user_parts = []
        if examples:
            user_parts.append("## 참고 예시\n")
            for ex in examples[:3]:
                user_parts.append(f"Q: {ex['question']}")
                user_parts.append(f"A: {json.dumps(ex['answer'], ensure_ascii=False)}\n")
            user_parts.append("---\n")

        user_parts.append(f"## 사용자 질문\n{query}")
        user_msg = "\n".join(user_parts)

        result = await self.tool_call(
            system=system_prompt,
            user=user_msg,
            tool=TOOL_SQL_GENERATE,
        )
        return result

    async def compose_answer(
        self,
        query: str,
        sql: str,
        results: dict[str, Any],
        context: str | None = None,
    ) -> str:
        """Compose a natural language answer from query results."""
        system_prompt = """당신은 신한금융그룹의 데이터 분석 어시스턴트입니다.
SQL 쿼리 결과를 바탕으로 명확하고 간결한 한국어 답변을 작성합니다.

규칙:
1. 한국어로 답변
2. 결과에서 구체적인 숫자와 데이터 포인트 포함
3. 금액은 소수점 제외, 천원 단위 콤마 표기 (예: 1,234,567원)
4. 연령구간코드 변환: 010→10~14세, 020→20~24세, 030→30~34세, 070→70세 이상
5. 결과가 비어있으면 명확히 설명하고 이유 제시
6. 집계 결과의 핵심 인사이트 강조
7. 간결하게 작성 (간단한 쿼리는 2-5문장, 복잡한 것은 더 길게)
8. SQL 쿼리 자체는 노출하지 않음
9. 존댓말 사용 (합니다/입니다 체)
10. 정렬: 연령대 결과는 반드시 10대→20대→30대→...→70대+ 오름차순으로 제시. 절대로 고객수나 금액 기준으로 재정렬하지 마세요."""

        result_summary = self._format_results_for_prompt(results)

        user_msg = f"""사용자 질문: {query}

실행된 쿼리 결과:
{result_summary}

위 결과를 바탕으로 사용자 질문에 답변해 주세요."""

        return await self.text(system=system_prompt, user=user_msg, max_tokens=2048)

    def _format_results_for_prompt(self, results: dict[str, Any]) -> str:
        """Format query results into a readable string for the LLM."""
        columns = results.get("columns", [])
        rows = results.get("rows", [])
        row_count = results.get("row_count", len(rows))
        truncated = results.get("truncated", False)

        if not rows:
            return "결과 없음 (0 rows)"

        lines = [f"총 {row_count}건" + (" (결과 일부 표시)" if truncated else "")]
        lines.append("| " + " | ".join(columns) + " |")
        lines.append("|" + "|".join(["---"] * len(columns)) + "|")

        for row in rows[:20]:
            values = [str(row.get(col, "NULL")) for col in columns]
            lines.append("| " + " | ".join(values) + " |")

        if len(rows) > 20:
            lines.append(f"... ({len(rows) - 20}건 추가)")

        return "\n".join(lines)

    async def health_check(self) -> bool:
        """Check if Bedrock is reachable."""
        try:
            await asyncio.to_thread(
                self._client.list_foundation_models, maxResults=1
            )
            return True
        except Exception:
            return False
