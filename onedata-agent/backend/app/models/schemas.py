"""Pydantic models for API request/response schemas."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """Chat endpoint request body."""

    query: str = Field(..., description="User's natural language question")
    session_id: str | None = Field(None, description="Session ID for conversation continuity")
    max_rows: int | None = Field(None, description="Override max row limit for results")


class ChatMessage(BaseModel):
    """A single message in conversation history."""

    role: str = Field(..., description="'user' or 'assistant'")
    content: str


class StageEvent(BaseModel):
    """SSE stage event for pipeline progress."""

    stage: str = Field(
        ...,
        description="Pipeline stage: intent | context | sql_generate | execute | answer",
    )
    status: str = Field(..., description="active | done | error | skip")
    ms: int = Field(0, description="Elapsed milliseconds for this stage")
    data: dict[str, Any] | None = Field(None, description="Stage-specific payload")


class SQLResult(BaseModel):
    """Result of SQL execution."""

    sql: str = Field(..., description="The generated SQL query")
    columns: list[str] = Field(default_factory=list)
    rows: list[dict[str, Any]] = Field(default_factory=list)
    row_count: int = 0
    truncated: bool = False
    execution_time_ms: int = 0
    error: str | None = None


class QueryResult(BaseModel):
    """Complete result from the orchestrator pipeline."""

    answer: str = Field(..., description="Natural language answer")
    sql: str | None = Field(None, description="Generated SQL (if applicable)")
    sql_result: SQLResult | None = None
    intent: str | None = None
    tables_used: list[str] = Field(default_factory=list)
    confidence: float = Field(0.0, ge=0.0, le=1.0)
    error: str | None = None


class HealthResponse(BaseModel):
    """Health check response."""

    status: str = "ok"
    version: str = "1.0.0"
    services: dict[str, str] = Field(default_factory=dict)
