"""Data catalog and metadata endpoints.

Provides access to table metadata, column descriptions, and the synonym dictionary.
Used by the frontend for data exploration and by the agent for context.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.ontology.loader import OntologyLoader
from app.ontology.mapper import OntologyMapper

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/catalog", tags=["catalog"])

_ontology_loader: OntologyLoader | None = None
_ontology_mapper: OntologyMapper | None = None


def _get_loader() -> OntologyLoader:
    global _ontology_loader
    if _ontology_loader is None:
        _ontology_loader = OntologyLoader()
        _ontology_loader.load_from_cache()
    return _ontology_loader


def _get_mapper() -> OntologyMapper:
    global _ontology_mapper
    if _ontology_mapper is None:
        _ontology_mapper = OntologyMapper()
        _ontology_mapper.load_synonyms()
    return _ontology_mapper


@router.get("/tables")
async def list_tables(
    domain: str | None = Query(None, description="Filter by domain"),
) -> dict[str, Any]:
    """List all available tables with metadata."""
    loader = _get_loader()

    if domain:
        tables = loader.get_tables_by_domain(domain)
    else:
        tables = loader.get_all_tables()

    return {
        "tables": [
            {
                "table_name": t.table_name,
                "description": t.description,
                "domain": t.domain,
                "column_count": len(t.columns),
                "key_columns": t.key_columns,
            }
            for t in tables
        ],
        "count": len(tables),
    }


@router.get("/tables/{table_name}")
async def get_table_detail(table_name: str) -> dict[str, Any]:
    """Get detailed metadata for a specific table."""
    loader = _get_loader()
    table = loader.get_table(table_name)

    if not table:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

    return {
        "table_name": table.table_name,
        "description": table.description,
        "domain": table.domain,
        "columns": [
            {
                "name": c.name,
                "dtype": c.dtype,
                "description": c.description,
                "is_key": c.is_key,
                "sample_values": c.sample_values,
            }
            for c in table.columns
        ],
        "key_columns": table.key_columns,
        "row_count_approx": table.row_count_approx,
    }


@router.get("/domains")
async def list_domains() -> dict[str, Any]:
    """List all available data domains."""
    loader = _get_loader()
    tables = loader.get_all_tables()

    domains: dict[str, int] = {}
    for t in tables:
        domains[t.domain] = domains.get(t.domain, 0) + 1

    return {
        "domains": [
            {"name": name, "table_count": count}
            for name, count in sorted(domains.items())
        ]
    }


@router.get("/synonyms")
async def get_synonyms(
    term: str | None = Query(None, description="Look up a specific term"),
) -> dict[str, Any]:
    """Get synonym dictionary or look up a specific term."""
    mapper = _get_mapper()

    if term:
        result = mapper.resolve_term(term)
        if result:
            return {"term": term, "mapping": result}
        raise HTTPException(status_code=404, detail=f"Term '{term}' not found")

    all_synonyms = mapper.get_all_synonyms()
    return {"synonyms": all_synonyms, "count": len(all_synonyms)}


@router.get("/search")
async def search_catalog(
    q: str = Query(..., description="Search query"),
) -> dict[str, Any]:
    """Search the data catalog for relevant tables and columns."""
    loader = _get_loader()
    mapper = _get_mapper()

    # Search through synonyms
    term_matches = mapper.resolve_terms_in_query(q)

    # Search through tables
    all_tables = loader.get_all_tables()
    table_suggestions = mapper.suggest_tables(q, all_tables)

    # Get table details for suggestions
    suggested_tables = []
    for table_name in table_suggestions:
        table = loader.get_table(table_name)
        if table:
            suggested_tables.append(
                {
                    "table_name": table.table_name,
                    "description": table.description,
                    "domain": table.domain,
                }
            )

    return {
        "query": q,
        "term_matches": term_matches,
        "suggested_tables": suggested_tables,
    }
