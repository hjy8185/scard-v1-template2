"""Neptune graph query endpoints.

Provides API for querying the ontology graph - table relationships,
join paths, and domain exploration.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.services.neptune_client import NeptuneClient, NeptuneError
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/graph", tags=["graph"])

_neptune_client: NeptuneClient | None = None


def _get_neptune() -> NeptuneClient:
    global _neptune_client
    if _neptune_client is None:
        _neptune_client = NeptuneClient()
    return _neptune_client


@router.get("/tables/{table_name}/relationships")
async def get_table_relationships(table_name: str) -> dict[str, Any]:
    """Get all relationships for a table in the ontology graph."""
    try:
        client = _get_neptune()
        results = await client.get_table_relationships(table_name)
        return {"table": table_name, "relationships": results}
    except NeptuneError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/join-path")
async def get_join_path(
    source: str = Query(..., description="Source table name"),
    target: str = Query(..., description="Target table name"),
    max_hops: int = Query(3, ge=1, le=5, description="Maximum join hops"),
) -> dict[str, Any]:
    """Find join path between two tables."""
    try:
        client = _get_neptune()
        paths = await client.get_join_path(source, target, max_hops)
        return {
            "source": source,
            "target": target,
            "paths": paths,
            "path_count": len(paths),
        }
    except NeptuneError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/domains/{domain}/tables")
async def get_domain_tables(domain: str) -> dict[str, Any]:
    """Get all tables in a specific domain."""
    try:
        client = _get_neptune()
        tables = await client.get_domain_tables(domain)
        return {"domain": domain, "tables": tables, "count": len(tables)}
    except NeptuneError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/search")
async def search_graph(
    q: str = Query(..., description="Search query"),
) -> dict[str, Any]:
    """Search the ontology graph for concepts matching query."""
    try:
        client = _get_neptune()
        results = await client.find_tables_by_concept(q)
        return {"query": q, "results": results, "count": len(results)}
    except NeptuneError as e:
        raise HTTPException(status_code=502, detail=str(e))
