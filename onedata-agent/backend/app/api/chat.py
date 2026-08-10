"""POST /api/chat - Main chat endpoint with SSE streaming.

Streams pipeline stage events and the final answer using Server-Sent Events
in the Vercel AI SDK data stream format.

Event format:
  0:<json_string>  - text token (answer content)
  2:<json_array>   - data annotation (stage events)
  8:<json_array>   - metadata annotation (final result)
  d:<json_object>  - finish event
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

# Singleton orchestrator instance
_orchestrator: Orchestrator | None = None


def _get_orchestrator() -> Orchestrator:
    """Get or create the orchestrator singleton."""
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = Orchestrator()
    return _orchestrator


# SSE headers to prevent proxy buffering
_SSE_HEADERS = {
    "x-vercel-ai-data-stream": "v1",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
    "Connection": "keep-alive",
}

# Chunk size for streaming answer text
_CHUNK_SIZE = 50


def _format_stage_event(event: PipelineEvent) -> str:
    """Format a stage event as a Vercel AI SDK data annotation line."""
    stage_data = {
        "stage": event.data.get("stage", ""),
        "status": event.data.get("status", ""),
        "ms": event.data.get("ms", 0),
        "data": event.data.get("payload"),
    }
    return f'2:{json.dumps([stage_data], ensure_ascii=False)}\n'


def _format_token(content: str) -> str:
    """Format a text token line."""
    return f'0:{json.dumps(content, ensure_ascii=False)}\n'


def _format_annotation(data: dict) -> str:
    """Format a metadata annotation line."""
    return f'8:{json.dumps([data], ensure_ascii=False)}\n'


def _format_finish(reason: str = "stop") -> str:
    """Format a finish event line."""
    return f'd:{json.dumps({"finishReason": reason})}\n'


async def _stream_chat(query: str, session_id: str, max_rows: int | None = None) -> AsyncGenerator[str, None]:
    """Stream the pipeline execution as SSE events."""
    orchestrator = _get_orchestrator()

    try:
        async for event in orchestrator.process_query(query, session_id, max_rows):
            if event.event_type == "stage":
                yield _format_stage_event(event)

            elif event.event_type == "token":
                content = event.data.get("content", "")
                if content:
                    # Stream answer in chunks for smooth frontend rendering
                    for i in range(0, len(content), _CHUNK_SIZE):
                        chunk = content[i : i + _CHUNK_SIZE]
                        yield _format_token(chunk)

            elif event.event_type == "done":
                # Final annotation with full result metadata
                annotation = {
                    "sql": event.data.get("sql"),
                    "tables_used": event.data.get("tables_used"),
                    "intent": event.data.get("intent"),
                    "confidence": event.data.get("confidence"),
                    "row_count": event.data.get("row_count"),
                    "total_ms": event.data.get("total_ms"),
                }
                yield _format_annotation(annotation)
                yield _format_finish("stop")
                return

            elif event.event_type == "error":
                error_msg = event.data.get("error", "Unknown error")
                yield _format_token(f"오류가 발생했습니다: {error_msg}")
                yield _format_finish("error")
                return

    except Exception as e:
        logger.error("Unexpected error in chat stream: %s", e, exc_info=True)
        yield _format_token(f"시스템 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")
        yield _format_finish("error")
        return

    # Safety: ensure finish event is always sent
    yield _format_finish("stop")


@router.post("/api/chat")
async def chat(request: ChatRequest) -> StreamingResponse:
    """Main chat endpoint - processes natural language queries via Text-to-SQL pipeline.

    Streams SSE events for real-time frontend progress display:
    1. intent stage - query classification
    2. context stage - ontology retrieval
    3. sql_generate stage - SQL generation
    4. execute stage - Athena execution
    5. answer stage - answer composition
    6. text tokens - the actual answer
    7. metadata - SQL, tables used, confidence
    """
    session_id = request.session_id or str(uuid.uuid4())
    logger.info("Chat request: session=%s query=%s", session_id, request.query[:80])

    return StreamingResponse(
        _stream_chat(request.query, session_id, request.max_rows),
        media_type="text/plain; charset=utf-8",
        headers=_SSE_HEADERS,
    )
