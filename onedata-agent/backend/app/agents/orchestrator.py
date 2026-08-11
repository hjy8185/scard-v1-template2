"""Main agent orchestrator.

Coordinates the 4-step Text-to-SQL pipeline:
1. Intent Analysis - classify user query
2. Context Retrieval - get relevant ontology from Neptune + OpenSearch
3. SQL Generation - generate SQL with ontology context
4. Execution & Answer - run SQL on Athena, compose natural language answer

Each step emits SSE events so the frontend can show progress.
"""

from __future__ import annotations

import logging
import time
from typing import Any, AsyncGenerator

import os

from app.agents.answer_composer import AnswerComposer
from app.agents.intent import IntentClassifier, IntentResult, SQL_INTENTS
from app.agents.sql_generator import SQLGenerator, SQLGenerationResult
from app.models.schemas import StageEvent
from app.ontology.loader import OntologyLoader
from app.ontology.mapper import OntologyMapper
from app.services.athena_client import AthenaClient, AthenaError, SQLSafetyError
from app.services.bedrock_client import BedrockClient
from app.services.neptune_client import NeptuneClient
from app.services.opensearch_client import OpenSearchClient

logger = logging.getLogger(__name__)


class PipelineEvent:
    """Event emitted during pipeline execution for SSE streaming."""

    def __init__(
        self,
        event_type: str,
        data: dict[str, Any] | None = None,
    ) -> None:
        self.event_type = event_type  # "stage" | "token" | "done" | "error"
        self.data = data or {}

    def to_stage_event(self) -> StageEvent:
        return StageEvent(
            stage=self.data.get("stage", ""),
            status=self.data.get("status", ""),
            ms=self.data.get("ms", 0),
            data=self.data.get("payload"),
        )


class Orchestrator:
    """Main orchestrator for the Text-to-SQL pipeline."""

    def __init__(
        self,
        bedrock_client: BedrockClient | None = None,
        neptune_client: NeptuneClient | None = None,
        opensearch_client: OpenSearchClient | None = None,
        athena_client: AthenaClient | None = None,
        ontology_loader: OntologyLoader | None = None,
        ontology_mapper: OntologyMapper | None = None,
    ) -> None:
        is_local_dev = os.environ.get("LOCAL_DEV", "").lower() in ("true", "1", "yes")

        if is_local_dev:
            from app.services.mock_bedrock_client import MockBedrockClient, MockAthenaClient
            self._bedrock = bedrock_client or MockBedrockClient()
            self._athena = athena_client or MockAthenaClient()
        else:
            self._bedrock = bedrock_client or BedrockClient()
            self._athena = athena_client or AthenaClient()

        self._neptune = neptune_client or NeptuneClient()
        self._opensearch = opensearch_client or OpenSearchClient()

        # Ontology
        self._ontology = ontology_loader or OntologyLoader()
        self._mapper = ontology_mapper or OntologyMapper()

        # Agents
        self._intent_classifier = IntentClassifier(self._bedrock)
        self._sql_generator = SQLGenerator(
            self._bedrock, self._ontology, self._mapper, self._opensearch
        )
        self._answer_composer = AnswerComposer(self._bedrock)

        self._initialized = False
        self._session_history: dict[str, list[dict]] = {}

    async def initialize(self) -> None:
        """Initialize ontology and synonyms. Call once at startup."""
        if self._initialized:
            return

        # Load ontology from cache (fast startup)
        self._ontology.load_from_cache()
        self._mapper.load_synonyms()

        # Try to refresh from Neptune in background (non-blocking)
        try:
            if await self._neptune.health_check():
                await self._ontology.load_from_neptune(self._neptune)
        except Exception as e:
            logger.warning("Neptune refresh failed, using cache: %s", e)

        self._initialized = True
        logger.info("Orchestrator initialized")

    async def process_query(
        self, query: str, session_id: str, max_rows: int | None = None, history: list | None = None
    ) -> AsyncGenerator[PipelineEvent, None]:
        """Process a user query through the full pipeline, yielding events.

        This is the main entry point. Each step yields PipelineEvent objects
        that the chat endpoint converts to SSE events.

        Yields:
            PipelineEvent for each stage transition and the final answer.
        """
        if not self._initialized:
            await self.initialize()

        pipeline_start = time.monotonic()

        # === Stage 1: Intent Analysis ===
        yield PipelineEvent("stage", {"stage": "intent", "status": "active"})
        t0 = time.monotonic()

        try:
            intent_result = await self._intent_classifier.classify(query)
            intent_ms = int((time.monotonic() - t0) * 1000)
            yield PipelineEvent(
                "stage",
                {
                    "stage": "intent",
                    "status": "done",
                    "ms": intent_ms,
                    "payload": intent_result.to_dict(),
                },
            )
        except Exception as e:
            logger.error("Intent classification failed: %s", e)
            intent_result = IntentResult(
                intent="data_query",
                confidence=0.3,
                entities=[],
                requires_sql=True,
            )
            yield PipelineEvent(
                "stage",
                {"stage": "intent", "status": "done", "ms": 0, "payload": intent_result.to_dict()},
            )

        # Override: if there's conversation history, short follow-up queries are likely drill-downs
        has_history = bool(history) or session_id in self._session_history
        if has_history and not intent_result.requires_sql and intent_result.intent in ("definition", "unsupported"):
            logger.info("Overriding intent %s → data_query (has conversation history)", intent_result.intent)
            intent_result = IntentResult(
                intent="data_query",
                confidence=0.7,
                entities=intent_result.entities,
                requires_sql=True,
                domain_hint=intent_result.domain_hint,
            )

        # Handle non-SQL intents
        if not intent_result.requires_sql:
            answer = await self._handle_non_sql_intent(query, intent_result)
            yield PipelineEvent(
                "stage", {"stage": "context", "status": "skip", "ms": 0}
            )
            yield PipelineEvent(
                "stage", {"stage": "sql_generate", "status": "skip", "ms": 0}
            )
            yield PipelineEvent(
                "stage", {"stage": "execute", "status": "skip", "ms": 0}
            )
            yield PipelineEvent("token", {"content": answer})
            total_ms = int((time.monotonic() - pipeline_start) * 1000)
            yield PipelineEvent(
                "done",
                {
                    "answer": answer,
                    "intent": intent_result.intent,
                    "total_ms": total_ms,
                },
            )
            return

        # === Stage 2: Context Retrieval ===
        yield PipelineEvent("stage", {"stage": "context", "status": "active"})
        t0 = time.monotonic()

        # Context retrieval happens inside SQL generator
        context_ms = int((time.monotonic() - t0) * 1000)
        yield PipelineEvent(
            "stage",
            {
                "stage": "context",
                "status": "done",
                "ms": context_ms,
                "payload": {"domain_hint": intent_result.domain_hint},
            },
        )

        # === Stage 3: SQL Generation ===
        yield PipelineEvent("stage", {"stage": "sql_generate", "status": "active"})
        t0 = time.monotonic()

        try:
            # Build conversation context for drill-down queries
            conversation_context = None
            effective_history = history if history else []

            # Fall back to server-side session history if frontend sends empty history
            if not effective_history and session_id in self._session_history:
                effective_history = self._session_history[session_id]
                logger.info("Using server-side session history (%d entries) for session %s: %s",
                           len(effective_history), session_id,
                           [m.get('sql', '')[:50] for m in effective_history if m.get('sql')])
            elif not effective_history:
                logger.info("No history available for session %s (known sessions: %s)",
                           session_id, list(self._session_history.keys())[:5])

            if effective_history:
                ctx_parts = []
                last_sql = None
                for msg in effective_history[-4:]:
                    if hasattr(msg, 'role'):
                        role = msg.role
                        content = msg.content
                        sql = getattr(msg, 'sql', None)
                    elif isinstance(msg, dict):
                        role = msg.get('role', '')
                        content = msg.get('content', '')
                        sql = msg.get('sql')
                    else:
                        continue

                    if role == 'user':
                        ctx_parts.append(f"사용자: {content}")
                    elif role == 'assistant' and content:
                        ctx_parts.append(f"AI: {content[:200]}")
                        if sql:
                            ctx_parts.append(f"이전 SQL:\n{sql}")
                            last_sql = sql
                if ctx_parts:
                    conversation_context = "\n".join(ctx_parts)
                    if last_sql:
                        conversation_context += (
                            f"\n\n★★★ 중요: '위 결과'는 위의 이전 SQL 결과를 의미합니다. "
                            f"드릴다운 시 반드시 이전 SQL의 FROM/WHERE/JOIN을 유지하고 "
                            f"GROUP BY 차원만 변경하세요. 테이블이나 조건을 바꾸지 마세요. ★★★"
                        )
                    logger.info("Built conversation context: %d parts, last_sql=%s", len(ctx_parts), bool(last_sql))

            sql_result = await self._sql_generator.generate(
                query=query,
                domain_hint=intent_result.domain_hint,
                conversation_context=conversation_context,
            )
            sql_ms = int((time.monotonic() - t0) * 1000)

            # Validate the generated SQL
            validation = await self._sql_generator.validate_sql(sql_result.sql)
            if not validation["valid"]:
                logger.warning(
                    "Generated SQL has issues: %s", validation["issues"]
                )

            yield PipelineEvent(
                "stage",
                {
                    "stage": "sql_generate",
                    "status": "done",
                    "ms": sql_ms,
                    "payload": {
                        "sql": sql_result.sql,
                        "explanation": sql_result.explanation,
                        "tables_used": sql_result.tables_used,
                        "confidence": sql_result.confidence,
                    },
                },
            )
        except Exception as e:
            sql_ms = int((time.monotonic() - t0) * 1000)
            logger.error("SQL generation failed: %s", e)
            yield PipelineEvent(
                "stage",
                {"stage": "sql_generate", "status": "error", "ms": sql_ms},
            )
            error_answer = (
                "죄송합니다. 질문을 SQL로 변환하는 데 실패했습니다. "
                "질문을 더 구체적으로 표현해 주시면 도움이 됩니다."
            )
            yield PipelineEvent("token", {"content": error_answer})
            total_ms = int((time.monotonic() - pipeline_start) * 1000)
            yield PipelineEvent(
                "done",
                {"answer": error_answer, "error": str(e), "total_ms": total_ms},
            )
            return

        # === Stage 4: Execution & Answer (with retry on SQL errors) ===
        yield PipelineEvent("stage", {"stage": "execute", "status": "active"})
        t0 = time.monotonic()

        exec_result = None
        max_retries = 2

        for attempt in range(max_retries + 1):
            try:
                exec_result = await self._athena.execute_query(
                    sql=sql_result.sql,
                    max_rows=max_rows,
                )
                exec_ms = int((time.monotonic() - t0) * 1000)
                exec_result["execution_time_ms"] = exec_ms

                yield PipelineEvent(
                    "stage",
                    {
                        "stage": "execute",
                        "status": "done",
                        "ms": exec_ms,
                        "payload": {
                            "row_count": exec_result.get("row_count", 0),
                            "truncated": exec_result.get("truncated", False),
                        },
                    },
                )
                break
            except SQLSafetyError as e:
                exec_ms = int((time.monotonic() - t0) * 1000)
                logger.error("SQL safety violation: %s", e)
                yield PipelineEvent(
                    "stage",
                    {"stage": "execute", "status": "error", "ms": exec_ms},
                )
                error_answer = "안전 정책에 의해 해당 쿼리는 실행할 수 없습니다. 데이터 조회(SELECT)만 가능합니다."
                yield PipelineEvent("token", {"content": error_answer})
                total_ms = int((time.monotonic() - pipeline_start) * 1000)
                yield PipelineEvent(
                    "done", {"answer": error_answer, "error": str(e), "total_ms": total_ms}
                )
                return
            except AthenaError as e:
                exec_ms = int((time.monotonic() - t0) * 1000)
                logger.error("Athena execution failed (attempt %d): %s", attempt + 1, e)

                if attempt < max_retries:
                    logger.info("Retrying SQL generation with error context")
                    try:
                        error_context = (
                            f"\n\n## 이전 SQL 실행 오류 (수정 필요)\n"
                            f"오류 메시지: {str(e)}\n"
                            f"실패한 SQL:\n{sql_result.sql}\n\n"
                            f"위 오류를 수정하여 올바른 Athena SQL을 다시 생성하세요."
                        )
                        retry_result = await self._sql_generator.generate(
                            query=query + error_context,
                            domain_hint=intent_result.domain_hint,
                            conversation_context=conversation_context,
                        )
                        sql_result = retry_result
                        yield PipelineEvent(
                            "stage",
                            {
                                "stage": "sql_generate",
                                "status": "done",
                                "ms": 0,
                                "payload": {
                                    "sql": sql_result.sql,
                                    "explanation": sql_result.explanation + " (재생성)",
                                    "tables_used": sql_result.tables_used,
                                    "confidence": sql_result.confidence,
                                },
                            },
                        )
                        t0 = time.monotonic()
                        continue
                    except Exception as retry_err:
                        logger.error("SQL retry failed: %s", retry_err)

                yield PipelineEvent(
                    "stage",
                    {"stage": "execute", "status": "error", "ms": exec_ms},
                )
                exec_result = {
                    "sql": sql_result.sql,
                    "columns": [],
                    "rows": [],
                    "row_count": 0,
                    "error": str(e),
                }

        # === Compose Answer ===
        yield PipelineEvent("stage", {"stage": "answer", "status": "active"})
        t0 = time.monotonic()

        try:
            answer = await self._answer_composer.compose(
                query=query,
                sql=sql_result.sql,
                results=exec_result,
                explanation=sql_result.explanation,
            )
            answer_ms = int((time.monotonic() - t0) * 1000)
            yield PipelineEvent(
                "stage",
                {"stage": "answer", "status": "done", "ms": answer_ms},
            )
        except Exception as e:
            answer_ms = int((time.monotonic() - t0) * 1000)
            logger.error("Answer composition failed: %s", e)
            answer = self._answer_composer._template_answer(query, exec_result)
            yield PipelineEvent(
                "stage",
                {"stage": "answer", "status": "done", "ms": answer_ms},
            )

        # Emit answer tokens
        yield PipelineEvent("token", {"content": answer})

        # Store in server-side session history for drill-down support
        if session_id not in self._session_history:
            self._session_history[session_id] = []
        self._session_history[session_id].append({"role": "user", "content": query})
        self._session_history[session_id].append({"role": "assistant", "content": answer[:300], "sql": sql_result.sql})
        # Keep only last 6 messages per session
        self._session_history[session_id] = self._session_history[session_id][-6:]
        logger.info("Stored session history for %s: %d entries, last_sql=%s",
                   session_id, len(self._session_history[session_id]),
                   sql_result.sql[:60] if sql_result.sql else None)

        # Final done event
        total_ms = int((time.monotonic() - pipeline_start) * 1000)
        yield PipelineEvent(
            "done",
            {
                "answer": answer,
                "sql": sql_result.sql,
                "tables_used": sql_result.tables_used,
                "intent": intent_result.intent,
                "confidence": sql_result.confidence,
                "row_count": exec_result.get("row_count", 0),
                "columns": exec_result.get("columns", []),
                "rows": exec_result.get("rows", [])[:50],
                "total_ms": total_ms,
            },
        )

    async def _handle_non_sql_intent(
        self, query: str, intent: IntentResult
    ) -> str:
        """Handle queries that don't require SQL execution."""
        if intent.intent == "greeting":
            return (
                "안녕하세요! Onedata AI Agent입니다. "
                "신한금융그룹의 데이터를 자연어로 질문하시면 "
                "SQL로 변환하여 결과를 알려드립니다.\n\n"
                "예시 질문:\n"
                "- 최근 3개월간 카드 이용 건수 상위 10명은?\n"
                "- 30대 여성 고객의 평균 결제금액은?\n"
                "- 가맹점별 월간 매출 추이를 보여줘"
            )

        if intent.intent == "definition":
            # Try to find the term in our ontology
            resolved = self._mapper.resolve_terms_in_query(query)
            if resolved:
                term_info = resolved[0]
                return (
                    f"'{term_info['term']}'는 "
                    f"{term_info.get('description', '해당 데이터 필드')}를 의미합니다. "
                    f"테이블 '{term_info.get('table_name', '')}'의 "
                    f"'{term_info.get('column_name', '')}' 컬럼에 해당합니다."
                )
            # LLM-based definition
            try:
                messages = [{"role": "user", "content": query}]
                system = (
                    "You are a financial data dictionary assistant for Shinhan Financial Group. "
                    "Answer term definition questions in Korean. Be concise."
                )
                return await self._bedrock.invoke(messages, system=system, max_tokens=500)
            except Exception:
                return "죄송합니다. 해당 용어의 정의를 찾을 수 없습니다."

        if intent.intent == "unsupported":
            return (
                "죄송합니다. 현재 해당 질문에 대한 데이터를 보유하고 있지 않습니다. "
                "신한금융그룹의 고객, 거래, 상품, 가맹점 관련 질문을 해주세요."
            )

        return "질문을 이해하지 못했습니다. 다시 말씀해 주세요."
