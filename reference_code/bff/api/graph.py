"""GET /api/graph/{card_id} — Card subgraph for Cytoscape.js visualization."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from bff.clients.neptune_client import NeptuneClient
from bff.config import settings

router = APIRouter()

_neptune_client: NeptuneClient | None = None


def _get_neptune_client() -> NeptuneClient:
    global _neptune_client
    if _neptune_client is None:
        _neptune_client = NeptuneClient(
            endpoint=settings.NEPTUNE_ENDPOINT,
            region=settings.AWS_REGION,
        )
    return _neptune_client


@router.get("/api/graph/{card_id}")
async def get_card_graph(card_id: str):
    client = _get_neptune_client()
    graph = await client.get_card_subgraph(card_id)
    if not graph.nodes:
        raise HTTPException(status_code=404, detail=f"Card '{card_id}' not found")
    return graph.model_dump()
