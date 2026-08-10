"""Intent classification agent.

Classifies user queries into intent categories to determine
the appropriate pipeline path.
"""

from __future__ import annotations

import logging
from typing import Any

from app.services.bedrock_client import BedrockClient

logger = logging.getLogger(__name__)


# Intent types
INTENT_DATA_QUERY = "data_query"
INTENT_AGGREGATION = "aggregation"
INTENT_COMPARISON = "comparison"
INTENT_DEFINITION = "definition"
INTENT_GREETING = "greeting"
INTENT_UNSUPPORTED = "unsupported"

# Intents that require SQL execution
SQL_INTENTS = {INTENT_DATA_QUERY, INTENT_AGGREGATION, INTENT_COMPARISON}


class IntentResult:
    """Result of intent classification."""

    def __init__(
        self,
        intent: str,
        confidence: float,
        entities: list[str],
        requires_sql: bool,
        domain_hint: str | None = None,
    ) -> None:
        self.intent = intent
        self.confidence = confidence
        self.entities = entities
        self.requires_sql = requires_sql
        self.domain_hint = domain_hint

    def to_dict(self) -> dict[str, Any]:
        return {
            "intent": self.intent,
            "confidence": self.confidence,
            "entities": self.entities,
            "requires_sql": self.requires_sql,
            "domain_hint": self.domain_hint,
        }


class IntentClassifier:
    """Classifies user queries using LLM-based intent detection."""

    def __init__(self, bedrock_client: BedrockClient) -> None:
        self._bedrock = bedrock_client

    async def classify(self, query: str) -> IntentResult:
        """Classify a user query into an intent category.

        Uses a fast heuristic check first, then falls back to LLM classification.
        """
        # Fast heuristic for obvious cases
        heuristic = self._heuristic_classify(query)
        if heuristic and heuristic.confidence >= 0.9:
            logger.info("Intent classified by heuristic: %s (%.2f)", heuristic.intent, heuristic.confidence)
            return heuristic

        # LLM-based classification
        try:
            result = await self._bedrock.classify_intent(query)
            intent_result = IntentResult(
                intent=result.get("intent", INTENT_DATA_QUERY),
                confidence=result.get("confidence", 0.5),
                entities=result.get("entities", []),
                requires_sql=result.get("requires_sql", True),
                domain_hint=result.get("domain_hint"),
            )
            logger.info(
                "Intent classified by LLM: %s (%.2f), entities=%s",
                intent_result.intent,
                intent_result.confidence,
                intent_result.entities,
            )
            return intent_result
        except Exception as e:
            logger.warning("LLM intent classification failed: %s, using heuristic", e)
            return heuristic or IntentResult(
                intent=INTENT_DATA_QUERY,
                confidence=0.3,
                entities=[],
                requires_sql=True,
                domain_hint=None,
            )

    def _heuristic_classify(self, query: str) -> IntentResult | None:
        """Quick heuristic-based classification for common patterns."""
        query_stripped = query.strip()

        # Greeting detection
        greetings = ["안녕", "하이", "헬로", "hello", "hi", "도움말", "사용법"]
        if any(query_stripped.startswith(g) or query_stripped == g for g in greetings):
            return IntentResult(
                intent=INTENT_GREETING,
                confidence=0.95,
                entities=[],
                requires_sql=False,
            )

        # Definition queries
        definition_patterns = ["이란", "뜻은", "무엇", "정의", "의미", "설명해"]
        if any(p in query_stripped for p in definition_patterns) and len(query_stripped) < 50:
            return IntentResult(
                intent=INTENT_DEFINITION,
                confidence=0.8,
                entities=[],
                requires_sql=False,
            )

        # Aggregation patterns
        agg_patterns = ["총", "합계", "평균", "건수", "몇 건", "몇건", "얼마나", "카운트"]
        if any(p in query_stripped for p in agg_patterns):
            return IntentResult(
                intent=INTENT_AGGREGATION,
                confidence=0.8,
                entities=[],
                requires_sql=True,
                domain_hint=self._detect_domain(query_stripped),
            )

        # Comparison patterns
        comp_patterns = ["비교", "대비", "vs", "차이", "많은", "적은", "높은", "낮은"]
        if any(p in query_stripped for p in comp_patterns):
            return IntentResult(
                intent=INTENT_COMPARISON,
                confidence=0.8,
                entities=[],
                requires_sql=True,
                domain_hint=self._detect_domain(query_stripped),
            )

        # Data query (catch-all for SQL-like requests)
        data_patterns = ["조회", "보여", "알려", "목록", "리스트", "검색", "찾아"]
        if any(p in query_stripped for p in data_patterns):
            return IntentResult(
                intent=INTENT_DATA_QUERY,
                confidence=0.7,
                entities=[],
                requires_sql=True,
                domain_hint=self._detect_domain(query_stripped),
            )

        # No confident heuristic match
        return None

    def _detect_domain(self, query: str) -> str | None:
        """Detect likely domain from query keywords."""
        domain_keywords = {
            "customer": ["고객", "회원", "가입", "연령", "성별", "거주"],
            "transaction": ["거래", "결제", "이용", "매출", "소비", "사용금액"],
            "product": ["상품", "카드", "계좌", "보험", "증권", "펀드"],
            "merchant": ["가맹점", "업종", "매장", "프랜차이즈", "배달"],
            "soleprop": ["개인사업자", "사업자", "자영업", "소상공인"],
        }
        for domain, keywords in domain_keywords.items():
            if any(kw in query for kw in keywords):
                return domain
        return None
