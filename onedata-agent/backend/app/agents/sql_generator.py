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
                "FROM ai_ready_v3.igd_m_cust_txn_card\n"
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
                "FROM ai_ready_v3.igd_m_cust_txn_card t\n"
                "JOIN ai_ready_v3.igd_m_cust_base c\n"
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
                '  c."연령5년구간코드",\n'
                '  COUNT(DISTINCT t."그룹md번호") AS "고객수",\n'
                '  SUM(t."이용금액") AS "총이용금액"\n'
                "FROM ai_ready_v3.igd_m_cust_txn_card t\n"
                "JOIN ai_ready_v3.igd_m_cust_base c\n"
                '  ON t."그룹md번호" = c."그룹md번호"\n'
                '  AND t."기준년월" = c."기준년월"\n'
                "WHERE t.\"기준년월\" = (SELECT MAX(\"기준년월\") FROM ai_ready_v3.igd_m_cust_txn_card)\n"
                'GROUP BY c."연령5년구간코드"\n'
                'ORDER BY c."연령5년구간코드" ASC\n'
                "LIMIT 20"
            ),
            "explanation": "드릴다운: 이전 쿼리의 FROM/WHERE 조건을 유지하고 연령대 GROUP BY를 추가합니다. 연령대는 igd_m_cust_base에서 조회합니다.",
            "tables_used": ["igd_m_cust_txn_card", "igd_m_cust_base"],
        },
    },
    {
        "question": "위 결과를 성별로 비교해줘",
        "answer": {
            "sql": (
                "SELECT\n"
                '  c."성별",\n'
                '  COUNT(DISTINCT t."그룹md번호") AS "고객수",\n'
                '  SUM(t."이용금액") AS "총이용금액"\n'
                "FROM ai_ready_v3.igd_m_cust_txn_card t\n"
                "JOIN ai_ready_v3.igd_m_cust_base c\n"
                '  ON t."그룹md번호" = c."그룹md번호"\n'
                '  AND t."기준년월" = c."기준년월"\n'
                "WHERE t.\"기준년월\" = (SELECT MAX(\"기준년월\") FROM ai_ready_v3.igd_m_cust_txn_card)\n"
                'GROUP BY c."성별"\n'
                'ORDER BY "고객수" DESC\n'
                "LIMIT 10"
            ),
            "explanation": "드릴다운: 이전 쿼리의 FROM/WHERE 조건을 유지하고 성별 GROUP BY를 추가합니다. 성별은 igd_m_cust_base에서 조회합니다.",
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
                "FROM ai_ready_v3.igd_m_cust_txn_card\n"
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
                "  FROM ai_ready_v3.jaz_sh_fanclub_membership_chghist\n"
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
                "JOIN ai_ready_v3.igd_m_cust_txn_card c\n"
                '  ON t."그룹md" = c."그룹md번호"\n'
                "LEFT JOIN ai_ready_v3.igd_m_shg_rfm_base_ledger r\n"
                '  ON t."그룹md" = r."그룹md번호"\n'
                "LIMIT 1000"
            ),
            "explanation": "슈퍼솔 사용 빈도 상위 10% 고객을 추출하고, 해당 고객의 평균 카드 이용금액과 은행 수신평잔을 조회합니다.",
            "tables_used": ["jaz_sh_fanclub_membership_chghist", "igd_m_cust_txn_card", "igd_m_shg_rfm_base_ledger"],
        },
    },
    {
        "question": "계열사별 슈퍼솔 MAU를 연령대별로 보여줘",
        "answer": {
            "sql": (
                "SELECT\n"
                "  s.\"기준년월\",\n"
                "  CASE\n"
                "    WHEN j.\"신한그룹통합플랫폼가입채널코드\" = '01' THEN '신한은행'\n"
                "    WHEN j.\"신한그룹통합플랫폼가입채널코드\" = '02' THEN '신한카드'\n"
                "    WHEN j.\"신한그룹통합플랫폼가입채널코드\" = '03' THEN '신한투자증권'\n"
                "    WHEN j.\"신한그룹통합플랫폼가입채널코드\" = '04' THEN '신한라이프'\n"
                "    ELSE '기타'\n"
                "  END AS \"계열사\",\n"
                "  c.\"연령5년구간코드\",\n"
                "  COUNT(DISTINCT s.\"그룹md번호\") AS \"MAU\"\n"
                "FROM ai_ready_v3.sol_m_supersol_visit s\n"
                "JOIN ai_ready_v3.jaz_sh_fanclub_membership_chghist j\n"
                "  ON s.\"그룹md번호\" = j.\"그룹md\"\n"
                "JOIN ai_ready_v3.igd_m_cust_base c\n"
                "  ON s.\"그룹md번호\" = c.\"그룹md번호\"\n"
                "  AND s.\"기준년월\" = c.\"기준년월\"\n"
                "WHERE s.\"기준년월\" >= '202601'\n"
                "GROUP BY\n"
                "  s.\"기준년월\",\n"
                "  CASE\n"
                "    WHEN j.\"신한그룹통합플랫폼가입채널코드\" = '01' THEN '신한은행'\n"
                "    WHEN j.\"신한그룹통합플랫폼가입채널코드\" = '02' THEN '신한카드'\n"
                "    WHEN j.\"신한그룹통합플랫폼가입채널코드\" = '03' THEN '신한투자증권'\n"
                "    WHEN j.\"신한그룹통합플랫폼가입채널코드\" = '04' THEN '신한라이프'\n"
                "    ELSE '기타'\n"
                "  END,\n"
                "  c.\"연령5년구간코드\"\n"
                "ORDER BY s.\"기준년월\" DESC, \"MAU\" DESC\n"
                "LIMIT 100"
            ),
            "explanation": "계열사별 슈퍼솔 MAU를 연령대별로 분석합니다. CASE WHEN 전체를 GROUP BY에 반복합니다.",
            "tables_used": ["sol_m_supersol_visit", "jaz_sh_fanclub_membership_chghist", "igd_m_cust_base"],
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

        # Extract tables referenced in previous SQL from conversation context
        if conversation_context:
            all_known = [t.table_name for t in self._ontology.get_all_tables()]
            for tname in all_known:
                if tname in conversation_context and tname not in relevant_tables:
                    relevant_tables.append(tname)
                    logger.info("Added table from conversation context: %s", tname)

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

        # Add critical column value format hints
        context_str += (
            "\n\n=== 컬럼값 형식 주의사항 ===\n"
            "★ \"연령5년구간코드\"는 3자리 문자열입니다: '010','015','020','025','030','035','040','045','050','055','060','065','070'\n"
            "  - 30대 = '030','035' / 40대 = '040','045' / 50대 = '050','055'\n"
            "  - 절대 '30','35' 같은 2자리를 사용하지 마세요.\n"
            "★ \"기준년월\"은 6자리 문자열입니다: '202601'~'202606' (현재 데이터 범위)\n"
            "  - 최근 6개월 조회 시 >= '202601' 조건 사용을 권장합니다.\n"
            "  - date_add/current_date 함수 대신 명시적 문자열 비교를 사용하세요.\n"
            "★ \"성별\"은 'M','F' 입니다.\n"
        )

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
            context_str += f"\n\n=== 대화 이력 (누적 컨텍스트) ===\n{conversation_context}\n"
            context_str += (
                "\n★★★ 대화 누적 SQL 생성 규칙 ★★★\n"
                "이 대화는 이어지는 대화입니다. 반드시 이전 SQL을 기반으로 확장/수정하세요.\n\n"
                "1. 드릴다운('위 결과를 X별로'): 이전 SQL의 FROM/WHERE/JOIN을 유지하고 GROUP BY에 차원 추가\n"
                "2. 추가 요청('X도 같이 보고 싶어', 'X도 추가해줘'): 이전 SQL에 새 컬럼/JOIN을 추가. CTE(WITH절)로 확장 가능\n"
                "3. 조건 변경('X 대신 Y로'): 이전 SQL의 해당 부분만 교체\n"
                "4. 완전히 새로운 주제여도, 동일 세션이면 이전 SQL의 기준년월/WHERE 조건을 참고하여 일관성 유지\n\n"
                "★ 절대 이전 SQL을 무시하고 처음부터 새로 작성하지 마세요. 이전 SQL을 복사한 뒤 수정/확장하세요.\n\n"
                "각 차원에 맞는 테이블·컬럼:\n"
                "  - 연령대별 → igd_m_cust_base.\"연령5년구간코드\" (통합 고객 기본 JOIN)\n"
                "  - 성별 → igd_m_cust_base.\"성별\" (통합 고객 기본 JOIN)\n"
                "  - 월별/추이 → \"기준년월\" GROUP BY + ORDER BY ASC\n"
                "  ★ 연령대/성별은 igd_m_cust_base만 사용. 절대 cln_*_life, cln_*_sec 등 사용 금지.\n\n"
                "★★ 계열사별 분류 시 반드시 아래 정확한 SQL 패턴을 사용하세요:\n"
                "  SELECT\n"
                "    CASE\n"
                "      WHEN j.\"신한그룹통합플랫폼가입채널코드\" = '01' THEN '신한은행'\n"
                "      WHEN j.\"신한그룹통합플랫폼가입채널코드\" = '02' THEN '신한카드'\n"
                "      WHEN j.\"신한그룹통합플랫폼가입채널코드\" = '03' THEN '신한투자증권'\n"
                "      WHEN j.\"신한그룹통합플랫폼가입채널코드\" = '04' THEN '신한라이프'\n"
                "      ELSE '기타'\n"
                "    END AS \"계열사\",\n"
                "    ...\n"
                "  FROM ai_ready_v3.jaz_sh_fanclub_membership_chghist j\n"
                "  GROUP BY\n"
                "    CASE\n"
                "      WHEN j.\"신한그룹통합플랫폼가입채널코드\" = '01' THEN '신한은행'\n"
                "      WHEN j.\"신한그룹통합플랫폼가입채널코드\" = '02' THEN '신한카드'\n"
                "      WHEN j.\"신한그룹통합플랫폼가입채널코드\" = '03' THEN '신한투자증권'\n"
                "      WHEN j.\"신한그룹통합플랫폼가입채널코드\" = '04' THEN '신한라이프'\n"
                "      ELSE '기타'\n"
                "    END\n\n"
                "★★ 계열사 차원 추가 시 JOIN 방법 (이전 SQL에 계열사 분류를 추가할 때):\n"
                "  - 이전 SQL이 특정 테이블(예: igd_m_cust_txn_card)만 사용 중이면:\n"
                "    기존 FROM을 유지하고, jaz_sh_fanclub_membership_chghist를 \"그룹md\"로 JOIN\n"
                "    JOIN ai_ready_v3.jaz_sh_fanclub_membership_chghist j\n"
                "      ON 기존테이블.\"그룹md\" = j.\"그룹md\"\n"
                "      AND j.\"기준년월\" = (SELECT MAX(\"기준년월\") FROM ai_ready_v3.jaz_sh_fanclub_membership_chghist)\n"
                "  - 또는 CTE로 분리: WITH base AS (이전 SQL), grp AS (계열사 분류) SELECT ...\n"
                "  ★ 절대 이전 SQL의 FROM을 삭제하고 jaz 테이블만 쓰지 마세요. 반드시 기존 테이블 유지 + JOIN.\n\n"
                "★★ 주의: CASE col WHEN 축약 문법 사용 금지. 반드시 CASE WHEN col = 'val' THEN 형태 사용.\n"
                "★★ 주의: GROUP BY에 alias 사용 금지. CASE WHEN 전체를 GROUP BY에 반복하세요.\n\n"
                "★★ 업종별 분석 시:\n"
                "  - 테이블: ai_ready_v3.igd_m_cust_txn_card\n"
                "  - 업종 분류 컬럼: CASE WHEN으로 업종별 이용금액 컬럼을 UNPIVOT:\n"
                "    외식이용금액, 교통이용금액, 편의점이용금액, 백화점이용금액, 주유이용금액, 병원약국이용금액, 온라인쇼핑이용금액\n"
                "  - 간단한 방법: 각 업종 컬럼을 SELECT에 나열\n"
                "    SELECT SUM(\"외식이용금액\") AS \"외식\", SUM(\"교통이용금액\") AS \"교통\", ...\n"
                "  - 또는 GROUP BY 방식: 이전 SQL에 igd_m_cust_txn_card를 JOIN하고 업종 컬럼 추가\n"
                "  ★ '업종별'이라는 요청이 오면 반드시 위 업종 컬럼들을 SQL에 포함하세요. 무시하지 마세요.\n"
            )

        try:
            result = await self._bedrock.generate_sql(
                query=query,
                context=context_str,
                examples=_FEW_SHOT_EXAMPLES,
            )

            sql = result.get("sql", "")
            sql = self._fix_case_when_syntax(sql)
            sql = self._fix_group_by_alias(sql)
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

    def _fix_case_when_syntax(self, sql: str) -> str:
        """Convert CASE col WHEN 'val' THEN to CASE WHEN col = 'val' THEN."""
        # Match: CASE <expr> WHEN 'val' THEN (the shorthand form)
        # Replace with: CASE WHEN <expr> = 'val' THEN
        pattern = r"CASE\s+([a-zA-Z_][a-zA-Z0-9_.\"]*(?:\"[^\"]+\")?)\s*\n?\s*WHEN\s+'([^']+)'\s+THEN"

        def _expand_case(m: re.Match) -> str:
            col = m.group(1)
            val = m.group(2)
            return f"CASE\n    WHEN {col} = '{val}' THEN"

        # First, handle the initial CASE col WHEN pattern
        result = re.sub(pattern, _expand_case, sql, flags=re.IGNORECASE)

        # Then handle subsequent WHEN 'val' THEN lines within the same CASE block
        # After the first conversion, remaining bare "WHEN 'val' THEN" inside a CASE
        # that was converted need the column name prepended.
        # Strategy: find all CASE WHEN col = 'val' patterns, extract col, then fix
        # subsequent WHEN 'val' lines in the same block.
        lines = result.split('\n')
        current_case_col = None
        fixed_lines = []
        for line in lines:
            stripped = line.strip()
            # Detect start of converted CASE block
            case_start = re.match(r"CASE\s*$", stripped, re.IGNORECASE)
            if case_start:
                current_case_col = None
                fixed_lines.append(line)
                continue

            # Detect WHEN col = 'val' (already correct form) → extract col
            when_full = re.match(r"WHEN\s+(.+?)\s*=\s*'[^']+'\s+THEN", stripped, re.IGNORECASE)
            if when_full and current_case_col is None:
                current_case_col = when_full.group(1)
                fixed_lines.append(line)
                continue

            # Detect bare WHEN 'val' THEN (shorthand remnant)
            when_bare = re.match(r"((\s*)WHEN\s+)'([^']+)'(\s+THEN\s+.*)$", line, re.IGNORECASE)
            if when_bare and current_case_col:
                indent = when_bare.group(2)
                val = when_bare.group(3)
                rest = when_bare.group(4)
                fixed_lines.append(f"{indent}WHEN {current_case_col} = '{val}'{rest}")
                continue

            # END resets context
            if re.match(r"(END|ELSE)", stripped, re.IGNORECASE):
                if stripped.upper().startswith('END'):
                    current_case_col = None
                fixed_lines.append(line)
                continue

            fixed_lines.append(line)

        return '\n'.join(fixed_lines)

    def _fix_group_by_alias(self, sql: str) -> str:
        """Replace CASE expression aliases in GROUP BY with the full CASE expression."""
        # Find all CASE...END AS "alias" patterns in SELECT
        case_aliases: dict[str, str] = {}
        case_pattern = re.compile(
            r'(CASE\s*\n?\s*(?:WHEN\s+.+?\s+THEN\s+.+?\n?\s*)+(?:ELSE\s+.+?\n?\s*)?END)\s+AS\s+"([^"]+)"',
            re.IGNORECASE | re.DOTALL,
        )
        for m in case_pattern.finditer(sql):
            case_expr = m.group(1).strip()
            alias = m.group(2)
            case_aliases[alias] = case_expr

        if not case_aliases:
            return sql

        # Find GROUP BY clause and replace alias references
        group_by_match = re.search(r'(GROUP\s+BY\s+)(.*?)(?=\s*(?:ORDER|HAVING|LIMIT|$))', sql, re.IGNORECASE | re.DOTALL)
        if not group_by_match:
            return sql

        group_by_prefix = group_by_match.group(1)
        group_by_body = group_by_match.group(2)

        for alias, case_expr in case_aliases.items():
            # Replace "alias" reference in GROUP BY with full CASE expression
            group_by_body = re.sub(
                rf'(?<![.\w])"{re.escape(alias)}"(?![.\w])',
                '\n  ' + case_expr,
                group_by_body,
            )

        new_group_by = group_by_prefix + group_by_body
        sql = sql[:group_by_match.start()] + new_group_by + sql[group_by_match.end():]
        return sql

    def _ensure_database_prefix(self, sql: str) -> str:
        """Ensure all table references include the database prefix."""
        db = "ai_ready_v3"
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

        if "ai_ready_v3." not in sql:
            issues.append("Tables may be missing database prefix 'ai_ready_v3.'")

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
