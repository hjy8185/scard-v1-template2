"""Ontology-related domain models."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ColumnMeta(BaseModel):
    """Metadata for a single column."""

    name: str = Field(..., description="Column name (Korean)")
    dtype: str = Field("string", description="Data type")
    description: str = Field("", description="Column description")
    is_key: bool = Field(False, description="Whether this is a key/join column")
    sample_values: list[str] = Field(default_factory=list)


class TableMeta(BaseModel):
    """Metadata for a single table."""

    table_name: str = Field(..., description="Physical table name")
    description: str = Field("", description="Table description (Korean)")
    domain: str = Field("", description="Business domain")
    columns: list[ColumnMeta] = Field(default_factory=list)
    key_columns: list[str] = Field(default_factory=list)
    row_count_approx: int | None = None


class OntologyNode(BaseModel):
    """A node in the ontology graph."""

    id: str
    label: str
    node_type: str = Field("", description="e.g., table, column, concept, domain")
    properties: dict[str, Any] = Field(default_factory=dict)


class OntologyRelation(BaseModel):
    """A relationship in the ontology graph."""

    source_id: str
    target_id: str
    relation_type: str = Field("", description="e.g., has_column, joins_to, belongs_to")
    properties: dict[str, Any] = Field(default_factory=dict)


class OntologyContext(BaseModel):
    """Ontology context retrieved for SQL generation."""

    tables: list[TableMeta] = Field(default_factory=list)
    relationships: list[OntologyRelation] = Field(default_factory=list)
    relevant_columns: list[ColumnMeta] = Field(default_factory=list)
    join_paths: list[dict[str, Any]] = Field(default_factory=list)
