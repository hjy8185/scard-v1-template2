"""SQL generation agent.

Generates Athena-compatible SQL queries from natural language,
using ontology context (table schemas, relationships, column descriptions)
to improve accuracy.
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

# Few-shot examples for SQL generation
_FEW_SHOT_EXAMPLES = [
    {
        "question": "최근 3개월간 카드 이용 건수가 가장 많은 고객 상위 10명을 알려줘",
        "answer": {
            "sql": (
                "SELECT 그룹md번호, COUNT(*) as 이용건수 "
                "FROM ai_ready_v2.igd_m_cust_txn_card "
                "WHERE 기준년월 >= date_format(date_add('month', -3, current_date), '%Y%m') "
                "GROUP BY 그룹md번호 "
                "ORDER BY 이용건수 DESC "
                "LIMIT 10"
            ),
            "explanation": "카드 거래 테이블에서 최근 3개월 기준으로 고객별 이용 건수를 집계하여 상위 10명을 조회합니다.",
            "tables_used": ["igd_m_cust_txn_card"],
            "confidence": 0.9,
            "assumptions": ["기준년월 컬럼으로 최근 3개월 필터링"],
        },
    },
    {
        "question": "30대 여성 고객의 온라인 쇼핑 평균 결제금액은?",
        "answer": {
            "sql": (
                "SELECT AVG(t.이용금액) as 평균결제금액 "
                "FROM ai_ready_v2.igd_m_cust_txn_card t "
                "JOIN ai_ready_v2.igd_m_cust_base c ON t.그룹md번호 = c.그룹md번호 "
                "WHERE c.연령대 = '30대' AND c.성별 = 'F' "
                "AND t.업종대분류 = '온라인쇼핑' "
                "LIMIT 1000"
            ),
            "explanation": "고객 기본 테이블과 카드 거래 테이블을 조인하여 30대 여성의 온라인쇼핑 평균 결제금액을 계산합니다.",
            "tables_used": ["igd_m_cust_txn_card", "igd_m_cust_base"],
            "confidence": 0.85,
            "assumptions": ["성별 코드 'F'가 여성을 의미", "업종대분류에 '온라인쇼핑' 값 존재"],
        },
    },
    {
        "question": "가맹점별 월간 매출 추이를 보여줘",
        "answer": {
            "sql": (
                "SELECT 가맹점명, 기준년월, SUM(이용금액) as 월매출 "
                "FROM ai_ready_v2.trs_m_merchant_delivery "
                "WHERE 기준년월 >= date_format(date_add('month', -6, current_date), '%Y%m') "
                "GROUP BY 가맹점명, 기준년월 "
                "ORDER BY 가맹점명, 기준년월 "
                "LIMIT 1000"
            ),
            "explanation": "배달 가맹점 테이블에서 최근 6개월간 가맹점별 월간 매출을 집계합니다.",
            "tables_used": ["trs_m_merchant_delivery"],
            "confidence": 0.8,
            "assumptions": ["최근 6개월 기준", "배달 가맹점 매출 기준"],
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
        self, query: str, domain_hint: str | None = None
    ) -> SQLGenerationResult:
        """Generate SQL for a natural language query.

        Pipeline:
        1. Resolve synonyms in the query
        2. Search for relevant tables (OpenSearch + mapper)
        3. Build ontology context
        4. Generate SQL via LLM

        Args:
            query: User's natural language question.
            domain_hint: Optional domain hint from intent classification.

        Returns:
            SQLGenerationResult with the generated SQL and metadata.
        """
        # Step 1: Resolve synonyms
        resolved_terms = self._mapper.resolve_terms_in_query(query)
        logger.info("Resolved %d terms from query", len(resolved_terms))

        # Step 2: Find relevant tables
        relevant_tables = await self._find_relevant_tables(query, domain_hint, resolved_terms)
        logger.info("Found %d relevant tables", len(relevant_tables))

        if not relevant_tables:
            # Fallback: use all tables from the hinted domain
            if domain_hint:
                relevant_tables = [
                    t.table_name for t in self._ontology.get_tables_by_domain(domain_hint)
                ]
            if not relevant_tables:
                # Last resort: provide a minimal set of common tables
                relevant_tables = [
                    "igd_m_cust_base",
                    "igd_m_cust_txn_card",
                    "igd_d_cust_mas",
                ]

        # Step 3: Build ontology context
        context = self._ontology.build_context(relevant_tables)
        context_str = self._ontology.format_context_for_prompt(context)

        # Add resolved synonyms to context
        if resolved_terms:
            synonym_context = "\n\n=== TERM MAPPINGS ===\n"
            for term_info in resolved_terms:
                synonym_context += (
                    f"  '{term_info['term']}' → "
                    f"컬럼: {term_info['column_name']} "
                    f"(테이블: {term_info['table_name']})\n"
                )
            context_str += synonym_context

        # Step 4: Generate SQL via LLM
        try:
            result = await self._bedrock.generate_sql(
                query=query,
                context=context_str,
                examples=_FEW_SHOT_EXAMPLES,
            )

            sql = result.get("sql", "")
            # Post-process: ensure database prefix
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

        # From resolved synonyms
        for term in resolved_terms:
            if term.get("table_name"):
                tables.add(term["table_name"])

        # From ontology mapper
        all_tables = self._ontology.get_all_tables()
        mapper_suggestions = self._mapper.suggest_tables(query, all_tables)
        tables.update(mapper_suggestions)

        # From OpenSearch (if available)
        if self._opensearch:
            try:
                search_results = await self._opensearch.search_tables(query, top_k=5)
                for result in search_results:
                    if result.get("score", 0) > 1.0:  # Relevance threshold
                        tables.add(result["table_name"])
            except OpenSearchError as e:
                logger.warning("OpenSearch table search failed: %s", e)

        # From domain hint
        if domain_hint and len(tables) < 3:
            domain_tables = self._ontology.get_tables_by_domain(domain_hint)
            for t in domain_tables[:5]:
                tables.add(t.table_name)

        return list(tables)

    def _ensure_database_prefix(self, sql: str) -> str:
        """Ensure all table references include the database prefix."""
        db = "ai_ready_v2"
        # Find table names that don't have the prefix
        all_table_names = [t.table_name for t in self._ontology.get_all_tables()]
        for table_name in all_table_names:
            # Replace bare table names with fully qualified names
            # But only if not already prefixed
            pattern = rf"(?<!\w)(?<!\.){re.escape(table_name)}(?!\w)"
            replacement = f"{db}.{table_name}"
            # Avoid double-prefixing
            if f"{db}.{table_name}" not in sql:
                sql = re.sub(pattern, replacement, sql)
        return sql

    async def validate_sql(self, sql: str) -> dict[str, Any]:
        """Validate generated SQL for common issues.

        Returns dict with: valid, issues, suggestions
        """
        issues = []
        suggestions = []

        # Check for SELECT only
        stripped = sql.strip().upper()
        if not (stripped.startswith("SELECT") or stripped.startswith("WITH")):
            issues.append("Query does not start with SELECT or WITH")

        # Check for LIMIT
        if not re.search(r"\bLIMIT\s+\d+", sql, re.IGNORECASE):
            issues.append("Missing LIMIT clause")
            suggestions.append("Add LIMIT 1000 to prevent excessive results")

        # Check for proper database prefix
        if "ai_ready_v2." not in sql:
            issues.append("Tables may be missing database prefix 'ai_ready_v2.'")

        # Check for GROUP BY consistency
        if re.search(r"\b(SUM|AVG|COUNT|MIN|MAX)\s*\(", sql, re.IGNORECASE):
            if not re.search(r"\bGROUP\s+BY\b", sql, re.IGNORECASE):
                # Only an issue if there are non-aggregated columns in SELECT
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
