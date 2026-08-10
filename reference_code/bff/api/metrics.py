"""POST /api/metrics/query — U6 façade proxy to U5 metric_query (read-only).

프론트는 /api/metrics/query만 호출(경로 통일 #5). BFF가 AgentCore orchestrated로 위임.
read-only(#6): named metric 조회만, 쓰기 없음.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from bff.clients.agentcore_client import AgentCoreError
from bff.api.chat import _get_agentcore_client

logger = logging.getLogger(__name__)
router = APIRouter()


class MetricQueryRequest(BaseModel):
    name: str
    filters: dict = Field(default_factory=dict)


@router.post("/api/metrics/query")
async def metrics_query(req: MetricQueryRequest):
    # read-only enforcement: named metric only (no arbitrary SQL)
    if not req.name or not req.name.replace("_", "").isalnum():
        raise HTTPException(status_code=400, detail="invalid metric name")
    client = _get_agentcore_client()
    # orchestrated 경로로 metric intent 위임 (self_metric)
    query = f"metric:{req.name} filters:{req.filters}"
    try:
        resp = await client.invoke_orchestrated(query, session_id="metrics-facade-000000000000000")
    except AgentCoreError as e:
        raise HTTPException(status_code=502, detail=f"agent 위임 실패: {e}")
    citation = resp.get("citation", {}) or resp.get("validation", {}).get("citation", {}) or {}
    metrics = citation.get("metrics", [])
    match = next((m for m in metrics if m.get("metric_name") == req.name), None)
    if match is None:
        if metrics:
            return metrics[0]
        raise HTTPException(status_code=404, detail=f"metric not found: {req.name}")
    return match
