"""Neptune Gremlin HTTP REST client for graph visualization."""

from __future__ import annotations

import json
import logging

import botocore.auth
import botocore.awsrequest
import botocore.session
import httpx

from bff.models import CytoscapeGraph, CytoscapeNode, CytoscapeEdge

logger = logging.getLogger(__name__)

CARD_SUBGRAPH_QUERY = """g.V('{card_id}').repeat(bothE().otherV().simplePath()).times(3).path().by(elementMap())"""


class NeptuneClient:
    def __init__(self, endpoint: str, region: str) -> None:
        self._endpoint = endpoint.rstrip("/")
        self._region = region
        self._session = botocore.session.get_session()

    def _sign_request(self, method: str, url: str, body: bytes) -> dict:
        credentials = self._session.get_credentials().get_frozen_credentials()
        request = botocore.awsrequest.AWSRequest(
            method=method, url=url, data=body,
            headers={"Content-Type": "application/json"},
        )
        botocore.auth.SigV4Auth(credentials, "neptune-db", self._region).add_auth(request)
        return dict(request.headers)

    async def get_card_subgraph(self, card_id: str) -> CytoscapeGraph:
        gremlin = CARD_SUBGRAPH_QUERY.format(card_id=card_id)
        body = json.dumps({"gremlin": gremlin}).encode()
        url = f"{self._endpoint}/gremlin"

        try:
            headers = self._sign_request("POST", url, body)
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, content=body, headers=headers)
                resp.raise_for_status()
                return self._parse_response(resp.json())
        except Exception as e:
            logger.error("Neptune query failed: %s", e)
            return CytoscapeGraph(nodes=[], edges=[])

    def _parse_response(self, data: dict) -> CytoscapeGraph:
        paths = data.get("result", {}).get("data", [])
        nodes_map: dict[str, CytoscapeNode] = {}
        edges: list[CytoscapeEdge] = []
        edge_id = 0

        for path_entry in paths:
            objects = path_entry.get("objects", [])
            prev_id = None
            for obj in objects:
                node_id = obj.get("id", obj.get("T.id", ""))
                label = obj.get("label", "")
                props = obj.get("properties", {})

                if node_id and node_id not in nodes_map:
                    display_label = props.get("name", label)
                    nodes_map[node_id] = CytoscapeNode(data={
                        "id": node_id,
                        "label": display_label,
                        "type": label,
                        "properties": props,
                    })

                if prev_id and node_id:
                    edge_id += 1
                    edges.append(CytoscapeEdge(data={
                        "id": f"e{edge_id}",
                        "source": prev_id,
                        "target": node_id,
                        "type": "",
                    }))
                prev_id = node_id

        return CytoscapeGraph(nodes=list(nodes_map.values()), edges=edges)
