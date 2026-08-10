"""BFF Pydantic models."""

from __future__ import annotations

from pydantic import BaseModel


class ChatRequest(BaseModel):
    query: str
    session_id: str | None = None
    preset_card_id: str | None = None   # U7: 자격판정 등 카드 컨텍스트 주입


class StageEvent(BaseModel):
    stage: str       # glossary | classify | search | traverse | prune | generate | validate | correct
    status: str      # done | active | blocked | skip | pending
    ms: int
    data: dict | None = None


class CytoscapeNode(BaseModel):
    data: dict


class CytoscapeEdge(BaseModel):
    data: dict


class CytoscapeGraph(BaseModel):
    nodes: list[CytoscapeNode]
    edges: list[CytoscapeEdge]


class Scenario(BaseModel):
    id: str
    title: str
    query: str
    category: str
    description: str | None = None
