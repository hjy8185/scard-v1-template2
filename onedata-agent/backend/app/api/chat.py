"""POST /api/chat - Main chat endpoint with SSE streaming.

Streams pipeline stage events and the final answer using standard SSE format.
Frontend expects: data: {"event_type":"...", "status":"...", "data":{...}}
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.agents.orchestrator import Orchestrator, PipelineEvent
from app.models.schemas import ChatRequest

logger = logging.getLogger(__name__)
router = APIRouter()

_orchestrator: Orchestrator | None = None


def _get_orchestrator() -> Orchestrator:
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = Orchestrator()
    return _orchestrator


_SSE_HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
    "Connection": "keep-alive",
}


def _sse_line(event: dict) -> str:
    """Format a single SSE data line."""
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


async def _stream_chat(query: str, session_id: str, max_rows: int | None = None) -> AsyncGenerator[str, None]:
    orchestrator = _get_orchestrator()

    try:
        async for event in orchestrator.process_query(query, session_id, max_rows):
            if event.event_type == "stage":
                yield _sse_line({
                    "event_type": event.data.get("stage", "unknown"),
                    "status": event.data.get("status", "active"),
                    "ms": event.data.get("ms", 0),
                    "data": event.data.get("payload"),
                })

            elif event.event_type == "token":
                content = event.data.get("content", "")
                if content:
                    yield _sse_line({
                        "event_type": "answer",
                        "status": "done",
                        "data": {"content": content},
                    })

            elif event.event_type == "done":
                yield _sse_line({
                    "event_type": "done",
                    "status": "done",
                    "data": {
                        "sql": event.data.get("sql"),
                        "tables_used": event.data.get("tables_used"),
                        "intent": event.data.get("intent"),
                        "confidence": event.data.get("confidence"),
                        "row_count": event.data.get("row_count"),
                        "total_ms": event.data.get("total_ms"),
                        "columns": event.data.get("columns"),
                        "rows": event.data.get("rows"),
                    },
                })
                return

            elif event.event_type == "error":
                yield _sse_line({
                    "event_type": "error",
                    "status": "error",
                    "data": {"message": event.data.get("error", "Unknown error")},
                })
                return

    except Exception as e:
        logger.error("Unexpected error in chat stream: %s", e, exc_info=True)
        yield _sse_line({
            "event_type": "error",
            "status": "error",
            "data": {"message": "시스템 오류가 발생했습니다."},
        })


@router.post("/api/chat")
async def chat(request: ChatRequest) -> StreamingResponse:
    session_id = request.session_id or str(uuid.uuid4())
    logger.info("Chat request: session=%s query=%s", session_id, request.query[:80])

    return StreamingResponse(
        _stream_chat(request.query, session_id, request.max_rows),
        media_type="text/event-stream; charset=utf-8",
        headers=_SSE_HEADERS,
    )
