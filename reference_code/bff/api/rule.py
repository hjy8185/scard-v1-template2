"""POST /api/rule/simulate — U6 façade proxy to U5 rule_simulate (read-only).

경로 통일(#5). 프리셋 고정 base_rule/cohort만 허용(#6 A-4, 임의 cohort 주입 차단).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from bff.clients.agentcore_client import AgentCoreError
from bff.api.chat import _get_agentcore_client

logger = logging.getLogger(__name__)
router = APIRouter()

# 허용된 프리셋 base_rule / cohort (A-4: 임의 주입 차단)
_ALLOWED_BASE_RULES = {"coffee_10pct"}
_ALLOWED_COHORTS = {"coffee_users_synthetic"}


class RuleSimulateRequest(BaseModel):
    base_rule: str
    cohort: str
    delta: dict = Field(default_factory=dict)
    query: str | None = None


@router.post("/api/rule/simulate")
async def rule_simulate(req: RuleSimulateRequest):
    # A-4: 프리셋 고정 값만 허용
    if req.base_rule not in _ALLOWED_BASE_RULES:
        raise HTTPException(status_code=400, detail=f"base_rule not allowed: {req.base_rule}")
    if req.cohort not in _ALLOWED_COHORTS:
        raise HTTPException(status_code=400, detail=f"cohort not allowed: {req.cohort}")
    client = _get_agentcore_client()
    query = req.query or f"what-if simulate base:{req.base_rule} delta:{req.delta}"
    try:
        resp = await client.invoke_orchestrated(query, session_id="rule-facade-0000000000000000")
    except AgentCoreError as e:
        raise HTTPException(status_code=502, detail=f"agent 위임 실패: {e}")
    return {
        "answer": resp.get("answer", ""),
        "citation": resp.get("citation", {}),
        "disclaimers": resp.get("disclaimers", []),
    }
