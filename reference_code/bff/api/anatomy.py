"""U19 — GET /api/anatomy: 연결 해부의 실데이터 서빙(정적 큐레이션 대체).

원칙: 해부 화면의 행·검산은 전부 실데이터 — 프론트 재계산 금지, 서버가 계산해 내려줌.
- ?category=음식점 → 해당 카테고리의 (a) 실 혜택 행(graph_poc 크롤 694카드에서 매칭)
  (b) 서울 업종 행(market index) (c) crosswalk 매핑 (d) 부분합 검산(by_industry 합=by_category 값).
- ?merchant=스타벅스 → merchant_dict 행.
degrade: 매칭 없으면 빈 배열(프론트가 "연결 해부 없음" 정직 표기).
"""

from __future__ import annotations

import json
import logging
import os
from functools import lru_cache
from typing import Optional

from fastapi import APIRouter, Query

logger = logging.getLogger(__name__)
router = APIRouter()

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")


@lru_cache(maxsize=1)
def _market_index() -> dict:
    try:
        with open(os.path.join(_DATA_DIR, "market_consumption_index.json"), encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:  # noqa: BLE001
        logger.warning("market index load fail: %s", e)
        return {}


@lru_cache(maxsize=1)
def _card_benefits() -> list[dict]:
    """graph_poc_card.jsonl(크롤 원본 694카드) → (카드명, 혜택대상, 혜택) 행 전개."""
    rows: list[dict] = []
    path = os.path.join(_DATA_DIR, "graph_poc_card.jsonl.txt")
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                try:
                    c = json.loads(line)
                except Exception:  # noqa: BLE001
                    continue
                for i in (1, 2, 3):
                    nm, tt = c.get(f"svtpnm{i}"), c.get(f"svtptt{i}")
                    if nm and tt:
                        rows.append({"card": c.get("pagetitle", ""),
                                     "card_id": str(c.get("id") or ""),   # U41 티어 정렬용
                                     "benefit_category": str(nm), "label": str(tt)})
    except Exception as e:  # noqa: BLE001
        logger.warning("card benefits load fail: %s", e)
    return rows


@lru_cache(maxsize=1)
def _merchants() -> dict:
    try:
        with open(os.path.join(_DATA_DIR, "merchant_dict.json"), encoding="utf-8") as f:
            return json.load(f).get("merchants", {})
    except Exception as e:  # noqa: BLE001
        logger.warning("merchant dict load fail: %s", e)
        return {}


# U32 어휘 SSOT — 크롤 혜택명(svtpnm) 실표기 별칭은 vocab_sot.benefit_text_aliases에서.
# 인라인은 SOT 미로드 폴백만(어휘 추가는 data/vocab_sot.json에만 — C1).
import json as _vjson
from pathlib import Path as _VPath

_FALLBACK_CAT_ALIASES: dict = {
    "뷰티": ["올리브영", "화장품", "뷰티"],
    "슈퍼마켓/마트": ["마트/", "/마트", "슈퍼", "이마트", "롯데마트", "마트"],
    "여가": ["레저", "테마파크", "영화", "놀이공원", "여가"],
    "온라인쇼핑": ["G마켓", "옥션", "쿠팡", "11번가", "온라인"],
    "편의점": ["편의점", "GS25", "CU", "세븐일레븐"],
    "커피/음료": ["커피", "스타벅스", "카페"],
    "음식점": ["음식점", "외식", "레스토랑", "푸드"],
    "패스트푸드": ["패스트푸드", "맥도날드", "버거"],
    "주류/유흥": ["주점", "호프"],
    "교육/학원": ["학원", "교육", "어학"],
    "의료": ["병원", "의료", "의원"],
    "의료/건강": ["병원", "의료", "약국", "의원"],   # U24 P1
    "약국": ["약국"],
    "제과/베이커리": ["베이커리", "제과", "파리바게뜨", "뚜레쥬르"],
    "의류/패션": ["패션", "의류", "아울렛"],
}


def _load_cat_aliases() -> dict:
    for _vp in (_VPath("/app/data/vocab_sot.json"),
                _VPath(__file__).parent.parent / "data" / "vocab_sot.json",          # 컨테이너: /app/bff/data
                _VPath(__file__).parent.parent.parent / "data" / "vocab_sot.json"):   # 리포: data/
        if _vp.exists():
            try:
                sot = _vjson.loads(_vp.read_text(encoding="utf-8"))
                bta = sot.get("benefit_text_aliases") or {}
                if bta:
                    # market_label 키(의료)도 유지 — enrich canonical과의 접점
                    out = dict(bta)
                    out.setdefault("의료", bta.get("의료/건강", ["병원", "의료", "의원"]))
                    return out
            except Exception:  # noqa: BLE001
                pass
    return _FALLBACK_CAT_ALIASES


_CAT_ALIASES: dict = _load_cat_aliases()

_TZ = 1e12


def _fmt(v: float) -> str:
    return f"{v / _TZ:.2f}조" if v >= _TZ / 10 else f"{v / 1e8:,.0f}억"


@router.get("/api/anatomy")
def anatomy(category: Optional[str] = Query(None), merchant: Optional[str] = Query(None)) -> dict:
    """카테고리/가맹점의 해부 실데이터. 전 카테고리 커버(정적 3벌 큐레이션 대체)."""
    out: dict = {"benefit_rows": [], "seoul_rows": [], "crosswalk": None,
                 "arithmetic": None, "merchant_rows": []}
    idx = _market_index()

    if category:
        # (a) 실 혜택 행 — 크롤 694카드에서 카테고리 매칭(부분문자열 양방향) 상위 3
        cat = category.strip()
        aliases = _CAT_ALIASES.get(cat, []) + [cat]
        def _match(bc: str) -> bool:
            for a in aliases:
                if a in bc or bc in a:
                    # 오매칭 방어: '마트'가 '스마트할부'에 걸리는 류 — 별칭이 다른 단어의 일부면 제외
                    if a == "마트" and "스마트" in bc:
                        continue
                    return True
            return False
        hits = [r for r in _card_benefits() if _match(r["benefit_category"])]
        # U41: 대표 예시는 대중 인지도(티어) 순 — '119 소방사랑…' 류가 첫 행에 오던 문제
        try:
            from bff.card_tier import sort_rows
            hits = sort_rows(hits, id_key="card_id")
        except Exception:  # noqa: BLE001
            pass
        out["benefit_rows"] = [{k: v for k, v in r.items() if k != "card_id"} for r in hits[:3]]

        # (b)(c)(d) crosswalk + 서울 행 + 부분합 검산
        by_cat = (idx.get("by_category") or {})
        by_ind = {r["industry"]: r["krw"] for r in idx.get("by_industry", [])}
        # 카테고리명 매칭(정확 우선, 부분 폴백)
        entry = by_cat.get(cat) or next(
            (v for k, v in by_cat.items() if cat in k or k in cat), None)
        matched_name = cat if cat in by_cat else next(
            (k for k in by_cat if cat in k or k in cat), None)
        if entry and matched_name:
            inds = entry.get("seoul_industries", [])
            out["crosswalk"] = {
                "from": matched_name, "to": inds,
                "note": (idx.get("meta") or {}).get("crosswalk_note", ""),
            }
            out["seoul_rows"] = [
                {"industry": i, "amount": _fmt(by_ind[i])} for i in inds if i in by_ind][:6]
            # 검산: 부분합(서버 계산 — 프론트 재계산 금지 원칙)
            parts = [{"label": i, "value": round(by_ind[i] / _TZ, 2)} for i in inds if i in by_ind]
            if parts:
                out["arithmetic"] = {
                    "parts": parts,
                    "total": round(sum(p["value"] for p in parts), 2),
                    "unit": "조",
                    "claim": f"{matched_name} 시장 {_fmt(entry.get('krw', 0))}",
                }

    if merchant:
        m = merchant.strip()
        md = _merchants()
        hit = md.get(m) or md.get(m.lower())
        if hit:
            out["merchant_rows"] = [{"canonical_name": hit.get("surface", m),
                                     "source": hit.get("source", "")}]

    return out
