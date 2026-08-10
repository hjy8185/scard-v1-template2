"""Ontology mapper - maps user terms to ontology concepts.

Uses synonyms dictionary and fuzzy matching to map Korean business terms
to actual table/column names in the Onedata schema.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from app.config import settings
from app.models.ontology import TableMeta

logger = logging.getLogger(__name__)

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
_SYNONYMS_PATH = _BACKEND_DIR / settings.SYNONYMS_PATH


class OntologyMapper:
    """Maps user terms to ontology concepts using synonyms and keyword matching."""

    def __init__(self) -> None:
        self._synonyms: dict[str, dict[str, Any]] = {}
        self._loaded = False

    def load_synonyms(self) -> None:
        """Load synonym dictionary from JSON file."""
        if not _SYNONYMS_PATH.exists():
            logger.warning("Synonyms file not found: %s", _SYNONYMS_PATH)
            return

        try:
            with open(_SYNONYMS_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            self._synonyms = data.get("synonyms", {})
            self._loaded = True
            logger.info("Loaded %d synonym entries", len(self._synonyms))
        except Exception as e:
            logger.error("Failed to load synonyms: %s", e)

    def resolve_term(self, term: str) -> dict[str, Any] | None:
        """Resolve a user term to its canonical column/table mapping.

        Args:
            term: A Korean business term from the user's query.

        Returns:
            Dict with column_name, table_name, description if found, else None.
        """
        # Direct lookup
        if term in self._synonyms:
            return self._synonyms[term]

        # Try partial matching
        term_lower = term.lower()
        for key, value in self._synonyms.items():
            if term_lower in key.lower() or key.lower() in term_lower:
                return value

        return None

    def resolve_terms_in_query(self, query: str) -> list[dict[str, Any]]:
        """Find all resolvable terms in a query string.

        Scans the query for known synonyms and returns all matches.
        """
        matches = []
        for term, mapping in self._synonyms.items():
            if term in query:
                matches.append(
                    {
                        "term": term,
                        "column_name": mapping.get("column_name", ""),
                        "table_name": mapping.get("table_name", ""),
                        "description": mapping.get("description", ""),
                    }
                )
        return matches

    def suggest_tables(
        self, query: str, all_tables: list[TableMeta]
    ) -> list[str]:
        """Suggest relevant tables based on query terms.

        Uses synonym mappings and keyword matching against table descriptions.
        """
        suggested = set()

        # Check synonyms for table references
        resolved = self.resolve_terms_in_query(query)
        for r in resolved:
            if r.get("table_name"):
                suggested.add(r["table_name"])

        # Keyword matching against table descriptions
        query_terms = set(query.replace(",", " ").replace(".", " ").split())
        for table in all_tables:
            # Check if any query term appears in table description or column names
            searchable = (
                table.description
                + " "
                + " ".join(c.name + " " + c.description for c in table.columns)
            )
            for term in query_terms:
                if len(term) >= 2 and term in searchable:
                    suggested.add(table.table_name)
                    break

        return list(suggested)

    def get_column_for_term(self, term: str) -> str | None:
        """Get the actual column name for a business term."""
        mapping = self.resolve_term(term)
        if mapping:
            return mapping.get("column_name")
        return None

    def get_all_synonyms(self) -> dict[str, dict[str, Any]]:
        """Return the full synonym dictionary."""
        return self._synonyms.copy()
