"""Load the Onedata domain ontology (TTL) into Amazon Neptune.

This script:
1. Reads the domain.ttl ontology file
2. Connects to Neptune using IAM authentication (SigV4)
3. Loads the ontology triples via the Neptune SPARQL endpoint
4. Verifies the load by running a sample query

Usage:
    python scripts/load_ontology_to_neptune.py [--endpoint ENDPOINT] [--ttl-path PATH]

Requirements:
    pip install boto3 requests requests-aws4auth rdflib
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
import requests
from requests_aws4auth import AWS4Auth
from rdflib import Graph


# Default configuration
DEFAULT_NEPTUNE_ENDPOINT = os.environ.get(
    "NEPTUNE_ENDPOINT", "https://localhost:8182"
)
DEFAULT_TTL_PATH = str(
    Path(__file__).parent.parent / "ontology" / "domain.ttl"
)
DEFAULT_REGION = os.environ.get("AWS_REGION", "ap-northeast-2")

# Named graph for the ontology
ONTOLOGY_GRAPH_URI = "https://onedata.shinhan.com/ontology"


def get_neptune_auth(region: str) -> AWS4Auth:
    """Create AWS SigV4 auth for Neptune IAM authentication."""
    session = boto3.Session()
    credentials = session.get_credentials()
    frozen_credentials = credentials.get_frozen_credentials()

    return AWS4Auth(
        frozen_credentials.access_key,
        frozen_credentials.secret_key,
        region,
        "neptune-db",
        session_token=frozen_credentials.token,
    )


def validate_ttl(ttl_path: str) -> Graph:
    """Parse and validate the TTL file using rdflib."""
    print(f"[1/4] Validating TTL file: {ttl_path}")

    g = Graph()
    g.parse(ttl_path, format="turtle")

    num_triples = len(g)
    print(f"       Parsed {num_triples} triples successfully.")

    # Report statistics
    classes = set(g.subjects(predicate=None, object=None))
    print(f"       Unique subjects: {len(classes)}")

    return g


def clear_existing_graph(endpoint: str, auth: AWS4Auth, graph_uri: str) -> None:
    """Clear existing triples in the named graph before reload."""
    print(f"[2/4] Clearing existing graph: {graph_uri}")

    sparql_url = f"{endpoint}/sparql"
    drop_query = f"DROP SILENT GRAPH <{graph_uri}>"

    response = requests.post(
        sparql_url,
        auth=auth,
        data={"update": drop_query},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=60,
    )

    if response.status_code == 200:
        print("       Existing graph cleared.")
    else:
        print(f"       Warning: Clear returned status {response.status_code}")
        print(f"       Response: {response.text[:200]}")


def load_ttl_to_neptune(
    endpoint: str, auth: AWS4Auth, ttl_path: str, graph_uri: str
) -> dict[str, Any]:
    """Load TTL file into Neptune via SPARQL UPDATE (INSERT DATA).

    For large ontologies, this uses chunked loading to avoid timeout issues.
    """
    print(f"[3/4] Loading ontology into Neptune...")

    sparql_url = f"{endpoint}/sparql"

    # Read raw TTL content
    ttl_content = Path(ttl_path).read_text(encoding="utf-8")

    # Parse with rdflib for triple-by-triple insertion
    g = Graph()
    g.parse(ttl_path, format="turtle")

    # Serialize to N-Triples for reliable SPARQL insertion
    ntriples = g.serialize(format="nt")
    lines = [line.strip() for line in ntriples.split("\n") if line.strip()]

    # Chunk the triples to avoid request size limits
    chunk_size = 100
    total_chunks = (len(lines) + chunk_size - 1) // chunk_size
    loaded_count = 0

    for i in range(0, len(lines), chunk_size):
        chunk = lines[i : i + chunk_size]
        chunk_num = i // chunk_size + 1

        # Build INSERT DATA query
        triples_block = "\n".join(chunk)
        insert_query = f"""
        INSERT DATA {{
            GRAPH <{graph_uri}> {{
                {triples_block}
            }}
        }}
        """

        response = requests.post(
            sparql_url,
            auth=auth,
            data={"update": insert_query},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=120,
        )

        if response.status_code != 200:
            print(f"       ERROR at chunk {chunk_num}/{total_chunks}")
            print(f"       Status: {response.status_code}")
            print(f"       Response: {response.text[:500]}")
            return {"success": False, "loaded": loaded_count, "error": response.text}

        loaded_count += len(chunk)
        if chunk_num % 5 == 0 or chunk_num == total_chunks:
            print(
                f"       Progress: {chunk_num}/{total_chunks} chunks "
                f"({loaded_count}/{len(lines)} triples)"
            )

    print(f"       Successfully loaded {loaded_count} triples.")
    return {"success": True, "loaded": loaded_count}


def verify_load(endpoint: str, auth: AWS4Auth, graph_uri: str) -> None:
    """Run verification queries against the loaded ontology."""
    print(f"[4/4] Verifying loaded ontology...")

    sparql_url = f"{endpoint}/sparql"

    # Query 1: Count triples
    count_query = f"""
    SELECT (COUNT(*) as ?count)
    WHERE {{
        GRAPH <{graph_uri}> {{ ?s ?p ?o }}
    }}
    """
    response = requests.post(
        sparql_url,
        auth=auth,
        data={"query": count_query},
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/sparql-results+json",
        },
        timeout=30,
    )

    if response.status_code == 200:
        results = response.json()
        count = results["results"]["bindings"][0]["count"]["value"]
        print(f"       Total triples in graph: {count}")
    else:
        print(f"       Warning: Count query failed ({response.status_code})")

    # Query 2: List all classes
    classes_query = f"""
    PREFIX owl: <http://www.w3.org/2002/07/owl#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    SELECT ?class ?label
    WHERE {{
        GRAPH <{graph_uri}> {{
            ?class a owl:Class .
            OPTIONAL {{ ?class rdfs:label ?label . FILTER(lang(?label) = "en") }}
        }}
    }}
    ORDER BY ?class
    """
    response = requests.post(
        sparql_url,
        auth=auth,
        data={"query": classes_query},
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/sparql-results+json",
        },
        timeout=30,
    )

    if response.status_code == 200:
        results = response.json()
        bindings = results["results"]["bindings"]
        print(f"       Classes found: {len(bindings)}")
        for b in bindings[:10]:
            cls = b["class"]["value"].split("#")[-1]
            label = b.get("label", {}).get("value", "")
            print(f"         - {cls}: {label}")
        if len(bindings) > 10:
            print(f"         ... and {len(bindings) - 10} more")
    else:
        print(f"       Warning: Classes query failed ({response.status_code})")

    # Query 3: List properties
    props_query = f"""
    PREFIX owl: <http://www.w3.org/2002/07/owl#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    SELECT (COUNT(?prop) as ?count)
    WHERE {{
        GRAPH <{graph_uri}> {{
            {{ ?prop a owl:ObjectProperty }}
            UNION
            {{ ?prop a owl:DatatypeProperty }}
        }}
    }}
    """
    response = requests.post(
        sparql_url,
        auth=auth,
        data={"query": props_query},
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/sparql-results+json",
        },
        timeout=30,
    )

    if response.status_code == 200:
        results = response.json()
        count = results["results"]["bindings"][0]["count"]["value"]
        print(f"       Properties found: {count}")

    print("\n[DONE] Ontology load complete.")


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Load Onedata domain ontology into Neptune"
    )
    parser.add_argument(
        "--endpoint",
        default=DEFAULT_NEPTUNE_ENDPOINT,
        help="Neptune SPARQL endpoint URL",
    )
    parser.add_argument(
        "--ttl-path",
        default=DEFAULT_TTL_PATH,
        help="Path to the domain.ttl ontology file",
    )
    parser.add_argument(
        "--region",
        default=DEFAULT_REGION,
        help="AWS region",
    )
    parser.add_argument(
        "--graph-uri",
        default=ONTOLOGY_GRAPH_URI,
        help="Named graph URI for the ontology",
    )
    parser.add_argument(
        "--skip-clear",
        action="store_true",
        help="Skip clearing existing graph before load",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate TTL only, do not load to Neptune",
    )

    args = parser.parse_args()

    # Validate TTL file exists
    if not Path(args.ttl_path).exists():
        print(f"ERROR: TTL file not found: {args.ttl_path}")
        sys.exit(1)

    # Step 1: Validate
    graph = validate_ttl(args.ttl_path)

    if args.dry_run:
        print("\n[DRY RUN] Validation passed. Skipping Neptune load.")
        sys.exit(0)

    # Get IAM auth
    auth = get_neptune_auth(args.region)

    # Step 2: Clear existing
    if not args.skip_clear:
        clear_existing_graph(args.endpoint, auth, args.graph_uri)

    # Step 3: Load
    result = load_ttl_to_neptune(args.endpoint, auth, args.ttl_path, args.graph_uri)

    if not result["success"]:
        print(f"\nERROR: Load failed. {result.get('error', '')}")
        sys.exit(1)

    # Step 4: Verify
    verify_load(args.endpoint, auth, args.graph_uri)


if __name__ == "__main__":
    main()
