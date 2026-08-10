"""AgentCore Runtime client using boto3 SDK.

Phase 4: Added streaming invoke — reads SSE events from AgentCore.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import AsyncGenerator

import boto3
from botocore.config import Config

logger = logging.getLogger(__name__)

# env-driven so BFF can target west (cgCardAgentWest) or east (v1). U6 → west.
RUNTIME_ARN = os.environ.get(
    "AGENTCORE_RUNTIME_ARN",
    "arn:aws:bedrock-agentcore:us-east-1:000000000000:runtime/cgCardAgent-uq3E8R6s92",
)
ENDPOINT_QUALIFIER = os.environ.get("AGENTCORE_ENDPOINT_QUALIFIER", "cgAgentEndpoint")

# Agent processing can take 60-120s (retrieval + LLM streaming)
_BOTO_CONFIG = Config(
    read_timeout=300,
    connect_timeout=10,
    retries={"max_attempts": 0},
)


class AgentCoreError(Exception):
    pass


_COLD_START_RETRY_DELAY = 3  # seconds to wait before retry
_COLD_START_MAX_RETRIES = 2  # cold microVM may need up to 2 retries (orchestrated graph warmup)


class AgentCoreClient:
    def __init__(self, endpoint: str, region: str) -> None:
        self._region = region
        self._client = boto3.client("bedrock-agentcore", region_name=region, config=_BOTO_CONFIG)

    async def invoke(self, query: str, session_id: str) -> dict:
        """Full mode — blocking call with cold start retry."""
        for attempt in range(_COLD_START_MAX_RETRIES + 1):
            try:
                return await asyncio.to_thread(self._invoke_sync, query, session_id)
            except AgentCoreError:
                if attempt < _COLD_START_MAX_RETRIES:
                    logger.warning("AgentCore invoke failed (attempt %d), retrying in %ds...", attempt + 1, _COLD_START_RETRY_DELAY)
                    await asyncio.sleep(_COLD_START_RETRY_DELAY)
                    continue
                raise

    async def invoke_orchestrated(self, query: str, session_id: str, preset_card_id: str | None = None) -> dict:
        """U6 — orchestrated mode (U5). Returns {answer, validation(citation/audit), tool_calls}.

        v1 콜드스타트 해법 계승: v1은 stream/full에서 콜드스타트가 예외로 떠 retry가 걸린다.
        orchestrated는 콜드 실패가 HTTP 200 안의 tool status=error로 오므로, 예외뿐 아니라
        **콜드스타트 징후(도구는 실행됐는데 전부 error·결과 0)**도 감지해 재시도한다.
        """
        last = None
        for attempt in range(_COLD_START_MAX_RETRIES + 1):
            try:
                resp = await asyncio.to_thread(self._invoke_orchestrated_sync, query, session_id, preset_card_id)
                last = resp
                if attempt < _COLD_START_MAX_RETRIES and self._looks_cold(resp):
                    logger.warning("orchestrated cold-start 징후(tool error), retry in %ds", _COLD_START_RETRY_DELAY)
                    await asyncio.sleep(_COLD_START_RETRY_DELAY)
                    continue
                return resp
            except AgentCoreError:
                if attempt < _COLD_START_MAX_RETRIES:
                    logger.warning("orchestrated invoke failed (attempt %d), retry in %ds", attempt + 1, _COLD_START_RETRY_DELAY)
                    await asyncio.sleep(_COLD_START_RETRY_DELAY)
                    continue
                raise
        return last

    @staticmethod
    def _looks_cold(resp: dict) -> bool:
        """도구가 호출됐는데 전부 error(결과 0) → 콜드스타트 전이 실패로 판단."""
        tcs = resp.get("tool_calls") or []
        if not tcs:
            return False
        graphish = [t for t in tcs if t.get("tool") in ("graph_query", "sql_query")]
        if not graphish:
            return False
        return all(t.get("status") == "error" for t in graphish)

    def _invoke_orchestrated_sync(self, query: str, session_id: str, preset_card_id: str | None = None) -> dict:
        payload = {"prompt": query, "session_id": session_id, "mode": "orchestrated"}
        if preset_card_id:
            payload["preset_card_id"] = preset_card_id
        # v1과 동일하게 runtimeSessionId 미전달(콜드스타트는 retry로 해결 — invoke_orchestrated).
        logger.info("Invoking AgentCore (orchestrated): query=%s", query[:50])
        try:
            resp = self._client.invoke_agent_runtime(
                agentRuntimeArn=RUNTIME_ARN,
                qualifier=ENDPOINT_QUALIFIER,
                payload=json.dumps(payload).encode(),
            )
            body = resp.get("response")
            data = body.read().decode() if hasattr(body, "read") else str(body)
            return json.loads(data)
        except Exception as e:
            logger.error("orchestrated invoke failed: %s: %s", type(e).__name__, e)
            raise AgentCoreError(str(e)) from e

    async def invoke_stream(self, query: str, session_id: str) -> AsyncGenerator[dict, None]:
        """Streaming mode(v1, mode=stream) — 카드 그래프만. 시장/지표/온톨로지 조회 없음.

        ⚠️ 이 경로는 v1(ORCHESTRATED=0) fallback 전용 데드코드다. 프로덕션은 항상
        orchestrated_stream을 쓴다(route.ts: ORCHESTRATED!=='0'). 디버깅/검증에 이 함수를
        쓰면 시장·crosswalk·지표 질의가 전부 '데이터 없음'으로 나와 오판한다(U16 실측 사고).
        의도적 v1 fallback이면 ALLOW_V1_STREAM=1을 명시적으로 켜라.
        """
        import os
        if os.getenv("ALLOW_V1_STREAM") != "1":
            raise AgentCoreError(
                "invoke_stream(v1 mode=stream)은 비활성화됨 — 카드 그래프만 조회하므로 "
                "시장/지표/온톨로지 질의를 '데이터 없음'으로 오답한다. "
                "orchestrated 경로(invoke_orchestrated_stream)를 쓰거나, 진짜 v1 fallback이면 "
                "ALLOW_V1_STREAM=1로 명시 허용하라."
            )
        for attempt in range(_COLD_START_MAX_RETRIES + 1):
            try:
                resp = await asyncio.to_thread(self._invoke_stream_sync, query, session_id)
                streaming_body = resp.get("response")
                if streaming_body is None:
                    raise AgentCoreError("No response body from AgentCore")

                async for event in self._parse_sse_stream(streaming_body):
                    yield event
                return  # success — exit retry loop
            except AgentCoreError:
                if attempt < _COLD_START_MAX_RETRIES:
                    logger.warning("AgentCore stream failed (attempt %d), retrying in %ds...", attempt + 1, _COLD_START_RETRY_DELAY)
                    await asyncio.sleep(_COLD_START_RETRY_DELAY)
                    continue
                raise

    async def _parse_sse_stream(self, streaming_body) -> AsyncGenerator[dict, None]:
        """Parse SSE events from StreamingBody.

        bytes 버퍼에 누적하고 이벤트 구분자(\n\n / \r\n\r\n) 경계에서만 decode한다.
        작은 청크(256B)를 써서 TTFB를 낮추면서도, 멀티바이트(한글) 문자가
        청크 경계에서 잘려 손상되는 문제를 방지한다.
        """
        buffer = b""

        def _read_chunk() -> bytes:
            # 작은 청크로 읽어 초기 SSE 이벤트가 버퍼 가득찰 때까지 지연되지 않게 한다.
            return streaming_body.read(256)

        while True:
            chunk = await asyncio.to_thread(_read_chunk)
            if not chunk:
                break
            buffer += chunk

            # 완성된 이벤트만 잘라낸다 (CRLF/LF 모두 지원).
            while True:
                sep_len = 2
                idx = buffer.find(b"\n\n")
                crlf_idx = buffer.find(b"\r\n\r\n")
                if crlf_idx != -1 and (idx == -1 or crlf_idx < idx):
                    idx, sep_len = crlf_idx, 4
                if idx == -1:
                    break
                event_bytes, buffer = buffer[:idx], buffer[idx + sep_len:]
                for event in self._parse_event_block(event_bytes):
                    yield event

        # 남은 버퍼 처리 (구분자 없이 종료된 마지막 이벤트)
        if buffer.strip():
            for event in self._parse_event_block(buffer):
                yield event

    @staticmethod
    def _parse_event_block(event_bytes: bytes) -> list[dict]:
        """이벤트 블록(bytes)을 경계에서 안전하게 decode 후 data: 라인을 파싱."""
        events = []
        text = event_bytes.decode("utf-8", errors="replace")
        for line in text.split("\n"):
            line = line.strip()  # 라인 끝 \r 포함 제거
            if line.startswith("data: "):
                data_str = line[6:]
                try:
                    events.append(json.loads(data_str))
                except json.JSONDecodeError:
                    logger.warning("Failed to parse SSE data: %s", data_str[:100])
        return events

    def _invoke_sync(self, query: str, session_id: str) -> dict:
        """Full mode sync call."""
        payload = {"prompt": query, "session_id": session_id, "mode": "full"}
        logger.info("Invoking AgentCore (full): query=%s", query[:50])
        try:
            resp = self._client.invoke_agent_runtime(
                agentRuntimeArn=RUNTIME_ARN,
                qualifier=ENDPOINT_QUALIFIER,
                payload=json.dumps(payload).encode(),
            )
            body = resp.get("response")
            if hasattr(body, "read"):
                data = body.read().decode()
            else:
                data = str(body)
            return json.loads(data)
        except Exception as e:
            logger.error("AgentCore invoke failed: %s: %s", type(e).__name__, e)
            raise AgentCoreError(str(e)) from e

    def _invoke_stream_sync(self, query: str, session_id: str) -> dict:
        """Stream mode sync call — returns raw response with StreamingBody."""
        payload = {"prompt": query, "session_id": session_id, "mode": "stream"}
        logger.info("Invoking AgentCore (stream): query=%s", query[:50])
        try:
            return self._client.invoke_agent_runtime(
                agentRuntimeArn=RUNTIME_ARN,
                qualifier=ENDPOINT_QUALIFIER,
                payload=json.dumps(payload).encode(),
            )
        except Exception as e:
            logger.error("AgentCore stream invoke failed: %s: %s", type(e).__name__, e)
            raise AgentCoreError(str(e)) from e

    def _invoke_orchestrated_stream_sync(self, query: str, session_id: str,
                                         preset_card_id: str | None = None) -> dict:
        """U13: orchestrated streaming — routing+tools 후 compose 토큰 스트림."""
        payload = {"prompt": query, "session_id": session_id, "mode": "orchestrated_stream"}
        if preset_card_id:
            payload["preset_card_id"] = preset_card_id
        logger.info("Invoking AgentCore (orchestrated_stream): query=%s", query[:50])
        try:
            return self._client.invoke_agent_runtime(
                agentRuntimeArn=RUNTIME_ARN, qualifier=ENDPOINT_QUALIFIER,
                payload=json.dumps(payload).encode(),
            )
        except Exception as e:
            logger.error("AgentCore orch-stream invoke failed: %s: %s", type(e).__name__, e)
            raise AgentCoreError(str(e)) from e

    async def invoke_orchestrated_stream(self, query: str, session_id: str,
                                         preset_card_id: str | None = None) -> AsyncGenerator[dict, None]:
        """U13: orchestrated 스트리밍 이벤트(stage/token/done) yield. SSE 파서 재사용."""
        for attempt in range(_COLD_START_MAX_RETRIES + 1):
            try:
                resp = await asyncio.to_thread(self._invoke_orchestrated_stream_sync,
                                               query, session_id, preset_card_id)
                body = resp.get("response")
                if body is None:
                    raise AgentCoreError("No response body from AgentCore")
                async for event in self._parse_sse_stream(body):
                    yield event
                return
            except AgentCoreError:
                if attempt < _COLD_START_MAX_RETRIES:
                    await asyncio.sleep(_COLD_START_RETRY_DELAY)
                    continue
                raise
