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
5. 데이터베이스 접두어: ai_ready_v3.<테이블명>
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
  FROM ai_ready_v3.테이블명 t
  JOIN ai_ready_v3.테이블2 c
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

## ★★ 조인 규칙 (ERD v3 실측 기반 — 반드시 준수)

### 조인 축
- 그룹md번호: 40개 테이블의 주요 고객 키
- 고객번호: 별도 네임스페이스 (4개 테이블: vam_*, rpt_d_unit_deposit_acct, jaz_*)
- ★★ 그룹md번호 ≠ 고객번호 — 직접 조인 불가! jaz_sh_fanclub_membership_chghist가 브리지
- 월 테이블 조인 시 반드시 "기준년월" 포함 (누락하면 6×6=36배 폭발)

### ★ 금지 조인 경로 (FJ)
- FJ-01: m_card_dim."모집인코드"를 고객 키로 사용 금지 (동명이의 컬럼, 76배 뻥튀기)
- FJ-02: 그룹md번호 = 고객번호 직접 비교 금지 (0행 반환)
- FJ-03: jaz_* 이력 테이블은 최신 처리일자로 필터 필수
- FJ-04: 월 테이블 간 조인에서 기준년월 조건 필수
- FJ-05: 거래식별번호는 계열사마다 다른 실체 — 계열사 구분 없이 조인 금지

### SOL 테이블 조인 규칙
- sol_m_supersol_visit: 기준년월 + 그룹md번호로 조인 (월 집계)
- sol_d_supersol_session: 기준일자 + 그룹md번호로 조인 (일 세션)
- ★ 미가입자 35,000명은 행 자체가 없음 (NULL이 아님) → LEFT JOIN 필요 시 주의
- 월 집계는 세션의 롤업: 월방문일수=count(DISTINCT 기준일자), 월방문횟수=count(*), 월체류분=sum(슈퍼솔체류분)

### 합산 금지 사항
- 카테고리 축 합계 ≠ 결제수단 축 합계 (이중계상 주의)
- 잔액(point_in_time) ≠ 평잔(period_average) ≠ 자산금액(valuation) — 합산 불가
- RFM 등급은 계열사별 기준이 달라 직접 비교 불가

### 지역 분석 규칙
- 지역별 분석 시 반드시 시도명(이름)으로 표시 (코드만 보여주지 말 것)
- cln_m_cust_base_card."자택광역도시코드" (2자리, 17종) 사용하여 CASE WHEN으로 변환:
  CASE "자택광역도시코드"
    WHEN '11' THEN '서울특별시' WHEN '26' THEN '부산광역시'
    WHEN '27' THEN '대구광역시' WHEN '28' THEN '인천광역시'
    WHEN '29' THEN '광주광역시' WHEN '30' THEN '대전광역시'
    WHEN '31' THEN '울산광역시' WHEN '36' THEN '세종특별자치시'
    WHEN '41' THEN '경기도' WHEN '42' THEN '강원도'
    WHEN '43' THEN '충청북도' WHEN '44' THEN '충청남도'
    WHEN '45' THEN '전라북도' WHEN '46' THEN '전라남도'
    WHEN '47' THEN '경상북도' WHEN '48' THEN '경상남도'
    WHEN '50' THEN '제주특별자치도' ELSE '기타'
  END AS "시도명"
- 지역 분석은 cln_m_cust_base_card 또는 cln_d_cust_mas_card 테이블의 자택광역도시코드 사용

### ★★ 슈퍼솔 테이블 용도 구분 (매우 중요)
- jaz_sh_fanclub_membership_chghist: 앱 **가입** 여부만 (new앱사용여부 Y/N). 이력 테이블.
  → "가입 고객수", "가입 여부" 질문에만 사용
- sol_m_supersol_visit: 앱 **이용** 빈도/횟수/체류시간 (월 집계)
  → "이용건수", "방문횟수", "MAU", "사용빈도", "접속빈도", "체류시간" 질문에 사용
- sol_d_supersol_session: 앱 세션 상세 (일별)
  → "일별 세션", "접속 시간대", "기기별" 질문에 사용
- ★★ "슈퍼솔 이용건수" = SUM("슈퍼솔월방문횟수") FROM sol_m_supersol_visit
- ★★ "슈퍼솔 MAU" = COUNT(DISTINCT "그룹md번호") FROM sol_m_supersol_visit WHERE "슈퍼솔월방문일수" > 0
- ★★ "슈퍼솔 사용 고객수" = COUNT(DISTINCT "그룹md번호") FROM sol_m_supersol_visit WHERE "슈퍼솔월방문일수" > 0
- ★★ jaz 테이블의 COUNT(*)를 "이용건수"라고 부르지 말 것 (그것은 이력변경건수일 뿐)
- ★★ "각사별" / "계열사별" MAU 분석:
  sol_m_supersol_visit에는 계열사 구분 컬럼이 없으므로, jaz_sh_fanclub_membership_chghist의
  "신한그룹통합플랫폼가입채널코드"를 JOIN하여 계열사 구분:
  SELECT s."기준년월",
    CASE j."신한그룹통합플랫폼가입채널코드"
      WHEN '01' THEN '신한은행' WHEN '02' THEN '신한카드'
      WHEN '03' THEN '신한투자증권' WHEN '04' THEN '신한생명'
      WHEN '05' THEN '신한캐피탈' ELSE '기타'
    END AS "계열사",
    COUNT(DISTINCT s."그룹md번호") AS "MAU"
  FROM ai_ready_v3.sol_m_supersol_visit s
  JOIN ai_ready_v3.jaz_sh_fanclub_membership_chghist j
    ON s."그룹md번호" = j."그룹md"
    AND j."처리일자" = (SELECT MAX("처리일자") FROM ai_ready_v3.jaz_sh_fanclub_membership_chghist)
  GROUP BY s."기준년월", j."신한그룹통합플랫폼가입채널코드"
  ORDER BY s."기준년월" DESC, "MAU" DESC
- ★★ jaz 조인 키 주의: jaz."그룹md" = sol."그룹md번호" (jaz는 "그룹md"이고 sol은 "그룹md번호")
- ★★ sol 실제 컬럼명: "슈퍼솔월방문일수", "슈퍼솔월방문횟수", "슈퍼솔월체류분", "슈퍼솔mau대상tf"
  (ontology에서는 월방문일수/월방문횟수로 단축했지만, 실제 SQL에는 "슈퍼솔월방문횟수" 사용)

### rpt_d_unit_deposit_acct 특이사항
- 고객번호가 CHAR(150)이므로 조인 시 rtrim 필수:
  ON rtrim(r."고객번호") = v."고객번호"

## 기간 기본값 규칙 (매우 중요)

- 사용자가 기간을 명시하지 않으면 "최근 1개월" 또는 "가장 최신 기준년월" 데이터를 사용
- 절대로 사용자에게 기간을 되물어보지 말 것 — 항상 최신 데이터로 바로 답변
- 예: "슈퍼솔 앱 사용 고객수 알려줘" → WHERE "기준년월" = (SELECT MAX("기준년월") FROM 해당테이블)
- 기간이 명시된 경우에만 해당 기간으로 필터링

## ★★ 테이블 선택 우선순위 (반드시 준수)

사용자 질문에 특정 계열사 언급이 없으면 아래 우선순위를 따라 범용 테이블 사용:
1. 연령대/성별/기본 고객속성 → igd_m_cust_base (통합 월별 기본)
2. 카드 거래 → igd_m_cust_txn_card (통합 카드 거래)
3. 슈퍼솔 MAU/방문 → sol_m_supersol_visit
4. 고객 마스터(고정) → igd_d_cust_mas

계열사별 테이블(cln_d_cust_mas_bank/card/life/sec 등)은:
- 사용자가 "카드회원", "은행고객", "생명보험" 등 특정 계열사를 명시했을 때만 사용
- "연령대별" 단독 요청에 신한생명(life)/증권(sec) 테이블 사용 금지
- 카드회원 관련 → cln_d_cust_mas_card 또는 cln_m_cust_base_card
- 은행 관련 → cln_d_cust_mas_bank 또는 cln_m_cust_base_bank

★★ 금지: 사용자가 계열사를 특정하지 않았는데 cln_*_life, cln_*_sec 등 선택

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
        system_prompt = """당신은 신한금융그룹의 데이터 분석 챗봇입니다.
SQL 쿼리 결과를 바탕으로 **채팅 형식**으로 간단히 답합니다.

★ 톤 & 형식 규칙:
- 채팅이므로 짧고 직관적으로. 리포트나 보고서 형식 금지.
- 핵심 숫자만 전달. 분석 코멘트/인사이트/해석은 1문장 이내로 짧게.
- **볼드**, 불릿(•/-) 남발 금지. 데이터가 3건 이하면 한 문장으로 답변.
- 4건 이상일 때만 간단한 목록 사용 (마크다운 테이블 금지).
- "~로 나타납니다", "~을 알 수 있습니다" 같은 리포트체 금지.
- 반말은 안 되지만, 간결한 존댓말 (해요체 OK): "~입니다", "~이에요", "~네요"

★ 데이터 규칙:
- 금액: 소수점 제외, 천원 단위 콤마 (1,234,567원)
- 연령구간코드 변환: 010→10대, 020→20대, 030→30대, 070→70대 이상
- 연령대는 반드시 오름차순(10대→20대→...→70대+)
- 결과가 비어있으면 "해당 데이터가 없어요"로 간단히
- SQL 쿼리 자체는 노출하지 않음

★ 길이 가이드:
- 단순 집계(1~2행): 1~2문장
- 중간(3~10행): 3~5문장 + 짧은 목록
- 많은 결과(10행+): 상위 5개 + "나머지는 테이블에서 확인하세요"
- 절대 10문장을 넘기지 마세요."""

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
