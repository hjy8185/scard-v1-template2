"""Bedrock Claude client for LLM operations.

Uses Claude Sonnet via Amazon Bedrock for:
- Intent classification
- SQL generation from natural language + ontology context
- Answer composition from query results
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

_BOTO_CONFIG = Config(
    region_name=settings.AWS_REGION,
    retries={"max_attempts": 2},
    read_timeout=120,
)


class BedrockError(Exception):
    """Raised when Bedrock invocation fails."""
    pass


class BedrockClient:
    """Client for Amazon Bedrock Claude model invocations."""

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
                retries={"max_attempts": 2},
                read_timeout=120,
            ),
        )

    async def invoke(
        self,
        messages: list[dict[str, Any]],
        system: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        stop_sequences: list[str] | None = None,
    ) -> str:
        """Invoke Claude model and return the text response.

        Args:
            messages: List of message dicts with 'role' and 'content'.
            system: System prompt.
            temperature: Sampling temperature (0.0 for deterministic).
            max_tokens: Override max tokens.
            stop_sequences: Optional stop sequences.

        Returns:
            The assistant's text response.

        Raises:
            BedrockError: If invocation fails.
        """
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "messages": messages,
            "max_tokens": max_tokens or self._max_tokens,
            "temperature": temperature,
        }
        if system:
            body["system"] = system
        if stop_sequences:
            body["stop_sequences"] = stop_sequences

        try:
            response = await asyncio.to_thread(
                self._client.invoke_model,
                modelId=self._model_id,
                contentType="application/json",
                accept="application/json",
                body=json.dumps(body).encode(),
            )
            result = json.loads(response["body"].read())
            content_blocks = result.get("content", [])
            text_parts = [
                block["text"]
                for block in content_blocks
                if block.get("type") == "text"
            ]
            return "\n".join(text_parts)

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
        """Invoke Claude with streaming response.

        Yields text chunks as they arrive.
        """
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "messages": messages,
            "max_tokens": max_tokens or self._max_tokens,
            "temperature": temperature,
        }
        if system:
            body["system"] = system

        try:
            response = await asyncio.to_thread(
                self._client.invoke_model_with_response_stream,
                modelId=self._model_id,
                contentType="application/json",
                accept="application/json",
                body=json.dumps(body).encode(),
            )

            stream = response.get("body")
            if stream is None:
                raise BedrockError("No response stream from Bedrock")

            for event in stream:
                chunk = event.get("chunk")
                if chunk:
                    data = json.loads(chunk["bytes"].decode())
                    if data.get("type") == "content_block_delta":
                        delta = data.get("delta", {})
                        if delta.get("type") == "text_delta":
                            yield delta.get("text", "")

        except BedrockError:
            raise
        except Exception as e:
            logger.error("Bedrock streaming failed: %s: %s", type(e).__name__, e)
            raise BedrockError(f"Bedrock streaming failed: {e}") from e

    async def classify_intent(self, query: str) -> dict[str, Any]:
        """Classify the user's intent for routing.

        Returns dict with: intent, confidence, entities, requires_sql
        """
        system_prompt = """You are an intent classifier for a financial data query system.
Classify the user's query into one of these intents:
- data_query: User wants to retrieve/analyze data (requires SQL)
- aggregation: User wants summary statistics or aggregations (requires SQL)
- comparison: User wants to compare data across dimensions (requires SQL)
- definition: User asks about a term/concept definition (no SQL needed)
- greeting: General greeting or off-topic (no SQL needed)
- unsupported: Query about data we don't have

Respond in JSON format only:
{
  "intent": "<intent_type>",
  "confidence": <0.0-1.0>,
  "entities": ["<extracted entities>"],
  "requires_sql": <true/false>,
  "domain_hint": "<customer|transaction|product|merchant|soleprop|null>"
}"""

        messages = [{"role": "user", "content": query}]
        response = await self.invoke(messages, system=system_prompt, temperature=0.0)

        try:
            # Extract JSON from response
            json_str = response.strip()
            if json_str.startswith("```"):
                json_str = json_str.split("```")[1]
                if json_str.startswith("json"):
                    json_str = json_str[4:]
            return json.loads(json_str)
        except (json.JSONDecodeError, IndexError):
            logger.warning("Failed to parse intent response: %s", response[:200])
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
        """Generate SQL from natural language query with ontology context.

        Args:
            query: User's natural language question.
            context: Ontology context (table schemas, relationships).
            examples: Optional few-shot examples.

        Returns:
            Dict with: sql, explanation, tables_used, confidence
        """
        system_prompt = f"""You are a SQL generation expert for Shinhan Financial Group's Onedata platform.
Generate Athena-compatible SQL (Presto/Trino dialect) based on the user's question.

CRITICAL RULES:
1. Generate ONLY SELECT queries - never INSERT/UPDATE/DELETE/DROP
2. Always include LIMIT clause (max 1000 rows)
3. Use the exact table and column names from the provided context (Korean names)
4. IMPORTANT: All Korean column names MUST be wrapped in double quotes. Example: "그룹md번호", "고객연령", "성별구분코드"
5. The Glue database is "ai_ready_v2" - use fully qualified names: ai_ready_v2.<table_name>
6. The universal join key across all tables is "그룹md번호" (group MD number = customer ID)
7. For date columns, use appropriate date functions (date_parse, date_format)
8. NULL handling: use COALESCE where appropriate
9. Aggregations: always include GROUP BY for non-aggregated columns
10. Column aliases also must be in double quotes if they contain Korean: e.g. COUNT(*) as "이용건수"

ONTOLOGY CONTEXT:
{context}

Respond in JSON format:
{{
  "sql": "<the SQL query>",
  "explanation": "<brief explanation of what the query does>",
  "tables_used": ["<table1>", "<table2>"],
  "confidence": <0.0-1.0>,
  "assumptions": ["<any assumptions made>"]
}}"""

        messages: list[dict[str, Any]] = []

        # Add few-shot examples if provided
        if examples:
            for ex in examples[:3]:
                messages.append({"role": "user", "content": ex["question"]})
                messages.append({"role": "assistant", "content": json.dumps(ex["answer"], ensure_ascii=False)})

        messages.append({"role": "user", "content": query})

        response = await self.invoke(messages, system=system_prompt, temperature=0.0)

        try:
            json_str = response.strip()
            if json_str.startswith("```"):
                json_str = json_str.split("```")[1]
                if json_str.startswith("json"):
                    json_str = json_str[4:]
            return json.loads(json_str)
        except (json.JSONDecodeError, IndexError):
            logger.warning("Failed to parse SQL generation response: %s", response[:300])
            raise BedrockError("Failed to generate valid SQL from the model response")

    async def compose_answer(
        self,
        query: str,
        sql: str,
        results: dict[str, Any],
        context: str | None = None,
    ) -> str:
        """Compose a natural language answer from query results.

        Args:
            query: Original user question.
            sql: The SQL that was executed.
            results: Query results (columns, rows).
            context: Additional context for answer composition.

        Returns:
            Natural language answer string.
        """
        system_prompt = """You are a data analyst assistant for Shinhan Financial Group.
Compose a clear, concise Korean answer based on the SQL query results.

Rules:
1. Answer in Korean
2. Include specific numbers and data points from the results
3. Format large numbers with commas (e.g., 1,234,567)
4. If results are empty, say so clearly and suggest why
5. For aggregations, highlight key findings
6. Keep the answer concise (2-5 sentences for simple queries, more for complex)
7. Do NOT reveal the SQL query itself unless asked
8. Use polite language (합니다/입니다 체)"""

        result_summary = self._format_results_for_prompt(results)

        user_msg = f"""사용자 질문: {query}

실행된 쿼리 결과:
{result_summary}

위 결과를 바탕으로 사용자 질문에 답변해 주세요."""

        messages = [{"role": "user", "content": user_msg}]
        return await self.invoke(messages, system=system_prompt, temperature=0.3)

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

        # Show up to 20 rows in the prompt
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
