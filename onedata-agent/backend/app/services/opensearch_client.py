"""OpenSearch client for semantic search over ontology and metadata.

Uses OpenSearch Serverless or managed domain with IAM SigV4 auth.
Performs vector similarity search to find relevant tables and columns
based on user's natural language query.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import botocore.auth
import botocore.awsrequest
import botocore.session
import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class OpenSearchError(Exception):
    """Raised when OpenSearch query fails."""
    pass


class OpenSearchClient:
    """Client for OpenSearch semantic search with SigV4 auth."""

    def __init__(
        self,
        endpoint: str | None = None,
        index: str | None = None,
        region: str | None = None,
    ) -> None:
        self._endpoint = (endpoint or settings.OPENSEARCH_ENDPOINT).rstrip("/")
        self._index = index or settings.OPENSEARCH_INDEX
        self._region = region or settings.AWS_REGION
        self._session = botocore.session.get_session()

    def _sign_request(self, method: str, url: str, body: bytes) -> dict[str, str]:
        """Sign request with SigV4 for OpenSearch IAM auth."""
        credentials = self._session.get_credentials().get_frozen_credentials()
        request = botocore.awsrequest.AWSRequest(
            method=method,
            url=url,
            data=body,
            headers={"Content-Type": "application/json"},
        )
        botocore.auth.SigV4Auth(
            credentials, "aoss", self._region
        ).add_auth(request)
        return dict(request.headers)

    async def search_tables(
        self, query_text: str, top_k: int = 10
    ) -> list[dict[str, Any]]:
        """Search for relevant tables using keyword + semantic matching."""
        search_body = {
            "size": top_k,
            "query": {
                "bool": {
                    "should": [
                        {
                            "multi_match": {
                                "query": query_text,
                                "fields": [
                                    "table_name^3",
                                    "description^2",
                                    "columns.name^2",
                                    "columns.description",
                                    "domain",
                                    "keywords",
                                ],
                                "type": "best_fields",
                            }
                        },
                        {
                            "match": {
                                "synonyms": {
                                    "query": query_text,
                                    "boost": 1.5,
                                }
                            }
                        },
                    ],
                    "minimum_should_match": 1,
                }
            },
            "_source": [
                "table_name",
                "description",
                "domain",
                "columns",
                "key_columns",
                "keywords",
            ],
        }

        url = f"{self._endpoint}/{self._index}/_search"
        body = json.dumps(search_body).encode()

        try:
            headers = self._sign_request("POST", url, body)
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, content=body, headers=headers)
                resp.raise_for_status()
                result = resp.json()
                hits = result.get("hits", {}).get("hits", [])
                return [
                    {
                        "table_name": h["_source"].get("table_name", ""),
                        "description": h["_source"].get("description", ""),
                        "domain": h["_source"].get("domain", ""),
                        "columns": h["_source"].get("columns", []),
                        "key_columns": h["_source"].get("key_columns", []),
                        "score": h.get("_score", 0),
                    }
                    for h in hits
                ]
        except httpx.HTTPStatusError as e:
            logger.error(
                "OpenSearch HTTP error: %s %s",
                e.response.status_code,
                e.response.text[:200],
            )
            raise OpenSearchError(
                f"OpenSearch query failed: HTTP {e.response.status_code}"
            ) from e
        except Exception as e:
            logger.error("OpenSearch query failed: %s", e)
            raise OpenSearchError(f"OpenSearch query failed: {e}") from e

    async def search_columns(
        self, query_text: str, top_k: int = 20
    ) -> list[dict[str, Any]]:
        """Search for specific columns matching the query."""
        search_body = {
            "size": top_k,
            "query": {
                "nested": {
                    "path": "columns",
                    "query": {
                        "bool": {
                            "should": [
                                {
                                    "match": {
                                        "columns.name": {
                                            "query": query_text,
                                            "boost": 3.0,
                                        }
                                    }
                                },
                                {
                                    "match": {
                                        "columns.description": {
                                            "query": query_text,
                                            "boost": 2.0,
                                        }
                                    }
                                },
                            ]
                        }
                    },
                    "inner_hits": {"size": 5},
                }
            },
            "_source": ["table_name", "domain"],
        }

        url = f"{self._endpoint}/{self._index}/_search"
        body = json.dumps(search_body).encode()

        try:
            headers = self._sign_request("POST", url, body)
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, content=body, headers=headers)
                resp.raise_for_status()
                result = resp.json()
                hits = result.get("hits", {}).get("hits", [])
                results = []
                for h in hits:
                    table_name = h["_source"].get("table_name", "")
                    inner = h.get("inner_hits", {}).get("columns", {}).get("hits", {}).get("hits", [])
                    for col_hit in inner:
                        col = col_hit.get("_source", {})
                        results.append(
                            {
                                "table_name": table_name,
                                "column_name": col.get("name", ""),
                                "column_description": col.get("description", ""),
                                "dtype": col.get("dtype", ""),
                                "score": col_hit.get("_score", 0),
                            }
                        )
                return results
        except Exception as e:
            logger.error("OpenSearch column search failed: %s", e)
            raise OpenSearchError(f"Column search failed: {e}") from e

    async def health_check(self) -> bool:
        """Check if OpenSearch is reachable."""
        try:
            url = f"{self._endpoint}/_cluster/health"
            headers = self._sign_request("GET", url, b"")
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(url, headers=headers)
                return resp.status_code == 200
        except Exception:
            return False
