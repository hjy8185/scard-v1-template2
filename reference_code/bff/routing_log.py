"""U36 — 라우팅 관찰 로그(자가개선 플라이휠의 관찰 축).

원리: 에이전트가 어떤 경로(tier)로 정답에 도달했는지 관찰하고, LLM 폴백(tier3)이
반복되는 질의 패턴을 결정론 경로(tier2 exemplar)의 승격 후보로 산출한다.
"질문할수록 결정론 경로가 넓어지고 LLM 의존이 줄어든다"의 실측 근거.

- 세션 관찰: in-memory(부스 데모 세션 단위 — 재시작 시 리셋, 저장 안 함).
- 승격 이력: u8_exemplars.json의 unit 태그에서 파생(실제 승격 기록 — wif-x3/x4 등).
  연출 데이터 없음: 라이브 카운터는 0에서 시작하고, 이력은 실제 커밋된 exemplar만.
"""

from __future__ import annotations

import json
import re
from collections import Counter, deque
from pathlib import Path
from threading import Lock

_MAX_OBS = 500
_lock = Lock()
_observations: deque = deque(maxlen=_MAX_OBS)   # {query, intent, tier, reason}
_tier_counts: Counter = Counter()

# tier3 질의 패턴 그룹핑: 공백/숫자 정규화로 같은 유형 반복을 묶는다(결정론 — 임베딩 아님)
_NUM_RE = re.compile(r"\d[\d,.]*")
_WS_RE = re.compile(r"\s+")


def _pattern_key(query: str) -> str:
    q = _NUM_RE.sub("N", query.strip())
    return _WS_RE.sub(" ", q)[:80]


def record(query: str, route_plan: dict | None) -> None:
    """답변 완료 시점에 호출 — tier/intent 관찰 누적. 실패해도 답변에 영향 없음."""
    if not query or not isinstance(route_plan, dict):
        return
    tier = route_plan.get("selected_tier") or "unknown"
    obs = {"query": query[:200], "intent": route_plan.get("intent"),
           "tier": tier, "reason": route_plan.get("fallback_reason")}
    with _lock:
        _observations.append(obs)
        _tier_counts[tier] += 1


def _promotion_history() -> list[dict]:
    """u8_exemplars.json의 unit 태그별 exemplar 수 — 실제 승격 이력(수동 승격의 기록)."""
    # 컨테이너(bff 이미지는 /app/bff만 COPY — bff/data 동본), 레포(루트 data/ SSOT) 순
    for p in (Path(__file__).resolve().parent / "data" / "u8_exemplars.json",
              Path("/app/data/u8_exemplars.json"),
              Path(__file__).resolve().parents[1] / "data" / "u8_exemplars.json"):
        if p.exists():
            try:
                ex = json.loads(p.read_text(encoding="utf-8")).get("exemplars", [])
            except Exception:  # noqa: BLE001
                return []
            by_unit: Counter = Counter()
            for e in ex:
                units = [t for t in e.get("tags", []) if re.fullmatch(r"u\d+", t)]
                by_unit[units[0] if units else "initial"] += 1
            hist = [{"unit": u, "n_exemplars": n} for u, n in sorted(by_unit.items())]
            return hist
    return []


def insights() -> dict:
    """플라이휠 관찰 요약: tier 분포 + tier3 반복 패턴(exemplar 승격 후보) + 승격 이력."""
    with _lock:
        obs = list(_observations)
        counts = dict(_tier_counts)
    total = sum(counts.values())
    deterministic = sum(v for k, v in counts.items()
                        if k.startswith("tier1") or k.startswith("tier2"))
    # tier3 폴백 질의를 패턴으로 그룹핑 → 반복(2회 이상)은 승격 후보로 랭킹
    t3 = [o for o in obs if o["tier"] == "tier3_llm"]
    groups: dict[str, dict] = {}
    for o in t3:
        k = _pattern_key(o["query"])
        g = groups.setdefault(k, {"pattern": k, "count": 0, "intent": o["intent"],
                                  "example": o["query"]})
        g["count"] += 1
    candidates = sorted(groups.values(), key=lambda g: -g["count"])
    return {
        "session": {
            "n_queries": total,
            "tier_counts": counts,
            "deterministic_pct": round(deterministic / total * 100, 1) if total else None,
            "note": "이번 세션 관찰(재시작 시 리셋) — 연출 없음, 0에서 시작",
        },
        "promotion_candidates": [
            {**c, "stage": "candidate" if c["count"] >= 2 else "observing",
             "suggestion": (f"tier2 exemplar 승격 후보(intent={c['intent']}) — "
                            f"동일 패턴 {c['count']}회 LLM 폴백" if c["count"] >= 2
                            else f"관찰 중(1회) — 재발 시 승격 후보(intent={c['intent']})")}
            for c in candidates[:10]
        ],
        "promotion_history": _promotion_history(),
        "principle": "관찰(어느 tier로 답했나) → 반복 폴백 패턴 승격 → 결정론 경로 확장. "
                     "실제 이력: 각 유닛에서 exemplar가 이 절차로 수동 승격돼 왔음(자동화가 이 패널).",
    }


def reset() -> None:
    """테스트용."""
    with _lock:
        _observations.clear()
        _tier_counts.clear()
