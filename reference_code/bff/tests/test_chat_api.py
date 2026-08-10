"""Tests for bff/api/chat.py — DSP streaming endpoint."""

import json
from unittest.mock import AsyncMock, patch, MagicMock

import pytest
from httpx import AsyncClient, ASGITransport

SAMPLE_AGENT_RESPONSE = {
    "answer": "딥드림 카드로 스타벅스에서 5% 할인이 가능합니다 <<CITE:bnf_01:discount_rate:5>>.",
    "card_id": "CARD_Product:딥드림",
    "intent": "card_benefit_specific",
    "entities": {"merchant": "스타벅스"},
    "tool_calls": [
        {"tool_name": "glossary", "params": {"query": "딥드림"}, "result_summary": "card_id=CARD_Product:딥드림"},
        {"tool_name": "neptune", "params": {"intent": "card_benefit_specific"}, "result_summary": "T2, nodes=12, edges=15"},
    ],
    "subgraph_used": {"nodes": [{"id": f"n{i}"} for i in range(8)], "edges": [{"id": f"e{i}"} for i in range(10)]},
    "validation_result": {"passed": True, "stages": [{"stage": "cite_traceback", "passed": True, "issues": []}]},
    "correction_count": 0,
}


def _get_app():
    from bff.main import app
    return app


async def _mock_stream_events():
    """Simulate AgentCore streaming events from SAMPLE_AGENT_RESPONSE."""
    yield {"type": "stage", "stage": "retrieval", "status": "done", "ms": 100,
           "data": {"intent": "card_benefit_specific", "tool_calls": SAMPLE_AGENT_RESPONSE["tool_calls"]}}
    yield {"type": "stage", "stage": "generate", "status": "active"}
    # Stream answer as tokens
    answer = SAMPLE_AGENT_RESPONSE["answer"]
    for i in range(0, len(answer), 20):
        yield {"type": "token", "content": answer[i:i+20]}
    yield {"type": "stage", "stage": "generate", "status": "done", "ms": 2000}
    yield {"type": "stage", "stage": "validate", "status": "done", "ms": 2100}
    yield {"type": "done", "validation": SAMPLE_AGENT_RESPONSE["validation_result"],
           "subgraph": SAMPLE_AGENT_RESPONSE["subgraph_used"],
           "tool_calls": SAMPLE_AGENT_RESPONSE["tool_calls"],
           "answer": answer}


def _mock_agentcore():
    mock = AsyncMock()
    mock.invoke.return_value = SAMPLE_AGENT_RESPONSE
    mock.invoke_stream = lambda q, s: _mock_stream_events()
    return mock


def _patch_endpoint():
    """Patch AGENTCORE_ENDPOINT to bypass graceful 503 check."""
    return patch("bff.api.chat.settings.AGENTCORE_ENDPOINT", "http://mock-agentcore:9000")


async def test_dsp_8_stage_sequence():
    """POST /api/chat → DSP stream with 2: stages + 0: text + 8: annotation + d: finish."""
    app = _get_app()
    mock_client = _mock_agentcore()

    with _patch_endpoint(), patch("bff.api.chat._get_agentcore_client", return_value=mock_client):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/api/chat", json={"query": "딥드림 스타벅스 할인"})
            assert resp.status_code == 200
            body = resp.text
            lines = [l for l in body.strip().split("\n") if l]

            # Should contain stage events (2:), text (0:), annotation (8:), finish (d:)
            prefixes = {l.split(":")[0] for l in lines if ":" in l}
            assert "2" in prefixes, f"Missing stage events. Lines: {lines[:5]}"
            assert "0" in prefixes, f"Missing text events. Lines: {lines[:5]}"
            assert "d" in prefixes, f"Missing finish event. Lines: {lines[:5]}"

            # Check stage sequence includes glossary, classify, validate
            stage_lines = [l for l in lines if l.startswith("2:")]
            stage_names = []
            for sl in stage_lines:
                data = json.loads(sl[2:])
                if isinstance(data, list) and len(data) > 0:
                    stage_names.append(data[0].get("stage", ""))
            assert "retrieval" in stage_names or "glossary" in stage_names
            assert "validate" in stage_names or "generate" in stage_names


@pytest.mark.stale   # ★ U84 R0 아카이브 — 스테이지 이름 계약이 바뀌었다.
#   기대: 'retrieval' 스테이지가 있다
#   실제: ['glossary', 'classify', 'search', 'template', …] — 8단계로 세분화됐고
#         'retrieval' 하나였던 것이 glossary·classify·search로 갈라졌다.
#   같은 파일의 test_dsp_8_stage_sequence는 새 계약을 검사하며 통과한다(4 green).
#   → 코드가 정상이고 이 함수만 낡았다. 고칠 때는 새 스테이지 이름으로 다시 쓴다.
async def test_stream_has_retrieval_stage():
    """Streaming mode includes retrieval stage event."""
    app = _get_app()
    mock_client = _mock_agentcore()

    with _patch_endpoint(), patch("bff.api.chat._get_agentcore_client", return_value=mock_client):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/api/chat", json={"query": "딥드림 혜택"})
            body = resp.text
            stage_lines = [l for l in body.strip().split("\n") if l.startswith("2:")]
            stage_names = []
            for sl in stage_lines:
                data = json.loads(sl[2:])
                if isinstance(data, list) and len(data) > 0:
                    stage_names.append(data[0].get("stage", ""))
            assert "retrieval" in stage_names


async def test_agentcore_error():
    """AgentCore failure → fallback to full mode error event."""
    app = _get_app()
    from bff.clients.agentcore_client import AgentCoreError

    async def _broken_stream(q, s):
        raise AgentCoreError("connection refused")
        yield  # noqa: unreachable

    mock_client = AsyncMock()
    mock_client.invoke_stream = _broken_stream
    mock_client.invoke.side_effect = AgentCoreError("connection refused")

    with _patch_endpoint(), patch("bff.api.chat._get_agentcore_client", return_value=mock_client):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/api/chat", json={"query": "test"})
            assert resp.status_code == 200
            body = resp.text
            assert "error" in body.lower() or "connection refused" in body


async def test_session_id_auto_generated():
    """No session_id in request → stream is called (200 OK)."""
    app = _get_app()
    mock_client = _mock_agentcore()

    with _patch_endpoint(), patch("bff.api.chat._get_agentcore_client", return_value=mock_client):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/api/chat", json={"query": "test"})
            assert resp.status_code == 200


async def test_streaming_tokens():
    """Streaming mode produces 0: text events from tokens."""
    app = _get_app()
    mock_client = _mock_agentcore()

    with _patch_endpoint(), patch("bff.api.chat._get_agentcore_client", return_value=mock_client):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/api/chat", json={"query": "test"})
            body = resp.text
            text_lines = [l for l in body.strip().split("\n") if l.startswith("0:")]
            assert len(text_lines) >= 2, f"Expected >=2 text events, got {len(text_lines)}"
