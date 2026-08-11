"""Mock Bedrock client for local development without AWS credentials.

Uses ontology-based heuristic SQL generation instead of Claude LLM calls.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, AsyncGenerator

logger = logging.getLogger(__name__)

# Query pattern -> SQL template mappings
_QUERY_TEMPLATES = {
    "그룹사별 고객": {
        "sql": (
            'SELECT "계열사코드", COUNT(DISTINCT "그룹md번호") as "고객수" '
            "FROM ai_ready_v2.igd_m_cust_holding_base "
            'GROUP BY "계열사코드" '
            'ORDER BY "고객수" DESC '
            "LIMIT 20"
        ),
        "explanation": "고객 보유 상품 현황 테이블에서 계열사별 고유 고객 수를 집계합니다.",
        "tables_used": ["igd_m_cust_holding_base"],
    },
    "연령대별 고객": {
        "sql": (
            'SELECT "고객연령대", COUNT(DISTINCT "그룹md번호") as "고객수", '
            'ROUND(COUNT(DISTINCT "그룹md번호") * 100.0 / SUM(COUNT(DISTINCT "그룹md번호")) OVER(), 1) as "비율" '
            "FROM ai_ready_v2.igd_m_cust_base "
            'GROUP BY "고객연령대" '
            'ORDER BY "고객연령대" '
            "LIMIT 20"
        ),
        "explanation": "그룹 통합 고객 월간 기본 테이블에서 연령대별 고객 수와 비율을 산출합니다.",
        "tables_used": ["igd_m_cust_base"],
    },
    "카드 거래 금액 상위": {
        "sql": (
            'SELECT "그룹md번호", SUM("이용금액") as "총이용금액", '
            'COUNT(*) as "거래건수", AVG("이용금액") as "평균이용금액" '
            "FROM ai_ready_v2.igd_m_cust_txn_card "
            'GROUP BY "그룹md번호" '
            'ORDER BY "총이용금액" DESC '
            "LIMIT 10"
        ),
        "explanation": "카드 거래 테이블에서 이용금액 합계 기준 상위 10명의 고객을 조회합니다.",
        "tables_used": ["igd_m_cust_txn_card"],
    },
    "동시 보유 고객": {
        "sql": (
            "SELECT COUNT(DISTINCT a.\"그룹md번호\") as \"동시보유고객수\" "
            "FROM ai_ready_v2.cln_m_cust_base_bank a "
            "INNER JOIN ai_ready_v2.cln_m_cust_base_card b "
            "ON a.\"그룹md번호\" = b.\"그룹md번호\" "
            "LIMIT 1000"
        ),
        "explanation": "은행과 카드 고객 테이블을 조인하여 동시 보유 고객 수를 산출합니다.",
        "tables_used": ["cln_m_cust_base_bank", "cln_m_cust_base_card"],
    },
    "월간 매출": {
        "sql": (
            'SELECT "기준년월", SUM("이용금액") as "월매출", '
            'COUNT(DISTINCT "그룹md번호") as "이용고객수", '
            'COUNT(*) as "거래건수" '
            "FROM ai_ready_v2.igd_m_cust_txn_card "
            'GROUP BY "기준년월" '
            'ORDER BY "기준년월" DESC '
            "LIMIT 12"
        ),
        "explanation": "카드 거래 테이블에서 월별 매출 추이를 집계합니다.",
        "tables_used": ["igd_m_cust_txn_card"],
    },
    "가맹점": {
        "sql": (
            'SELECT "가맹점명", "업종대분류", SUM("이용금액") as "총매출", '
            'COUNT(*) as "거래건수", COUNT(DISTINCT "그룹md번호") as "이용고객수" '
            "FROM ai_ready_v2.trs_m_merchant_delivery "
            'GROUP BY "가맹점명", "업종대분류" '
            'ORDER BY "총매출" DESC '
            "LIMIT 20"
        ),
        "explanation": "배달 가맹점 거래 테이블에서 가맹점별 매출 현황을 조회합니다.",
        "tables_used": ["trs_m_merchant_delivery"],
    },
    "고객 수": {
        "sql": (
            'SELECT COUNT(DISTINCT "그룹md번호") as "전체고객수", '
            'COUNT(DISTINCT CASE WHEN "성별구분코드" = \'M\' THEN "그룹md번호" END) as "남성고객수", '
            'COUNT(DISTINCT CASE WHEN "성별구분코드" = \'F\' THEN "그룹md번호" END) as "여성고객수" '
            "FROM ai_ready_v2.igd_d_cust_mas "
            "LIMIT 1000"
        ),
        "explanation": "그룹 통합 고객 마스터에서 전체 고객 수를 성별로 집계합니다.",
        "tables_used": ["igd_d_cust_mas"],
    },
}

# Mock result data corresponding to each query pattern
_MOCK_RESULTS = {
    "그룹사별 고객": {
        "columns": ["계열사코드", "고객수"],
        "rows": [
            {"계열사코드": "신한은행", "고객수": "12847352"},
            {"계열사코드": "신한카드", "고객수": "9523841"},
            {"계열사코드": "신한생명", "고객수": "4215673"},
            {"계열사코드": "신한투자증권", "고객수": "2847291"},
            {"계열사코드": "신한캐피탈", "고객수": "1523847"},
            {"계열사코드": "제주은행", "고객수": "847291"},
        ],
    },
    "연령대별 고객": {
        "columns": ["고객연령대", "고객수", "비율"],
        "rows": [
            {"고객연령대": "20대", "고객수": "3214587", "비율": "15.2"},
            {"고객연령대": "30대", "고객수": "5128743", "비율": "24.3"},
            {"고객연령대": "40대", "고객수": "4987234", "비율": "23.6"},
            {"고객연령대": "50대", "고객수": "4125893", "비율": "19.5"},
            {"고객연령대": "60대", "고객수": "2547891", "비율": "12.1"},
            {"고객연령대": "70대 이상", "고객수": "1123456", "비율": "5.3"},
        ],
    },
    "카드 거래 금액 상위": {
        "columns": ["그룹md번호", "총이용금액", "거래건수", "평균이용금액"],
        "rows": [
            {"그룹md번호": "MD00128473", "총이용금액": "487523100", "거래건수": "342", "평균이용금액": "1425506"},
            {"그룹md번호": "MD00295841", "총이용금액": "412847500", "거래건수": "287", "평균이용금액": "1438570"},
            {"그룹md번호": "MD00384721", "총이용금액": "389125000", "거래건수": "256", "평균이용금액": "1520019"},
            {"그룹md번호": "MD00412583", "총이용금액": "345982100", "거래건수": "412", "평균이용금액": "839763"},
            {"그룹md번호": "MD00528471", "총이용금액": "312457800", "거래건수": "198", "평균이용금액": "1578070"},
            {"그룹md번호": "MD00614823", "총이용금액": "298741200", "거래건수": "267", "평균이용금액": "1118878"},
            {"그룹md번호": "MD00725841", "총이용금액": "276584300", "거래건수": "312", "평균이용금액": "886488"},
            {"그룹md번호": "MD00831254", "총이용금액": "254128700", "거래건수": "189", "평균이용금액": "1344598"},
            {"그룹md번호": "MD00918472", "총이용금액": "241852300", "거래건수": "234", "평균이용금액": "1033557"},
            {"그룹md번호": "MD01024581", "총이용금액": "228471500", "거래건수": "176", "평균이용금액": "1298134"},
        ],
    },
    "동시 보유 고객": {
        "columns": ["동시보유고객수"],
        "rows": [{"동시보유고객수": "7284531"}],
    },
    "월간 매출": {
        "columns": ["기준년월", "월매출", "이용고객수", "거래건수"],
        "rows": [
            {"기준년월": "202607", "월매출": "15847523100", "이용고객수": "4521873", "거래건수": "28475123"},
            {"기준년월": "202606", "월매출": "14925841200", "이용고객수": "4387291", "거래건수": "27128453"},
            {"기준년월": "202605", "월매출": "15284713500", "이용고객수": "4498721", "거래건수": "28012847"},
            {"기준년월": "202604", "월매출": "14128473200", "이용고객수": "4215873", "거래건수": "26584721"},
            {"기준년월": "202603", "월매출": "13847521800", "이용고객수": "4128453", "거래건수": "25847123"},
            {"기준년월": "202602", "월매출": "12584712300", "이용고객수": "3987254", "거래건수": "24125847"},
        ],
    },
    "가맹점": {
        "columns": ["가맹점명", "업종대분류", "총매출", "거래건수", "이용고객수"],
        "rows": [
            {"가맹점명": "배달의민족", "업종대분류": "음식배달", "총매출": "8475231000", "거래건수": "12847523", "이용고객수": "3214587"},
            {"가맹점명": "쿠팡이츠", "업종대분류": "음식배달", "총매출": "5284712000", "거래건수": "8475123", "이용고객수": "2547891"},
            {"가맹점명": "요기요", "업종대분류": "음식배달", "총매출": "3847521000", "거래건수": "6214587", "이용고객수": "1987234"},
            {"가맹점명": "마켓컬리", "업종대분류": "식품/마트", "총매출": "2847123000", "거래건수": "4521873", "이용고객수": "1524873"},
            {"가맹점명": "쿠팡", "업종대분류": "종합쇼핑", "총매출": "12584712000", "거래건수": "15847231", "이용고객수": "4128453"},
        ],
    },
    "고객 수": {
        "columns": ["전체고객수", "남성고객수", "여성고객수"],
        "rows": [{"전체고객수": "21127804", "남성고객수": "10847291", "여성고객수": "10280513"}],
    },
}


class MockBedrockClient:
    """Mock Bedrock client for local development."""

    def __init__(self, **kwargs: Any) -> None:
        logger.info("MockBedrockClient initialized (LOCAL_DEV mode)")

    async def invoke(
        self,
        messages: list[dict[str, Any]],
        system: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        stop_sequences: list[str] | None = None,
    ) -> str:
        user_msg = ""
        for m in messages:
            if m.get("role") == "user":
                user_msg = m.get("content", "")

        if system and "intent classifier" in system.lower():
            return self._mock_intent(user_msg)
        elif system and "sql generation" in system.lower():
            return self._mock_sql(user_msg)
        elif system and "data analyst" in system.lower():
            return self._mock_answer(user_msg)
        return self._mock_answer(user_msg)

    async def invoke_streaming(
        self,
        messages: list[dict[str, Any]],
        system: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
    ) -> AsyncGenerator[str, None]:
        result = await self.invoke(messages, system, temperature, max_tokens)
        yield result

    async def classify_intent(self, query: str) -> dict[str, Any]:
        return json.loads(self._mock_intent(query))

    async def generate_sql(
        self,
        query: str,
        context: str,
        examples: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        template = self._find_matching_template(query)
        if template:
            return {
                "sql": template["sql"],
                "explanation": template["explanation"],
                "tables_used": template["tables_used"],
                "confidence": 0.85,
                "assumptions": ["로컬 개발 모드 - 규칙 기반 SQL 생성"],
            }
        return self._generate_fallback_sql(query, context)

    async def compose_answer(
        self,
        query: str,
        sql: str,
        results: dict[str, Any],
        context: str | None = None,
    ) -> str:
        return self._compose_mock_answer(query, results)

    async def health_check(self) -> bool:
        return True

    def _mock_intent(self, query: str) -> str:
        intent = "data_query"
        requires_sql = True
        domain_hint = "customer"

        greetings = ["안녕", "하이", "헬로", "hello"]
        if any(query.strip().startswith(g) for g in greetings):
            intent = "greeting"
            requires_sql = False
            domain_hint = None

        if any(k in query for k in ["거래", "결제", "이용", "매출"]):
            domain_hint = "transaction"
        elif any(k in query for k in ["가맹점", "업종", "배달"]):
            domain_hint = "merchant"
        elif any(k in query for k in ["상품", "카드", "보험"]):
            domain_hint = "product"

        return json.dumps({
            "intent": intent,
            "confidence": 0.9,
            "entities": [],
            "requires_sql": requires_sql,
            "domain_hint": domain_hint,
        })

    def _mock_sql(self, query: str) -> str:
        template = self._find_matching_template(query)
        if template:
            return json.dumps({
                "sql": template["sql"],
                "explanation": template["explanation"],
                "tables_used": template["tables_used"],
                "confidence": 0.85,
                "assumptions": [],
            }, ensure_ascii=False)
        return json.dumps(self._generate_fallback_sql(query, ""), ensure_ascii=False)

    def _find_matching_template(self, query: str) -> dict | None:
        for pattern, template in _QUERY_TEMPLATES.items():
            if pattern in query:
                return template
        return None

    def _generate_fallback_sql(self, query: str, context: str) -> dict[str, Any]:
        if any(k in query for k in ["거래", "결제", "이용금액", "매출"]):
            table = "igd_m_cust_txn_card"
            return {
                "sql": f'SELECT "기준년월", COUNT(*) as "건수", SUM("이용금액") as "총이용금액" FROM ai_ready_v2.{table} GROUP BY "기준년월" ORDER BY "기준년월" DESC LIMIT 12',
                "explanation": "카드 거래 테이블에서 월별 거래 현황을 조회합니다.",
                "tables_used": [table],
                "confidence": 0.7,
                "assumptions": ["기본 카드 거래 테이블 사용"],
            }
        elif any(k in query for k in ["고객", "회원", "연령", "성별"]):
            table = "igd_d_cust_mas"
            return {
                "sql": f'SELECT COUNT(DISTINCT "그룹md번호") as "고객수" FROM ai_ready_v2.{table} LIMIT 1000',
                "explanation": "그룹 통합 고객 마스터에서 고객 정보를 조회합니다.",
                "tables_used": [table],
                "confidence": 0.7,
                "assumptions": ["기본 고객 마스터 테이블 사용"],
            }
        else:
            return {
                "sql": 'SELECT COUNT(DISTINCT "그룹md번호") as "고객수" FROM ai_ready_v2.igd_d_cust_mas LIMIT 1000',
                "explanation": "기본 고객 수를 조회합니다.",
                "tables_used": ["igd_d_cust_mas"],
                "confidence": 0.5,
                "assumptions": ["질의 패턴 미매칭 - 기본 쿼리 사용"],
            }

    def _mock_answer(self, query: str) -> str:
        return "조회 결과를 분석했습니다."

    def _compose_mock_answer(self, query: str, results: dict[str, Any]) -> str:
        rows = results.get("rows", [])
        columns = results.get("columns", [])
        row_count = results.get("row_count", len(rows))

        if not rows:
            return "조회 결과가 없습니다. 조건을 변경하여 다시 시도해 주세요."

        lines = []

        if row_count == 1 and len(columns) <= 5:
            row = rows[0]
            lines.append("조회 결과입니다.\n")
            for col in columns:
                val = row.get(col, "")
                try:
                    num = int(val)
                    lines.append(f"- **{col}**: {num:,}명")
                except (ValueError, TypeError):
                    lines.append(f"- **{col}**: {val}")
        else:
            lines.append(f"총 **{row_count:,}건**의 결과를 조회했습니다.\n")

            # Find numeric columns for stats
            numeric_col = None
            for col in columns[1:]:
                try:
                    int(rows[0].get(col, ""))
                    numeric_col = col
                    break
                except (ValueError, TypeError):
                    continue

            for i, row in enumerate(rows[:10]):
                parts = []
                for col in columns[:4]:
                    val = row.get(col, "")
                    try:
                        num = int(val)
                        parts.append(f"{col}: {num:,}")
                    except (ValueError, TypeError):
                        parts.append(f"{col}: {val}")
                lines.append(f"  {i+1}. {', '.join(parts)}")
            if row_count > 10:
                lines.append(f"\n  ... 외 {row_count - 10:,}건")

            # Add statistical summary
            if numeric_col and len(rows) > 1:
                values = []
                for row in rows:
                    try:
                        values.append(int(row.get(numeric_col, 0)))
                    except (ValueError, TypeError):
                        pass
                if values:
                    total = sum(values)
                    avg = total // len(values)
                    max_val = max(values)
                    min_val = min(values)
                    lines.append(f"\n📊 **통계 요약** ({numeric_col} 기준)")
                    lines.append(f"  - 합계: {total:,}")
                    lines.append(f"  - 평균: {avg:,}")
                    lines.append(f"  - 최대: {max_val:,}")
                    lines.append(f"  - 최소: {min_val:,}")

        return "\n".join(lines)


class MockAthenaClient:
    """Mock Athena client for local development."""

    def __init__(self, **kwargs: Any) -> None:
        logger.info("MockAthenaClient initialized (LOCAL_DEV mode)")

    def validate_sql(self, sql: str) -> None:
        stripped = sql.strip().upper()
        if not (stripped.startswith("SELECT") or stripped.startswith("WITH")):
            from app.services.athena_client import SQLSafetyError
            raise SQLSafetyError("Query must begin with SELECT or WITH clause.")

    async def execute_query(
        self, sql: str, max_rows: int | None = None
    ) -> dict[str, Any]:
        self.validate_sql(sql)
        mock_data = self._find_mock_data(sql)
        return {
            "sql": sql,
            "columns": mock_data["columns"],
            "rows": mock_data["rows"],
            "row_count": len(mock_data["rows"]),
            "truncated": False,
            "execution_time_ms": 245,
            "error": None,
        }

    def _find_mock_data(self, sql: str) -> dict[str, Any]:
        sql_lower = sql.lower()

        if "holding" in sql_lower or "계열사" in sql:
            return _MOCK_RESULTS["그룹사별 고객"]
        elif "연령" in sql or "고객연령대" in sql:
            return _MOCK_RESULTS["연령대별 고객"]
        elif "join" in sql_lower and "bank" in sql_lower and "card" in sql_lower:
            return _MOCK_RESULTS["동시 보유 고객"]
        elif "이용금액" in sql and "desc" in sql_lower and "그룹md번호" in sql:
            return _MOCK_RESULTS["카드 거래 금액 상위"]
        elif "기준년월" in sql and "sum" in sql_lower:
            return _MOCK_RESULTS["월간 매출"]
        elif "merchant" in sql_lower or "가맹점" in sql:
            return _MOCK_RESULTS["가맹점"]
        elif "count" in sql_lower and "cust_mas" in sql_lower:
            return _MOCK_RESULTS["고객 수"]
        else:
            return _MOCK_RESULTS["고객 수"]

    def _extract_context(self, sql: str) -> list[str]:
        return re.findall(r'"([^"]+)"', sql)

    async def health_check(self) -> bool:
        return True
