"""GET /api/scenarios — U6 demo scenario presets.

v2 구조: {version, categories:[6 A급 시나리오×5 질문], background:[v1 배경]}.
- group=v2(default): 6 카테고리 계약 반환
- group=background: v1 배경 프리셋
- group=all: 전체
"""

from __future__ import annotations

import json
import os

from fastapi import APIRouter, Query

router = APIRouter()

_data: dict | None = None


def _load() -> dict:
    global _data
    if _data is None:
        path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "scenarios.json")
        with open(path, encoding="utf-8") as f:
            _data = json.load(f)
    return _data


@router.get("/api/scenarios")
async def list_scenarios(group: str = Query("v2"), category: str | None = Query(None)):
    data = _load()
    if group == "background":
        bg = data.get("background", [])
        return [s for s in bg if not category or s.get("category") == category]
    if group == "all":
        return data
    # default v2: 6 A급 시나리오 카테고리 계약
    cats = data.get("categories", [])
    if category:
        return [c for c in cats if c.get("scenario_id") == category]
    return {"version": data.get("version"), "categories": cats}
