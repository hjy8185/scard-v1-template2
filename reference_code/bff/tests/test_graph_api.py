"""Tests for bff/api/graph.py — Cytoscape graph endpoint."""

from unittest.mock import AsyncMock, patch

from httpx import AsyncClient, ASGITransport

from bff.models import CytoscapeGraph, CytoscapeNode, CytoscapeEdge


def _get_app():
    from bff.main import app
    return app


MOCK_GRAPH = CytoscapeGraph(
    nodes=[CytoscapeNode(data={"id": "card_dd", "label": "딥드림", "type": "CARD_Product"})],
    edges=[CytoscapeEdge(data={"id": "e1", "source": "card_dd", "target": "bnf_01", "type": "HAS_BENEFIT"})],
)


async def test_get_card_graph():
    """GET /api/graph/{card_id} → Cytoscape JSON."""
    app = _get_app()
    mock_neptune = AsyncMock()
    mock_neptune.get_card_subgraph.return_value = MOCK_GRAPH

    with patch("bff.api.graph._get_neptune_client", return_value=mock_neptune):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/graph/card_dd")
            assert resp.status_code == 200
            data = resp.json()
            assert "nodes" in data
            assert "edges" in data
            assert len(data["nodes"]) == 1


async def test_card_not_found_empty():
    """Non-existent card → 404."""
    app = _get_app()
    mock_neptune = AsyncMock()
    mock_neptune.get_card_subgraph.return_value = CytoscapeGraph(nodes=[], edges=[])

    with patch("bff.api.graph._get_neptune_client", return_value=mock_neptune):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/graph/nonexistent")
            assert resp.status_code == 404
