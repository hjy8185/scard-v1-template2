"""Ontology loader - loads from Neptune graph or local JSON cache.

Falls back to local cache when Neptune is unavailable.
The cache contains table metadata, column descriptions, and relationship info.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

from app.config import settings
from app.models.ontology import ColumnMeta, OntologyContext, OntologyRelation, TableMeta

logger = logging.getLogger(__name__)

# Resolve data paths relative to the backend directory
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
_ONTOLOGY_CACHE_PATH = _BACKEND_DIR / settings.ONTOLOGY_CACHE_PATH
_TABLE_METADATA_PATH = _BACKEND_DIR / settings.TABLE_METADATA_PATH


class OntologyLoader:
    """Loads and caches ontology data from Neptune or local JSON files."""

    def __init__(self) -> None:
        self._table_metadata: dict[str, TableMeta] = {}
        self._relationships: list[OntologyRelation] = []
        self._loaded = False

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def load_from_cache(self) -> None:
        """Load ontology from local JSON cache files."""
        self._load_table_metadata()
        self._load_ontology_cache()
        self._loaded = True
        logger.info(
            "Ontology loaded from cache: %d tables, %d relationships",
            len(self._table_metadata),
            len(self._relationships),
        )

    def _load_table_metadata(self) -> None:
        """Load table metadata from JSON file."""
        if not _TABLE_METADATA_PATH.exists():
            logger.warning("Table metadata file not found: %s", _TABLE_METADATA_PATH)
            return

        try:
            with open(_TABLE_METADATA_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)

            for table_data in data.get("tables", []):
                columns = [
                    ColumnMeta(
                        name=col.get("name", ""),
                        dtype=col.get("dtype", "string"),
                        description=col.get("description", ""),
                        is_key=col.get("is_key", False),
                        sample_values=col.get("sample_values", []),
                    )
                    for col in table_data.get("columns", [])
                ]
                table = TableMeta(
                    table_name=table_data["table_name"],
                    description=table_data.get("description", ""),
                    domain=table_data.get("domain", ""),
                    columns=columns,
                    key_columns=table_data.get("key_columns", []),
                    row_count_approx=table_data.get("row_count_approx"),
                )
                self._table_metadata[table.table_name] = table
        except Exception as e:
            logger.error("Failed to load table metadata: %s", e)

    def _load_ontology_cache(self) -> None:
        """Load ontology relationships from cache."""
        if not _ONTOLOGY_CACHE_PATH.exists():
            logger.warning("Ontology cache file not found: %s", _ONTOLOGY_CACHE_PATH)
            return

        try:
            with open(_ONTOLOGY_CACHE_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)

            for rel_data in data.get("relationships", []):
                rel = OntologyRelation(
                    source_id=rel_data.get("source", ""),
                    target_id=rel_data.get("target", ""),
                    relation_type=rel_data.get("type", ""),
                    properties=rel_data.get("properties", {}),
                )
                self._relationships.append(rel)
        except Exception as e:
            logger.error("Failed to load ontology cache: %s", e)

    async def load_from_neptune(self, neptune_client: Any) -> None:
        """Load ontology from Neptune graph database.

        Falls back to cache if Neptune is unavailable.
        """
        try:
            # Try to get all table nodes
            results = await neptune_client.execute_gremlin(
                "g.V().has('node_type', 'table').elementMap()"
            )

            for node in results:
                table_name = node.get("table_name", "")
                if table_name:
                    # Get columns for this table
                    columns_data = await neptune_client.get_table_columns(table_name)
                    columns = [
                        ColumnMeta(
                            name=col.get("column_name", ""),
                            dtype=col.get("dtype", "string"),
                            description=col.get("description", ""),
                            is_key=col.get("is_key", False),
                        )
                        for col in columns_data
                    ]
                    table = TableMeta(
                        table_name=table_name,
                        description=node.get("description", ""),
                        domain=node.get("domain", ""),
                        columns=columns,
                        key_columns=[c.name for c in columns if c.is_key],
                    )
                    self._table_metadata[table_name] = table

            # Load relationships
            rel_results = await neptune_client.execute_gremlin(
                "g.E().has('relation_type').elementMap()"
            )
            for rel in rel_results:
                self._relationships.append(
                    OntologyRelation(
                        source_id=str(rel.get("OUT", {}).get("id", "")),
                        target_id=str(rel.get("IN", {}).get("id", "")),
                        relation_type=rel.get("relation_type", ""),
                        properties={
                            k: v
                            for k, v in rel.items()
                            if k not in ("id", "label", "IN", "OUT", "relation_type")
                        },
                    )
                )

            self._loaded = True
            logger.info(
                "Ontology loaded from Neptune: %d tables, %d relationships",
                len(self._table_metadata),
                len(self._relationships),
            )

        except Exception as e:
            logger.warning("Failed to load from Neptune (%s), using cache", e)
            if not self._loaded:
                self.load_from_cache()

    def get_table(self, table_name: str) -> TableMeta | None:
        """Get metadata for a specific table."""
        return self._table_metadata.get(table_name)

    def get_tables_by_domain(self, domain: str) -> list[TableMeta]:
        """Get all tables in a domain."""
        return [t for t in self._table_metadata.values() if t.domain == domain]

    def get_all_tables(self) -> list[TableMeta]:
        """Get all table metadata."""
        return list(self._table_metadata.values())

    def get_relationships_for_table(self, table_name: str) -> list[OntologyRelation]:
        """Get all relationships involving a table."""
        return [
            r
            for r in self._relationships
            if r.source_id == table_name or r.target_id == table_name
        ]

    def build_context(self, table_names: list[str]) -> OntologyContext:
        """Build an OntologyContext for a set of tables.

        Used to provide context to the SQL generator.
        """
        tables = []
        relevant_columns = []
        relationships = []

        for name in table_names:
            table = self._table_metadata.get(name)
            if table:
                tables.append(table)
                relevant_columns.extend(table.columns)
                relationships.extend(self.get_relationships_for_table(name))

        # Find join paths between the selected tables
        join_paths = []
        table_set = set(table_names)
        for rel in self._relationships:
            if rel.source_id in table_set and rel.target_id in table_set:
                join_paths.append(
                    {
                        "from": rel.source_id,
                        "to": rel.target_id,
                        "type": rel.relation_type,
                        "join_key": rel.properties.get("join_key", "그룹md번호"),
                    }
                )

        return OntologyContext(
            tables=tables,
            relationships=relationships,
            relevant_columns=relevant_columns,
            join_paths=join_paths,
        )

    def format_context_for_prompt(self, context: OntologyContext) -> str:
        """Format ontology context as a string for LLM prompts."""
        lines = []

        lines.append("=== AVAILABLE TABLES ===")
        for table in context.tables:
            lines.append(f"\n## {table.table_name}")
            lines.append(f"설명: {table.description}")
            lines.append(f"도메인: {table.domain}")
            lines.append("컬럼:")
            for col in table.columns:
                key_marker = " [KEY]" if col.is_key else ""
                lines.append(f"  - {col.name} ({col.dtype}): {col.description}{key_marker}")

        if context.join_paths:
            lines.append("\n=== JOIN RELATIONSHIPS ===")
            for jp in context.join_paths:
                lines.append(
                    f"  {jp['from']} --[{jp['type']}]--> {jp['to']} "
                    f"(JOIN KEY: {jp['join_key']})"
                )

        return "\n".join(lines)
