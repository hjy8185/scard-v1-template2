"""POST /api/chat — DSP streaming endpoint.

Phase 4: Relays SSE events from AgentCore streaming mode.
Falls back to full mode if streaming fails.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from bff.clients.agentcore_client import AgentCoreClient, AgentCoreError
from bff.config import settings
from bff.models import ChatRequest


def _smus_term_lookup(name: str):
    """U19 R3: SMUS glossary 실시간 조회(catalog TTL 캐시 경유). 실패 시 None(기존 캐시 degrade)."""
    try:
        from bff.api.catalog import cached_term_lookup
        return cached_term_lookup(name)
    except Exception:  # noqa: BLE001
        return None


def _segment_metric_fetch(metric: str, segment_type: str):
    """U22 B1: Valkey 세그먼트 metric 조회(compare 카드용). 미가용 시 None(카드만 생략)."""
    try:
        from bff.clients.metric_cache import fetch_segment_metric
        return fetch_segment_metric(metric, segment_type)
    except Exception:  # noqa: BLE001
        return None

logger = logging.getLogger(__name__)
router = APIRouter()

_agentcore_client: AgentCoreClient | None = None


def _get_agentcore_client() -> AgentCoreClient:
    global _agentcore_client
    if _agentcore_client is None:
        _agentcore_client = AgentCoreClient(
            endpoint=settings.AGENTCORE_ENDPOINT,
            region=settings.AWS_REGION,
        )
    return _agentcore_client


CHUNK_SIZE = 50


def _dsp_stage(stage: str, status: str, ms: int = 0, data: dict | None = None) -> str:
    """Format a single DSP stage event line."""
    return f'2:{json.dumps([{"stage": stage, "status": status, "ms": ms, "data": data}], ensure_ascii=False)}\n'


def _decompose_retrieval(data: dict | None, ms: int) -> list[str]:
    """Decompose coarse 'retrieval done' into fine-grained stage events."""
    if not data:
        return [_dsp_stage("glossary", "done", 0)]

    events: list[str] = []
    tool_calls = data.get("tool_calls", [])
    intent = data.get("intent", "")

    # Glossary
    glossary_tc = next((t for t in tool_calls if t.get("tool_name") == "glossary_lookup"), None)
    glossary_data: dict = {}
    if glossary_tc:
        summary = glossary_tc.get("result_summary", "")
        glossary_data["result_summary"] = summary
    events.append(_dsp_stage("glossary", "done", 0, glossary_data))

    # Classify (intent)
    events.append(_dsp_stage("classify", "done", 0, {"intent": intent}))

    # Search (OpenSearch)
    search_tc = next((t for t in tool_calls if t.get("tool_name") == "opensearch_search"), None)
    if search_tc:
        events.append(_dsp_stage("search", "done", 0, {"result_summary": search_tc.get("result_summary", "")}))
    else:
        events.append(_dsp_stage("search", "skip", 0))

    # Traverse (Neptune)
    neptune_tc = next((t for t in tool_calls if t.get("tool_name") == "neptune_query"), None)
    traverse_data: dict = {}
    if neptune_tc:
        traverse_data["result_summary"] = neptune_tc.get("result_summary", "")
    events.append(_dsp_stage("traverse", "done", 0, traverse_data))

    # Prune — total retrieval time
    events.append(_dsp_stage("prune", "done", ms))

    return events


async def _stream_chat(query: str, session_id: str) -> AsyncGenerator[str, None]:
    """Stream DSP events — relays SSE from AgentCore streaming mode."""
    client = _get_agentcore_client()

    # P3-10: 구간별 타이밍 로깅 (CloudWatch/OTEL 복구 전 회귀 추적용)
    import time as _time
    t0 = _time.monotonic()
    first_event_ms: int | None = None
    first_token_ms: int | None = None
    retrieval_ms: int | None = None
    done_ms: int | None = None

    def _elapsed() -> int:
        return int((_time.monotonic() - t0) * 1000)

    try:
        async for event in client.invoke_stream(query, session_id):
            event_type = event.get("type", "")
            if first_event_ms is None:
                first_event_ms = _elapsed()
            if event_type == "token" and first_token_ms is None:
                first_token_ms = _elapsed()
            elif event_type == "stage" and event.get("stage") == "retrieval" and event.get("status") == "done":
                retrieval_ms = event.get("ms")

            if event_type == "stage":
                stage = event.get("stage", "")
                status = event.get("status", "")

                if stage == "retrieval" and status == "active":
                    # Emit glossary active as pipeline start
                    yield _dsp_stage("glossary", "active")
                elif stage == "retrieval" and status == "done":
                    # Decompose into individual stages
                    for ev in _decompose_retrieval(event.get("data"), event.get("ms", 0)):
                        yield ev
                elif stage == "generate":
                    yield _dsp_stage("generate", status, event.get("ms", 0))
                elif stage == "validate":
                    yield _dsp_stage("verify", status, event.get("ms", 0))
                else:
                    yield _dsp_stage(stage, status, event.get("ms", 0), event.get("data"))

            elif event_type == "token":
                content = event.get("content", "")
                if content:
                    yield f'0:{json.dumps(content, ensure_ascii=False)}\n'

            elif event_type == "done":
                # Emit verify done with validation data
                validation = event.get("validation", {})
                if validation:
                    yield _dsp_stage("verify", "done", 0, validation)

                # Annotation event (8:) — subgraph + validation + tool_calls
                annotation = {
                    "subgraph": event.get("subgraph"),
                    "validation": event.get("validation"),
                    "tool_calls": event.get("tool_calls"),
                }
                yield f'8:{json.dumps([annotation], ensure_ascii=False)}\n'

                # Finish event (d:)
                yield f'd:{json.dumps({"finishReason": "stop"})}\n'

                done_ms = _elapsed()
                logger.info(
                    "chat timing session=%s first_event_ms=%s first_token_ms=%s "
                    "retrieval_srv_ms=%s done_ms=%s",
                    session_id, first_event_ms, first_token_ms, retrieval_ms, done_ms,
                )
                return

    except AgentCoreError as e:
        logger.warning("Stream mode failed (%s), falling back to full mode", e)
        # Fall back to full mode
        async for chunk in _stream_chat_full(query, session_id):
            yield chunk
        return
    except Exception as e:
        logger.error("Unexpected streaming error: %s", e)
        yield f'0:{json.dumps(f"오류가 발생했습니다: {e}", ensure_ascii=False)}\n'
        yield f'd:{json.dumps({"finishReason": "error"})}\n'
        return

    # If we reach here without a "done" event, send finish
    yield f'd:{json.dumps({"finishReason": "stop"})}\n'


async def _stream_chat_full(query: str, session_id: str) -> AsyncGenerator[str, None]:
    """Fallback: full mode with keepalive (original behavior)."""
    client = _get_agentcore_client()
    task = asyncio.create_task(client.invoke(query, session_id))

    # Emit keepalive stage events every 5s while waiting
    stage_names = ["glossary", "classify", "search", "traverse", "prune", "generate", "validate"]
    stage_idx = 0
    while not task.done():
        stage = stage_names[min(stage_idx, len(stage_names) - 1)]
        yield f'2:{json.dumps([{"stage": stage, "status": "active", "ms": stage_idx * 5000, "data": None}], ensure_ascii=False)}\n'
        stage_idx += 1
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=5.0)
        except asyncio.TimeoutError:
            continue
        except Exception:
            break

    try:
        agent_response = task.result()
    except AgentCoreError as e:
        logger.error("AgentCore error: %s", e)
        yield f'0:{json.dumps(f"오류가 발생했습니다: {e}", ensure_ascii=False)}\n'
        yield f'd:{json.dumps({"finishReason": "error"})}\n'
        return
    except Exception as e:
        logger.error("Unexpected error: %s", e)
        yield f'0:{json.dumps(f"오류가 발생했습니다: {e}", ensure_ascii=False)}\n'
        yield f'd:{json.dumps({"finishReason": "error"})}\n'
        return

    from bff.stage_mapper import map_to_stages
    stages = map_to_stages(agent_response)
    for stage in stages:
        yield f'2:{json.dumps([stage.model_dump()], ensure_ascii=False)}\n'
        await asyncio.sleep(0.05)

    answer = agent_response.get("answer", "")
    for i in range(0, len(answer), CHUNK_SIZE):
        chunk = answer[i:i + CHUNK_SIZE]
        yield f'0:{json.dumps(chunk, ensure_ascii=False)}\n'

    annotation = {
        "subgraph": agent_response.get("subgraph_used"),
        "validation": agent_response.get("validation_result"),
        "tool_calls": agent_response.get("tool_calls"),
        "correction_count": agent_response.get("correction_count", 0),
    }
    yield f'8:{json.dumps([annotation], ensure_ascii=False)}\n'
    yield f'd:{json.dumps({"finishReason": "stop"})}\n'


@router.post("/api/chat")
async def chat(request: ChatRequest) -> StreamingResponse:
    session_id = request.session_id or str(uuid.uuid4())
    return StreamingResponse(
        _stream_chat(request.query, session_id),
        media_type="text/plain; charset=utf-8",
        headers={"x-vercel-ai-data-stream": "v1", "Cache-Control": "no-cache, no-transform",
                 "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# U6 — orchestrated chat: StageEvent 공통 계약 relay + enrich (Step 3)
# ---------------------------------------------------------------------------

def _stage_event(ev: dict) -> str:
    """U6 공통 StageEvent를 AI-SDK data-stream '2:'(data annotation) 라인으로."""
    return f'2:{json.dumps([ev], ensure_ascii=False)}\n'


async def _stream_orchestrated(query: str, session_id: str, preset_card_id: str | None = None) -> AsyncGenerator[str, None]:
    """orchestrated 응답 스트리밍 (U13): 라우팅+툴 stage → compose 토큰 실시간 → final annotation.
    스트리밍 실패 시 배치 fallback(_stream_orchestrated_batch)."""
    client = _get_agentcore_client()
    yield _stage_event({"event_type": "route", "request_id": session_id,
                        "route_id": f"{session_id}:r1", "status": "active"})
    got_token = False
    route_plan = None
    tool_calls: list = []
    disclaimers: list = []
    citation: dict = {}
    answer_parts: list = []
    try:
        # CloudFront 60s origin timeout 방어: 첫 이벤트(콜드스타트 시 지연)까지 무침묵이면 504.
        # 다음 이벤트 task를 만들어 최대 10s 대기 — 미완이면 취소하지 않고(제너레이터 보존)
        # keepalive를 흘린 뒤 같은 task를 계속 기다린다(shield).
        agen = client.invoke_orchestrated_stream(query, session_id, preset_card_id).__aiter__()
        waited = 0
        pending = None
        while True:
            if pending is None:
                pending = asyncio.ensure_future(agen.__anext__())
            try:
                ev = await asyncio.wait_for(asyncio.shield(pending), timeout=10.0)
                pending = None
            except StopAsyncIteration:
                break
            except asyncio.TimeoutError:
                waited += 10
                yield _stage_event({"event_type": "route", "request_id": session_id,
                                    "route_id": f"{session_id}:r1", "status": "active",
                                    "payload": {"keepalive": waited}})
                continue   # pending 유지(취소 안 함) → 다음 루프에서 계속 대기
            t = ev.get("type")
            if t == "stage":
                yield _stage_event({"event_type": ev.get("stage", "route"), "request_id": session_id,
                                    "route_id": f"{session_id}:r1", "status": ev.get("status", "done"),
                                    "payload": ev.get("data", {})})
            elif t == "token":
                txt = ev.get("text", "")
                if txt:
                    got_token = True
                    answer_parts.append(txt)
                    yield f'0:{json.dumps(txt, ensure_ascii=False)}\n'
                    await asyncio.sleep(0)
            elif t == "corrected":
                # U40d: 스트림 후 게이트 교정 — 마커+교정본 전송(프론트가 마커 이전을 폐기)
                txt = ev.get("text", "")
                if txt:
                    answer_parts = [txt]
                    marked = "\u200b[CORRECTED]\u200b" + txt
                    yield "0:" + json.dumps(marked, ensure_ascii=False) + "\n"
                    await asyncio.sleep(0)
            elif t == "done":
                route_plan = ev.get("route_plan")
                tool_calls = ev.get("tool_calls", []) or []
                disclaimers = ev.get("disclaimers", []) or []
                citation = ev.get("citation") or {}   # U13 P7: 테이블/노드 레벨 근거
    except AgentCoreError as e:
        logger.warning("orchestrated_stream failed (%s), fallback to batch", e)
        if not got_token:
            async for chunk in _stream_orchestrated_batch(query, session_id, preset_card_id):
                yield chunk
            return

    # U13 P7: citation(실노드·테이블 provenance)이 이제 stream 경로에도 옴 → ontology enrich를
    # citation 기반으로(graph_paths 키워드 포함). insights도 실 데이터로 생성.
    from bff import enrich
    ontology = enrich.enrich_ontology(citation, query) or None
    insights = enrich.build_insights(citation, segment_fetch=_segment_metric_fetch) or None
    # U19 R3: catalog enrich를 stream(주 경로)에도 — SMUS glossary 실시간 정의 동반
    catalog_ctx = enrich.enrich_catalog(citation, glossary_lookup=_smus_term_lookup) or None

    # U36: 라우팅 관찰(플라이휠) — tier 분포·tier3 폴백 패턴 누적(read-only 훅)
    from bff import routing_log
    routing_log.record(query, route_plan)

    # final annotation — 테이블/노드 레벨 비저빌리티(graph_paths·provenance·market.rows)
    annotation = {"route_plan": route_plan, "citation": citation, "audit": {},
                  "ontology": ontology, "insights": insights, "catalog": catalog_ctx,
                  "disclaimers": disclaimers, "unsupported": False, "tool_calls": tool_calls}
    yield _stage_event({"event_type": "final", "request_id": session_id, "status": "done"})
    yield f'8:{json.dumps([annotation], ensure_ascii=False)}\n'
    yield f'd:{json.dumps({"finishReason": "stop"})}\n'


async def _stream_orchestrated_batch(query: str, session_id: str, preset_card_id: str | None = None) -> AsyncGenerator[str, None]:
    """배치 fallback (구 orchestrated 경로) — 스트리밍 실패 시 keepalive+청크."""
    from bff import enrich

    client = _get_agentcore_client()
    yield _stage_event({"event_type": "route", "request_id": session_id,
                        "route_id": f"{session_id}:r1", "status": "active"})
    task = asyncio.create_task(client.invoke_orchestrated(query, session_id, preset_card_id))
    waited = 0
    try:
        while not task.done():
            try:
                await asyncio.wait_for(asyncio.shield(task), timeout=5)
            except asyncio.TimeoutError:
                waited += 5
                yield _stage_event({"event_type": "route", "request_id": session_id,
                                    "route_id": f"{session_id}:r1", "status": "active",
                                    "payload": {"keepalive": waited}})
        resp = task.result()
    except AgentCoreError:
        yield _stage_event({"event_type": "error", "request_id": session_id,
                            "status": "error", "error": "agent 호출 실패"})
        yield f'0:{json.dumps("일시적인 오류가 발생했습니다.", ensure_ascii=False)}\n'
        yield f'd:{json.dumps({"finishReason": "stop"})}\n'
        return

    validation = resp.get("validation", {}) or {}
    citation = resp.get("citation", validation.get("citation", {})) or {}
    audit = resp.get("audit", validation.get("audit_summary", {})) or {}
    tool_calls = resp.get("tool_calls", []) or []

    # route done — plan 요약
    yield _stage_event({"event_type": "route", "request_id": session_id,
                        "route_id": audit.get("route_id"), "status": "done",
                        "payload": {"planner_version": audit.get("planner_version"),
                                    "normalized_query_hash": audit.get("normalized_query_hash"),
                                    "tool_calls": audit.get("tool_calls", len(tool_calls))}})

    # 각 tool call → tool StageEvent (audit tool_call_log 순서 = 실행 순서)
    for tc in tool_calls:
        yield _stage_event({
            "event_type": "tool", "request_id": session_id,
            "route_id": audit.get("route_id"),
            "tool": tc.get("tool"), "status": tc.get("status", "done"),
            "payload": {"template_id": tc.get("template_id"),
                        "params": tc.get("params"),
                        "result_summary": tc.get("result_summary")},
            "error": tc.get("error"),
        })
        await asyncio.sleep(0)  # 이벤트 flush

    # enrich (ontology/catalog) — degrade 허용
    ontology = enrich.enrich_ontology(citation, query)
    catalog = enrich.enrich_catalog(citation, glossary_lookup=_smus_term_lookup)
    if ontology:
        yield _stage_event({"event_type": "tool", "tool": "enrich_ontology",
                            "status": "done", "payload": ontology})
    if catalog:
        yield _stage_event({"event_type": "tool", "tool": "enrich_catalog",
                            "status": "done", "payload": catalog})

    # compose — 답변 텍스트 스트리밍
    yield _stage_event({"event_type": "compose", "request_id": session_id, "status": "active"})
    answer = resp.get("answer", "")
    for i in range(0, len(answer), CHUNK_SIZE):
        yield f'0:{json.dumps(answer[i:i+CHUNK_SIZE], ensure_ascii=False)}\n'
        await asyncio.sleep(0)

    # U13 P3: insights (citation 있는 배치 경로) — market/metric → 차트 카드
    insights = enrich.build_insights(citation, segment_fetch=_segment_metric_fetch)

    # U36: 라우팅 관찰(플라이휠) — 배치 fallback 경로도 동일 누적
    from bff import routing_log
    routing_log.record(query, resp.get("route_plan"))

    # final — PlatformAnnotation 전체 (dominantGrade는 프론트 provenance.ts가 산출)
    annotation = {
        "route_plan": resp.get("route_plan"),
        "citation": citation,
        "audit": audit,
        "ontology": ontology or None,
        "catalog": catalog or None,
        "insights": insights or None,
        "disclaimers": resp.get("disclaimers", validation.get("disclaimers", [])),
        "unsupported": validation.get("unsupported", False),
        "tool_calls": tool_calls,
    }
    yield _stage_event({"event_type": "final", "request_id": session_id, "status": "done"})
    yield f'8:{json.dumps([annotation], ensure_ascii=False)}\n'
    yield f'd:{json.dumps({"finishReason": "stop"})}\n'


# SSE 프록시 버퍼링·변형 방지(CloudFront/ALB HTTP2 프레이밍 깨짐→ERR_HTTP2_PROTOCOL_ERROR 방지)
_SSE_HEADERS = {
    "x-vercel-ai-data-stream": "v1",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
}


@router.post("/api/chat/orchestrated")
async def chat_orchestrated(request: ChatRequest) -> StreamingResponse:
    session_id = request.session_id or str(uuid.uuid4())
    return StreamingResponse(
        _stream_orchestrated(request.query, session_id, request.preset_card_id),
        media_type="text/plain; charset=utf-8",
        headers=_SSE_HEADERS,
    )
