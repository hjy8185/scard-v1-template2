"""Tests for bff/clients/agentcore_client.py."""

import json
from io import BytesIO

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from bff.clients.agentcore_client import AgentCoreClient, AgentCoreError


@pytest.fixture
def client():
    return AgentCoreClient(endpoint="http://agent:9000", region="us-east-1")


@pytest.fixture(autouse=True)
def _allow_v1_stream(monkeypatch):
    # v1 stream 파싱 자체를 테스트하므로 가드 해제(프로덕션은 orchestrated 사용).
    monkeypatch.setenv("ALLOW_V1_STREAM", "1")


async def test_invoke_success(client):
    """boto3 invoke_agent_runtime returns AgentResponse dict."""
    response_data = {"answer": "테스트 답변", "card_id": "X"}
    mock_body = MagicMock()
    mock_body.read.return_value = json.dumps(response_data).encode()

    mock_boto = MagicMock()
    mock_boto.invoke_agent_runtime.return_value = {"response": mock_body, "statusCode": 200}

    with patch.object(client, "_client", mock_boto):
        result = await client.invoke("딥드림 혜택", "session-1")
        assert result["answer"] == "테스트 답변"
        mock_boto.invoke_agent_runtime.assert_called_once()


async def test_invoke_error(client):
    """SDK exception raises AgentCoreError."""
    mock_boto = MagicMock()
    mock_boto.invoke_agent_runtime.side_effect = Exception("connection error")

    with patch.object(client, "_client", mock_boto):
        with pytest.raises(AgentCoreError, match="connection error"):
            await client.invoke("test", "s1")


async def test_invoke_stream(client):
    """Stream mode yields parsed SSE events."""
    events = [
        {"type": "stage", "stage": "retrieval", "status": "active"},
        {"type": "token", "content": "안녕"},
        {"type": "done", "validation": {"passed": True}},
    ]
    sse_bytes = b""
    for evt in events:
        sse_bytes += f"data: {json.dumps(evt, ensure_ascii=False)}\n\n".encode()

    mock_body = BytesIO(sse_bytes)
    mock_boto = MagicMock()
    mock_boto.invoke_agent_runtime.return_value = {"response": mock_body}

    with patch.object(client, "_client", mock_boto):
        received = []
        async for event in client.invoke_stream("테스트", "s1"):
            received.append(event)

    assert len(received) == 3
    assert received[0]["type"] == "stage"
    assert received[1]["content"] == "안녕"
    assert received[2]["type"] == "done"


class _ChunkedBody:
    """read(n)이 항상 chunk 바이트만 반환 — 멀티바이트 경계 분할을 강제하는 mock."""

    def __init__(self, data: bytes, chunk: int = 1):
        self._data = data
        self._pos = 0
        self._chunk = chunk

    def read(self, n: int = -1) -> bytes:
        end = min(self._pos + self._chunk, len(self._data))
        out = self._data[self._pos:end]
        self._pos = end
        return out


async def test_stream_korean_not_corrupted_on_byte_boundary(client):
    """한글 멀티바이트가 청크 경계에서 잘려도 손상되지 않아야 한다 (리뷰 #1)."""
    events = [
        {"type": "token", "content": "딥드림 카드는 주유 10% 할인 혜택을 제공합니다"},
        {"type": "done", "validation": {"passed": True}},
    ]
    sse = b""
    for evt in events:
        sse += f"data: {json.dumps(evt, ensure_ascii=False)}\n\n".encode()

    # 1바이트씩 읽어 모든 한글 3바이트를 경계에서 분할
    mock_boto = MagicMock()
    mock_boto.invoke_agent_runtime.return_value = {"response": _ChunkedBody(sse, chunk=1)}

    with patch.object(client, "_client", mock_boto):
        received = [e async for e in client.invoke_stream("q", "s1")]

    assert received[0]["content"] == "딥드림 카드는 주유 10% 할인 혜택을 제공합니다"
    assert "�" not in received[0]["content"]  # replacement char 없음


async def test_stream_crlf_separator(client):
    """CRLF(\\r\\n\\r\\n) 구분자와 라인 끝 \\r를 처리해야 한다."""
    e1 = {"type": "token", "content": "가나다"}
    e2 = {"type": "done"}
    sse = (
        f"data: {json.dumps(e1, ensure_ascii=False)}\r\n\r\n".encode()
        + f"data: {json.dumps(e2, ensure_ascii=False)}\r\n\r\n".encode()
    )
    mock_boto = MagicMock()
    mock_boto.invoke_agent_runtime.return_value = {"response": _ChunkedBody(sse, chunk=3)}

    with patch.object(client, "_client", mock_boto):
        received = [e async for e in client.invoke_stream("q", "s1")]

    assert received[0]["content"] == "가나다"
    assert received[1]["type"] == "done"
