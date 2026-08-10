"""Index Onedata table metadata into OpenSearch Serverless for semantic search.

This script:
1. Reads the table-mapping.yml and glossary.yml ontology files
2. Creates an OpenSearch Serverless index with vector search configuration
3. Generates embeddings for table/column descriptions using Bedrock
4. Indexes documents for semantic search by the AI agent

Usage:
    python scripts/index_opensearch.py [--endpoint ENDPOINT] [--recreate]

Requirements:
    pip install boto3 opensearch-py requests-aws4auth pyyaml
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import boto3
import yaml
from opensearchpy import OpenSearch, RequestsHttpConnection
from requests_aws4auth import AWS4Auth


# Configuration
DEFAULT_OPENSEARCH_ENDPOINT = os.environ.get(
    "OPENSEARCH_ENDPOINT", "https://localhost:9200"
)
DEFAULT_INDEX_NAME = os.environ.get("OPENSEARCH_INDEX", "onedata-ontology")
DEFAULT_REGION = os.environ.get("AWS_REGION", "ap-northeast-2")
EMBEDDING_MODEL_ID = "amazon.titan-embed-text-v2:0"
EMBEDDING_DIMENSION = 1024

# Paths
BASE_DIR = Path(__file__).parent.parent
TABLE_MAPPING_PATH = BASE_DIR / "ontology" / "table-mapping.yml"
GLOSSARY_PATH = BASE_DIR / "ontology" / "glossary.yml"


def get_opensearch_client(endpoint: str, region: str) -> OpenSearch:
    """Create an OpenSearch client with AWS IAM authentication."""
    session = boto3.Session()
    credentials = session.get_credentials()
    frozen_credentials = credentials.get_frozen_credentials()

    auth = AWS4Auth(
        frozen_credentials.access_key,
        frozen_credentials.secret_key,
        region,
        "aoss",
        session_token=frozen_credentials.token,
    )

    # Strip protocol for host
    host = endpoint.replace("https://", "").replace("http://", "")

    client = OpenSearch(
        hosts=[{"host": host, "port": 443}],
        http_auth=auth,
        use_ssl=True,
        verify_certs=True,
        connection_class=RequestsHttpConnection,
        timeout=300,
    )

    return client


def get_embedding(text: str, bedrock_client: Any) -> list[float]:
    """Generate text embedding using Amazon Bedrock Titan Embeddings."""
    response = bedrock_client.invoke_model(
        modelId=EMBEDDING_MODEL_ID,
        body=json.dumps({
            "inputText": text,
            "dimensions": EMBEDDING_DIMENSION,
            "normalize": True,
        }),
    )

    result = json.loads(response["body"].read())
    return result["embedding"]


def create_index(client: OpenSearch, index_name: str, recreate: bool = False) -> None:
    """Create the OpenSearch index with vector search mapping."""
    print(f"[1/4] Setting up index: {index_name}")

    # Check if index exists
    if client.indices.exists(index=index_name):
        if recreate:
            print(f"       Deleting existing index...")
            client.indices.delete(index=index_name)
        else:
            print(f"       Index already exists. Use --recreate to rebuild.")
            return

    # Index settings optimized for vector search
    index_body = {
        "settings": {
            "index": {
                "number_of_shards": 2,
                "number_of_replicas": 0,
                "knn": True,
                "knn.algo_param.ef_search": 512,
            }
        },
        "mappings": {
            "properties": {
                # Vector field for semantic search
                "embedding": {
                    "type": "knn_vector",
                    "dimension": EMBEDDING_DIMENSION,
                    "method": {
                        "name": "hnsw",
                        "space_type": "cosinesimil",
                        "engine": "nmslib",
                        "parameters": {
                            "ef_construction": 512,
                            "m": 16,
                        },
                    },
                },
                # Document metadata
                "doc_type": {
                    "type": "keyword",
                },
                "table_name": {
                    "type": "keyword",
                },
                "ontology_class": {
                    "type": "keyword",
                },
                "subsidiary": {
                    "type": "keyword",
                },
                # Searchable text fields
                "description": {
                    "type": "text",
                    "analyzer": "standard",
                },
                "description_ko": {
                    "type": "text",
                    "analyzer": "standard",
                },
                "column_name": {
                    "type": "keyword",
                },
                "column_description": {
                    "type": "text",
                    "analyzer": "standard",
                },
                # Structured metadata
                "grain": {
                    "type": "text",
                },
                "partition_key": {
                    "type": "keyword",
                },
                "join_keys": {
                    "type": "keyword",
                },
                "columns_json": {
                    "type": "text",
                    "index": False,
                },
                # Glossary-specific
                "term_ko": {
                    "type": "keyword",
                },
                "term_en": {
                    "type": "keyword",
                },
                "term_definition": {
                    "type": "text",
                },
            }
        },
    }

    client.indices.create(index=index_name, body=index_body)
    print(f"       Index created with {EMBEDDING_DIMENSION}-dim vector field.")


def load_table_mapping() -> dict[str, Any]:
    """Load table-mapping.yml."""
    with open(TABLE_MAPPING_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_glossary() -> dict[str, Any]:
    """Load glossary.yml."""
    with open(GLOSSARY_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def build_table_documents(mapping: dict[str, Any]) -> list[dict[str, Any]]:
    """Build indexable documents from table mapping."""
    documents = []
    tables = mapping.get("tables", {})

    for table_name, table_info in tables.items():
        # Build rich text description for embedding
        columns = table_info.get("columns", {})
        columns_text = "; ".join(
            [f"{col}: {desc}" for col, desc in columns.items()]
        )

        embedding_text = (
            f"Table: {table_name}. "
            f"Description: {table_info.get('description', '')}. "
            f"Korean: {table_info.get('description_ko', '')}. "
            f"Subsidiary: {table_info.get('subsidiary', '')}. "
            f"Ontology class: {table_info.get('ontology_class', '')}. "
            f"Grain: {table_info.get('grain', '')}. "
            f"Columns: {columns_text}"
        )

        doc = {
            "doc_type": "table",
            "table_name": table_name,
            "ontology_class": str(table_info.get("ontology_class", "")),
            "subsidiary": table_info.get("subsidiary", ""),
            "description": table_info.get("description", ""),
            "description_ko": table_info.get("description_ko", ""),
            "grain": table_info.get("grain", ""),
            "partition_key": table_info.get("partition", ""),
            "join_keys": ["그룹md번호"],
            "columns_json": json.dumps(columns, ensure_ascii=False),
            "_embedding_text": embedding_text,
        }
        documents.append(doc)

        # Also index individual columns for fine-grained search
        for col_name, col_desc in columns.items():
            col_embedding_text = (
                f"Column '{col_name}' in table '{table_name}': {col_desc}. "
                f"Table description: {table_info.get('description', '')}. "
                f"Subsidiary: {table_info.get('subsidiary', '')}."
            )

            col_doc = {
                "doc_type": "column",
                "table_name": table_name,
                "ontology_class": str(table_info.get("ontology_class", "")),
                "subsidiary": table_info.get("subsidiary", ""),
                "column_name": col_name,
                "column_description": col_desc,
                "description": table_info.get("description", ""),
                "_embedding_text": col_embedding_text,
            }
            documents.append(col_doc)

    return documents


def build_glossary_documents(glossary: dict[str, Any]) -> list[dict[str, Any]]:
    """Build indexable documents from glossary."""
    documents = []
    terms = glossary.get("terms", {})

    for term_ko, term_info in terms.items():
        if isinstance(term_info, str):
            term_info = {"english": term_info, "description": term_info}

        english = term_info.get("english", "")
        description = term_info.get("description", "")
        usage = term_info.get("usage", "")
        context = term_info.get("context", "")

        embedding_text = (
            f"Korean term: {term_ko}. "
            f"English: {english}. "
            f"Description: {description}. "
            f"Usage: {usage}. "
            f"Context: {context}."
        )

        doc = {
            "doc_type": "glossary",
            "term_ko": term_ko,
            "term_en": english,
            "term_definition": description,
            "description": f"{english}: {description}",
            "_embedding_text": embedding_text,
        }
        documents.append(doc)

    return documents


def index_documents(
    client: OpenSearch,
    bedrock_client: Any,
    index_name: str,
    documents: list[dict[str, Any]],
) -> int:
    """Generate embeddings and index documents into OpenSearch."""
    print(f"[3/4] Indexing {len(documents)} documents...")

    indexed_count = 0
    errors = []

    for i, doc in enumerate(documents):
        try:
            # Extract embedding text and remove from indexed doc
            embedding_text = doc.pop("_embedding_text")

            # Generate embedding
            embedding = get_embedding(embedding_text, bedrock_client)
            doc["embedding"] = embedding

            # Index document
            doc_id = f"{doc['doc_type']}_{doc.get('table_name', doc.get('term_ko', ''))}_{i}"
            client.index(
                index=index_name,
                id=doc_id,
                body=doc,
            )

            indexed_count += 1

            # Progress reporting
            if (i + 1) % 50 == 0 or (i + 1) == len(documents):
                print(f"       Progress: {i + 1}/{len(documents)} documents indexed")

            # Rate limiting for Bedrock
            if (i + 1) % 10 == 0:
                time.sleep(0.5)

        except Exception as e:
            errors.append({"doc_index": i, "error": str(e)})
            if len(errors) > 10:
                print(f"       Too many errors ({len(errors)}), stopping.")
                break

    if errors:
        print(f"       Warnings: {len(errors)} documents failed to index")
        for err in errors[:5]:
            print(f"         - Doc {err['doc_index']}: {err['error']}")

    return indexed_count


def verify_index(client: OpenSearch, index_name: str) -> None:
    """Verify the index by running a sample search."""
    print(f"[4/4] Verifying index...")

    # Count documents
    count_response = client.count(index=index_name)
    total_docs = count_response["count"]
    print(f"       Total indexed documents: {total_docs}")

    # Sample keyword search
    search_body = {
        "query": {
            "match": {
                "description": "customer transaction"
            }
        },
        "size": 5,
    }

    response = client.search(index=index_name, body=search_body)
    hits = response["hits"]["hits"]
    print(f"       Sample search 'customer transaction': {len(hits)} results")
    for hit in hits[:3]:
        source = hit["_source"]
        print(
            f"         - [{source.get('doc_type')}] "
            f"{source.get('table_name', source.get('term_ko', ''))}: "
            f"{source.get('description', '')[:60]}"
        )

    # Count by doc_type
    agg_body = {
        "size": 0,
        "aggs": {
            "by_type": {
                "terms": {"field": "doc_type"}
            }
        },
    }
    response = client.search(index=index_name, body=agg_body)
    buckets = response["aggregations"]["by_type"]["buckets"]
    print(f"       Document types:")
    for bucket in buckets:
        print(f"         - {bucket['key']}: {bucket['doc_count']}")

    print("\n[DONE] Indexing complete.")


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Index Onedata table metadata into OpenSearch"
    )
    parser.add_argument(
        "--endpoint",
        default=DEFAULT_OPENSEARCH_ENDPOINT,
        help="OpenSearch Serverless endpoint URL",
    )
    parser.add_argument(
        "--index",
        default=DEFAULT_INDEX_NAME,
        help="OpenSearch index name",
    )
    parser.add_argument(
        "--region",
        default=DEFAULT_REGION,
        help="AWS region",
    )
    parser.add_argument(
        "--recreate",
        action="store_true",
        help="Delete and recreate the index",
    )
    parser.add_argument(
        "--skip-embeddings",
        action="store_true",
        help="Skip embedding generation (index without vectors)",
    )

    args = parser.parse_args()

    # Validate input files exist
    if not TABLE_MAPPING_PATH.exists():
        print(f"ERROR: Table mapping not found: {TABLE_MAPPING_PATH}")
        sys.exit(1)
    if not GLOSSARY_PATH.exists():
        print(f"ERROR: Glossary not found: {GLOSSARY_PATH}")
        sys.exit(1)

    # Initialize clients
    client = get_opensearch_client(args.endpoint, args.region)
    bedrock_client = boto3.client("bedrock-runtime", region_name=args.region)

    # Step 1: Create index
    create_index(client, args.index, recreate=args.recreate)

    # Step 2: Build documents
    print(f"[2/4] Building documents from ontology files...")
    mapping = load_table_mapping()
    glossary = load_glossary()

    table_docs = build_table_documents(mapping)
    glossary_docs = build_glossary_documents(glossary)
    all_documents = table_docs + glossary_docs

    print(f"       Table documents: {len(table_docs)}")
    print(f"       Glossary documents: {len(glossary_docs)}")
    print(f"       Total documents: {len(all_documents)}")

    # Step 3: Index documents
    if args.skip_embeddings:
        print("       [SKIP] Embedding generation skipped. Indexing without vectors.")
        indexed = 0
        for i, doc in enumerate(all_documents):
            doc.pop("_embedding_text", None)
            doc_id = f"{doc['doc_type']}_{doc.get('table_name', doc.get('term_ko', ''))}_{i}"
            client.index(index=args.index, id=doc_id, body=doc)
            indexed += 1
        print(f"       Indexed {indexed} documents (no vectors).")
    else:
        indexed = index_documents(client, bedrock_client, args.index, all_documents)

    # Step 4: Verify
    # Wait for index refresh
    time.sleep(2)
    verify_index(client, args.index)


if __name__ == "__main__":
    main()
