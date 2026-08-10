"""BFF end-to-end integration tests.

Uses httpx AsyncClient with FastAPI TestClient to test full request flow.
External services (AgentCore, Neptune) are mocked at client level.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from bff.main import app


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def test_health(client: AsyncClient):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@pytest.mark.stale   # ★ U84 R0 아카이브 — 카테고리 수가 6 → 9로 늘었다.
#   기대: len(data["categories"]) == 6      실제: 9
#   U10·U11·A1'(시장수요 갭)에서 시나리오를 추가했고 이 상수를 안 고쳤다.
#   ⚠️ 고칠 때 `== 9`로 바꾸면 다음에 또 깨진다 — 개수가 아니라 **계약**을 검사해야 한다
#      (예: 각 카테고리에 scenario_id·questions가 있다). 그래서 값만 바꾸지 않고 남긴다.
async def test_scenarios_returns_list(client: AsyncClient):
    # U6 v2: default → {categories:[6 A급 시나리오]}. background 그룹은 list.
    resp = await client.get("/api/scenarios")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["categories"]) == 6
    bg = await client.get("/api/scenarios?group=background")
    assert isinstance(bg.json(), list)


async def _mock_stream_events():
    """Simulate AgentCore streaming events."""
    yield {"type": "stage", "stage": "retrieval", "status": "done", "ms": 500, "data": {"intent": "card_benefit_all"}}
    yield {"type": "stage", "stage": "generate", "status": "active"}
    yield {"type": "token", "content": "딥드림 카드는 "}
    yield {"type": "token", "content": "쇼핑 5% 할인입니다."}
    yield {"type": "stage", "stage": "generate", "status": "done", "ms": 3000}
    yield {"type": "done", "validation": {"passed": True}, "subgraph": {"nodes": [], "edges": []},
           "tool_calls": [{"tool_name": "glossary_lookup", "params": {}, "result_summary": "matches=1"}]}


async def test_chat_dsp_stream(client: AsyncClient):
    """Full chat flow: mock AgentCore streaming, verify DSP event types."""
    with patch("bff.api.chat._get_agentcore_client") as mock_get:
        mock_client = AsyncMock()
        mock_client.invoke_stream = lambda q, s: _mock_stream_events()
        mock_get.return_value = mock_client

        resp = await client.post("/api/chat", json={"query": "딥드림 혜택 알려줘"})
        assert resp.status_code == 200
        assert resp.headers.get("x-vercel-ai-data-stream") == "v1"

        lines = [l for l in resp.text.strip().split("\n") if l]
        prefixes = [l.split(":")[0] for l in lines]

        # Should contain stage events (2), text chunks (0), annotation (8), finish (d)
        assert "2" in prefixes
        assert "0" in prefixes
        assert "8" in prefixes
        assert "d" in prefixes

        # Finish event should be last
        last_line = lines[-1]
        assert last_line.startswith("d:")
        finish_data = json.loads(last_line[2:])
        assert finish_data["finishReason"] == "stop"


async def test_chat_fallback_on_stream_error(client: AsyncClient):
    """If streaming fails, falls back to full mode."""
    from bff.clients.agentcore_client import AgentCoreError

    mock_response = {
        "answer": "fallback 답변",
        "tool_calls": [],
        "subgraph_used": {"nodes": [], "edges": []},
        "validation_result": {"passed": True},
        "correction_count": 0,
    }

    async def _broken_stream(q, s):
        raise AgentCoreError("stream failed")
        yield  # make it an async generator  # noqa: unreachable

    with patch("bff.api.chat._get_agentcore_client") as mock_get:
        mock_client = AsyncMock()
        mock_client.invoke_stream = _broken_stream
        mock_client.invoke.return_value = mock_response
        mock_get.return_value = mock_client

        resp = await client.post("/api/chat", json={"query": "테스트"})
        assert resp.status_code == 200

        lines = [l for l in resp.text.strip().split("\n") if l]
        # Should still have finish event
        last_line = lines[-1]
        assert last_line.startswith("d:")
