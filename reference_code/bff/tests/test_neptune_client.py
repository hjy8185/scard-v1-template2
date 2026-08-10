"""Tests for bff/clients/neptune_client.py."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from bff.clients.neptune_client import NeptuneClient
from bff.models import CytoscapeGraph


@pytest.fixture
def client():
    return NeptuneClient(endpoint="http://neptune:8182", region="us-east-1")


SAMPLE_GREMLIN_RESPONSE = {
    "result": {
        "data": [
            {
                "objects": [
                    {"id": "card_dd", "label": "CARD_Product", "T.id": "card_dd",
                     "properties": {"name": "딥드림"}},
                    {"id": "bnf_01", "label": "CARD_Benefit", "T.id": "bnf_01",
                     "properties": {"discount_rate": 5}},
                ]
            }
        ]
    }
}


async def test_get_card_subgraph(client):
    """Gremlin response → CytoscapeGraph conversion."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = SAMPLE_GREMLIN_RESPONSE
    mock_response.raise_for_status = MagicMock()

    with patch("bff.clients.neptune_client.httpx.AsyncClient") as MockClient:
        instance = AsyncMock()
        instance.post.return_value = mock_response
        MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
        MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

        graph = await client.get_card_subgraph("card_dd")
        assert isinstance(graph, CytoscapeGraph)
        assert len(graph.nodes) >= 1


async def test_card_not_found(client):
    """Non-existent card_id → empty graph."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"result": {"data": []}}
    mock_response.raise_for_status = MagicMock()

    with patch("bff.clients.neptune_client.httpx.AsyncClient") as MockClient:
        instance = AsyncMock()
        instance.post.return_value = mock_response
        MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
        MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

        graph = await client.get_card_subgraph("nonexistent")
        assert len(graph.nodes) == 0
        assert len(graph.edges) == 0
