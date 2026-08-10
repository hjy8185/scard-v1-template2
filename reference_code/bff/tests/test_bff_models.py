"""Tests for bff/models.py — Pydantic models."""

from bff.models import ChatRequest, StageEvent, CytoscapeGraph, CytoscapeNode, CytoscapeEdge, Scenario


def test_chat_request_defaults():
    req = ChatRequest(query="딥드림 카드 혜택 알려줘")
    assert req.query == "딥드림 카드 혜택 알려줘"
    assert req.session_id is None


def test_stage_event_serialization():
    stage = StageEvent(stage="glossary", status="done", ms=120, data={"card_id": "deep_dream"})
    d = stage.model_dump()
    assert d["stage"] == "glossary"
    assert d["status"] == "done"
    assert d["ms"] == 120
    assert d["data"]["card_id"] == "deep_dream"


def test_cytoscape_graph_structure():
    graph = CytoscapeGraph(
        nodes=[CytoscapeNode(data={"id": "n1", "label": "딥드림", "type": "CARD_Product"})],
        edges=[CytoscapeEdge(data={"id": "e1", "source": "n1", "target": "n2", "type": "HAS_BENEFIT"})],
    )
    assert len(graph.nodes) == 1
    assert len(graph.edges) == 1
    assert graph.nodes[0].data["type"] == "CARD_Product"
