"""U41 — 카드 티어 정렬 유틸: 대중 인지도 순 노출(집계 불변 — 정렬 전용).

card_tier_index.json(build_23 — 시장 조사+이름 규칙) 로드.
정렬 키: (tier ASC, 단종 여부, 원래 순서) — 같은 관련도 안에서만 티어 우선,
검색 의미(관련도)는 훼손하지 않는다(호출자가 관련도 그룹 내에서 호출).
"""

from __future__ import annotations

import json
from pathlib import Path

_TIERS: dict | None = None


def _load() -> dict:
    global _TIERS
    if _TIERS is None:
        _TIERS = {}
        for p in (Path("/app/data/card_tier_index.json"),
                  Path(__file__).resolve().parent / "data" / "card_tier_index.json"):
            if p.exists():
                try:
                    _TIERS = json.loads(p.read_text(encoding="utf-8")).get("tiers", {})
                    break
                except Exception:  # noqa: BLE001
                    pass
    return _TIERS


def tier_of(card_id: str) -> int:
    """카드 티어(1=대표, 2=일반, 3=롱테일). 미분류는 2."""
    e = _load().get(str(card_id))
    return e["tier"] if e else 2


def sort_key(card_id: str, orig_index: int = 0) -> tuple:
    """정렬 키 — 티어 ASC, 단종 후순위, 원래 순서 보존(stable)."""
    e = _load().get(str(card_id)) or {}
    return (e.get("tier", 2), 1 if e.get("discontinued") else 0, orig_index)


def sort_cards(card_ids: list[str]) -> list[str]:
    """card_id 목록을 대중 인지도 순으로 재정렬(집계 불변)."""
    return [c for _, c in sorted(
        ((sort_key(c, i), c) for i, c in enumerate(card_ids)), key=lambda x: x[0])]


def sort_rows(rows: list[dict], id_key: str = "card_id") -> list[dict]:
    """dict 행 목록 재정렬 — id_key 필드로 티어 조회."""
    return [r for _, r in sorted(
        ((sort_key(str(r.get(id_key, "")), i), r) for i, r in enumerate(rows)),
        key=lambda x: x[0])]
