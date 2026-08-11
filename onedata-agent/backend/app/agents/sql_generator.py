"""SQL generation agent.

Generates Athena-compatible SQL queries from natural language,
using ontology context (table schemas, relationships, column descriptions)
and the Bedrock Converse API with forced tool schema for reliable structured output.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from app.models.ontology import OntologyContext
from app.ontology.loader import OntologyLoader
from app.ontology.mapper import OntologyMapper
from app.services.bedrock_client import BedrockClient, BedrockError
from app.services.opensearch_client import OpenSearchClient, OpenSearchError

logger = logging.getLogger(__name__)

_FEW_SHOT_EXAMPLES = [
    {
        "question": "최근 3개월간 카드 이용 건수가 가장 많은 고객 상위 10명을 알려줘",
        "answer": {
            "sql": (
                "SELECT\n"
                '  "그룹md번호",\n'
                '  COUNT(*) AS "이용건수"\n'
                "FROM ai_ready_v2.igd_m_cust_txn_card\n"
                "WHERE \"기준년월\" >= date_format(date_add('month', -3, current_date), '%Y%m')\n"
                'GROUP BY "그룹md번호"\n'
                'ORDER BY "이용건수" DESC\n'
                "LIMIT 10"
            ),
            "explanation": "카드 거래 테이블에서 최근 3개월 기준으로 고객별 이용 건수를 집계하여 상위 10명을 조회합니다.",
            "tables_used": ["igd_m_cust_txn_card"],
        },
    },
    {
        "question": "30대 여성 고객의 온라인 쇼핑 평균 결제금액은?",
        "answer": {
            "sql": (
                "SELECT\n"
                '  AVG(t."이용금액") AS "평균결제금액"\n'
                "FROM ai_ready_v2.igd_m_cust_txn_card t\n"
                "JOIN ai_ready_v2.igd_m_cust_base c\n"
                '  ON t."그룹md번호" = c."그룹md번호"\n'
                "WHERE c.\"연령대\" = '30대'\n"
                "  AND c.\"성별\" = 'F'\n"
                "  AND t.\"업종대분류\" = '온라인쇼핑'\n"
                "LIMIT 1000"
            ),
            "explanation": "고객 기본 테이블과 카드 거래 테이블을 조인하여 30대 여성의 온라인쇼핑 평균 결제금액을 계산합니다.",
            "tables_used": ["igd_m_cust_txn_card", "igd_m_cust_base"],
        },
    },
    {
        "question": "위 결과를 연령대별로 분석해줘",
        "answer": {
            "sql": (
                "SELECT\n"
                '  c."연령대",\n'
                '  COUNT(*) AS "이용건수",\n'
                '  SUM(t."이용금액") AS "총이용금액",\n'
                '  AVG(t."이용금액") AS "평균이용금액"\n'
                "FROM ai_ready_v2.igd_m_cust_txn_card t\n"
                "JOIN ai_ready_v2.igd_m_cust_base c\n"
                '  ON t."그룹md번호" = c."그룹md번호"\n'
                'GROUP BY c."연령대"\n'
                'ORDER BY "총이용금액" DESC\n'
                "LIMIT 20"
            ),
            "explanation": "연령대별 카드 이용 건수와 금액을 분석합니다.",
            "tables_used": ["igd_m_cust_txn_card", "igd_m_cust_base"],
        },
    },
    {
        "question": "위 결과를 성별로 비교해줘",
        "answer": {
            "sql": (
                "SELECT\n"
                '  c."성별",\n'
                '  COUNT(*) AS "이용건수",\n'
                '  SUM(t."이용금액") AS "총이용금액",\n'
                '  AVG(t."이용금액") AS "평균이용금액"\n'
                "FROM ai_ready_v2.igd_m_cust_txn_card t\n"
                "JOIN ai_ready_v2.igd_m_cust_base c\n"
                '  ON t."그룹md번호" = c."그룹md번호"\n'
                'GROUP BY c."성별"\n'
                'ORDER BY "총이용금액" DESC\n'
                "LIMIT 10"
            ),
            "explanation": "성별로 카드 이용 패턴을 비교합니다.",
            "tables_used": ["igd_m_cust_txn_card", "igd_m_cust_base"],
        },
    },
    {
        "question": "위 결과를 월별 추이로 보여줘",
        "answer": {
            "sql": (
                "SELECT\n"
                '  "기준년월",\n'
                '  COUNT(*) AS "이용건수",\n'
                '  SUM("이용금액") AS "총이용금액"\n'
                "FROM ai_ready_v2.igd_m_cust_txn_card\n"
                "WHERE \"기준년월\" >= date_format(date_add('month', -6, current_date), '%Y%m')\n"
                'GROUP BY "기준년월"\n'
                'ORDER BY "기준년월"\n'
                "LIMIT 12"
            ),
            "explanation": "최근 6개월간 월별 카드 이용 추이를 보여줍니다.",
            "tables_used": ["igd_m_cust_txn_card"],
        },
    },
    {
        "question": "슈퍼솔 사용 상위 10% 고객의 카드 이용금액과 은행 수신평잔을 보여줘",
        "answer": {
            "sql": (
                "WITH sol_usage AS (\n"
                "  SELECT\n"
                '    "그룹md",\n'
                '    COUNT(*) AS usage_cnt\n'
                "  FROM ai_ready_v2.jaz_sh_fanclub_membership_chghist\n"
                "  WHERE \"new앱사용여부\" = 'Y'  -- 값: Y/N 문자열\n"
                '  GROUP BY "그룹md"\n'
                "),\n"
                "sol_threshold AS (\n"
                "  SELECT approx_percentile(usage_cnt, 0.9) AS threshold\n"
                "  FROM sol_usage\n"
                "),\n"
                "top_users AS (\n"
                "  SELECT u.\"그룹md\"\n"
                "  FROM sol_usage u\n"
                "  CROSS JOIN sol_threshold t\n"
                "  WHERE u.usage_cnt >= t.threshold\n"
                ")\n"
                "SELECT\n"
                '  AVG(c."신용신판이용금액") AS "평균카드이용금액",\n'
                '  AVG(c."체크카드이용금액") AS "평균체크이용금액",\n'
                '  AVG(r."신한은행6개월수신평균잔액") AS "평균은행수신평잔"\n'
                "FROM top_users t\n"
                "JOIN ai_ready_v2.igd_m_cust_txn_card c\n"
                '  ON t."그룹md" = c."그룹md번호"\n'
                "LEFT JOIN ai_ready_v2.igd_m_shg_rfm_base_ledger r\n"
                '  ON t."그룹md" = r."그룹md번호"\n'
                "LIMIT 1000"
            ),
            "explanation": "슈퍼솔 사용 빈도 상위 10% 고객을 추출하고, 해당 고객의 평균 카드 이용금액과 은행 수신평잔을 조회합니다.",
            "tables_used": ["jaz_sh_fanclub_membership_chghist", "igd_m_cust_txn_card", "igd_m_shg_rfm_base_ledger"],
        },
    },
]


class SQLGenerationResult:
    """Result of SQL generation."""

    def __init__(
        self,
        sql: str,
        explanation: str,
        tables_used: list[str],
        confidence: float,
        assumptions: list[str] | None = None,
    ) -> None:
        self.sql = sql
        self.explanation = explanation
        self.tables_used = tables_used
        self.confidence = confidence
        self.assumptions = assumptions or []

    def to_dict(self) -> dict[str, Any]:
        return {
            "sql": self.sql,
            "explanation": self.explanation,
            "tables_used": self.tables_used,
            "confidence": self.confidence,
            "assumptions": self.assumptions,
        }


class SQLGenerator:
    """Generates SQL from natural language queries with ontology context."""

    def __init__(
        self,
        bedrock_client: BedrockClient,
        ontology_loader: OntologyLoader,
        ontology_mapper: OntologyMapper,
        opensearch_client: OpenSearchClient | None = None,
    ) -> None:
        self._bedrock = bedrock_client
        self._ontology = ontology_loader
        self._mapper = ontology_mapper
        self._opensearch = opensearch_client

    async def generate(
        self, query: str, domain_hint: str | None = None, conversation_context: str | None = None
    ) -> SQLGenerationResult:
        """Generate SQL for a natural language query.

        Pipeline:
        1. Resolve synonyms in the query
        2. Search for relevant tables (OpenSearch + mapper)
        3. Build ontology context
        4. Generate SQL via LLM (Converse API with forced tool schema)
        """
        resolved_terms = self._mapper.resolve_terms_in_query(query)
        logger.info("Resolved %d terms from query", len(resolved_terms))

        relevant_tables = await self._find_relevant_tables(query, domain_hint, resolved_terms)
        logger.info("Found %d relevant tables", len(relevant_tables))

        if not relevant_tables:
            if domain_hint:
                relevant_tables = [
                    t.table_name for t in self._ontology.get_tables_by_domain(domain_hint)
                ]
            if not relevant_tables:
                relevant_tables = [
                    "igd_m_cust_base",
                    "igd_m_cust_txn_card",
                    "igd_d_cust_mas",
                ]

        context = self._ontology.build_context(relevant_tables)
        context_str = self._ontology.format_context_for_prompt(context)

        if resolved_terms:
            synonym_context = "\n\n=== 용어 매핑 ===\n"
            for term_info in resolved_terms:
                synonym_context += (
                    f"  '{term_info['term']}' → "
                    f"컬럼: {term_info['column_name']} "
                    f"(테이블: {term_info['table_name']})\n"
                )
            context_str += synonym_context

        if conversation_context:
            context_str += f"\n\n=== 대화 이력 (드릴다운 컨텍스트) ===\n{conversation_context}\n"
            context_str += (
                "\n★ 드릴다운 규칙: '위 결과를 X별로' 형태의 질문이면 "
                "이전 쿼리를 기반으로 GROUP BY에 X 차원을 추가하세요. "
                "각 차원에 맞는 컬럼을 사용:\n"
                "  - 연령대별 → c.\"연령대\" (igd_m_cust_base JOIN 필요)\n"
                "  - 성별 → c.\"성별\" (igd_m_cust_base JOIN 필요)\n"
                "  - 계열사별 → \"계열사명\" 또는 \"계열사코드\"\n"
                "  - 월별/추이 → \"기준년월\" GROUP BY + ORDER BY\n"
            )

        try:
            result = await self._bedrock.generate_sql(
                query=query,
                context=context_str,
                examples=_FEW_SHOT_EXAMPLES,
            )

            sql = result.get("sql", "")
            sql = self._ensure_database_prefix(sql)

            return SQLGenerationResult(
                sql=sql,
                explanation=result.get("explanation", ""),
                tables_used=result.get("tables_used", relevant_tables),
                confidence=result.get("confidence", 0.7),
                assumptions=result.get("assumptions", []),
            )
        except BedrockError as e:
            logger.error("SQL generation failed: %s", e)
            raise

    async def _find_relevant_tables(
        self,
        query: str,
        domain_hint: str | None,
        resolved_terms: list[dict[str, Any]],
    ) -> list[str]:
        """Find tables relevant to the query using multiple strategies."""
        tables: set[str] = set()

        for term in resolved_terms:
            if term.get("table_name"):
                tables.add(term["table_name"])

        all_tables = self._ontology.get_all_tables()
        mapper_suggestions = self._mapper.suggest_tables(query, all_tables)
        tables.update(mapper_suggestions)

        if self._opensearch:
            try:
                search_results = await self._opensearch.search_tables(query, top_k=5)
                for result in search_results:
                    if result.get("score", 0) > 1.0:
                        tables.add(result["table_name"])
            except OpenSearchError as e:
                logger.warning("OpenSearch table search failed: %s", e)

        if domain_hint and len(tables) < 3:
            domain_tables = self._ontology.get_tables_by_domain(domain_hint)
            for t in domain_tables[:5]:
                tables.add(t.table_name)

        return list(tables)

    def _ensure_database_prefix(self, sql: str) -> str:
        """Ensure all table references include the database prefix."""
        db = "ai_ready_v2"
        all_table_names = [t.table_name for t in self._ontology.get_all_tables()]
        for table_name in all_table_names:
            pattern = rf"(?<!\w)(?<!\.){re.escape(table_name)}(?!\w)"
            replacement = f"{db}.{table_name}"
            if f"{db}.{table_name}" not in sql:
                sql = re.sub(pattern, replacement, sql)
        return sql

    async def validate_sql(self, sql: str) -> dict[str, Any]:
        """Validate generated SQL for common issues."""
        issues = []
        suggestions = []

        stripped = sql.strip().upper()
        if not (stripped.startswith("SELECT") or stripped.startswith("WITH")):
            issues.append("Query does not start with SELECT or WITH")

        if not re.search(r"\bLIMIT\s+\d+", sql, re.IGNORECASE):
            issues.append("Missing LIMIT clause")
            suggestions.append("Add LIMIT 1000 to prevent excessive results")

        if "ai_ready_v2." not in sql:
            issues.append("Tables may be missing database prefix 'ai_ready_v2.'")

        if re.search(r"\b(SUM|AVG|COUNT|MIN|MAX)\s*\(", sql, re.IGNORECASE):
            if not re.search(r"\bGROUP\s+BY\b", sql, re.IGNORECASE):
                select_match = re.search(
                    r"SELECT\s+(.+?)\s+FROM", sql, re.IGNORECASE | re.DOTALL
                )
                if select_match:
                    select_clause = select_match.group(1)
                    if "," in select_clause:
                        issues.append(
                            "Aggregation functions used with multiple columns but no GROUP BY"
                        )

        return {
            "valid": len(issues) == 0,
            "issues": issues,
            "suggestions": suggestions,
        }
