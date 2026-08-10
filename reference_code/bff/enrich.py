"""U6 Step 2 — BFF enrichment (ontology / catalog) — hybrid cache + query.

U5 citation에는 없는 컨텍스트를 BFF가 보강한다:
  - Ontology: 답변에 걸린 benefit category → subClassOf 계층·closure·crosswalk
  - Catalog:  참조 metric/term → SMUS glossary 정의·lineage

hybrid (Q2=c): 사전 캐시(data/*.json) 우선, 미스 시 실시간 조회(U2b Neptune / SMUS).
U1b blocker/skip 시(#7): catalog는 U4 registry / U2a TTL fallback으로 대체.
degrade: 보강 실패해도 답변·citation은 그대로 — 해당 탭만 placeholder.
"""

from __future__ import annotations

import json
import os
from typing import Any, Callable

_DIR = os.path.dirname(__file__)


def _load_json(name: str) -> dict:
    try:
        with open(os.path.join(_DIR, "data", name), encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


_ONTOLOGY_CACHE = None
_CATALOG_CACHE = None
_CATEGORY_MARKET = None


def _ontology_cache() -> dict:
    global _ONTOLOGY_CACHE
    if _ONTOLOGY_CACHE is None:
        _ONTOLOGY_CACHE = _load_json("ontology_cache.json")
    return _ONTOLOGY_CACHE


def _category_market() -> dict:
    """카테고리 → 서울업종+시장규모 완전 매핑(14개). ontology_cache crosswalk(5개)보다 완전."""
    global _CATEGORY_MARKET
    if _CATEGORY_MARKET is None:
        _CATEGORY_MARKET = _load_json("category_market_consumption.json").get("categories", {})
    return _CATEGORY_MARKET


def _krw_trillion(krw) -> str:
    try:
        return f"{krw / 1e12:.1f}조"
    except (TypeError, ValueError):
        return ""


def _catalog_cache() -> dict:
    global _CATALOG_CACHE
    if _CATALOG_CACHE is None:
        _CATALOG_CACHE = _load_json("catalog_cache.json")
    return _CATALOG_CACHE


# ---------------------------------------------------------------------------
# Ontology enrichment
# ---------------------------------------------------------------------------

def _extract_keywords(citation: dict, query: str) -> list[str]:
    """카테고리 키워드 후보 추출 — query 우선(U19 오염 수정).

    진단(diagnosis-food-promo-coffee-contamination): 검색된 카드의 혜택명
    ("음식점·카페·편의점 5% 적립", 약관의 "스타벅스…")을 query와 합쳐 매칭하면
    검색결과 혼입 텍스트가 query 의도를 덮는다(음식점 질의에 커피 오염).
    → query에서 뽑힌 키워드가 있으면 **그것만** 사용. graph_paths 노드 텍스트는
    query 키워드 0건일 때만 폴백(질의에 카테고리 어휘가 전혀 없는 경우).
    """
    cache = _ontology_cache().get("keywords", {})

    q = query or ""
    q_kws = [kw for kw in cache if kw in q]
    # U23(병원→커피 오염): query 매칭 어휘가 cache 10개뿐이라 "병원" 같은 어휘는 히트 0 →
    # graph_paths 폴백이 검색결과 카드 혜택명("커피/음료 10%…")에서 엉뚱한 카테고리를 집어옴.
    # canonical 사전 + 시장 매핑 실라벨도 query 어휘로 인정해 폴백 자체를 차단.
    for kw in _CANONICAL_CATEGORY:
        if kw in q and kw not in q_kws:
            q_kws.append(kw)
    for label in _category_market():
        if label in q and label not in q_kws:
            q_kws.append(label)
    if q_kws:
        return q_kws

    # 폴백: query에 카테고리 어휘가 전혀 없을 때만 검색결과 노드 텍스트에서 추출
    text = ""
    for path in citation.get("graph_paths", []) or []:
        objs = path.get("objects", []) if isinstance(path, dict) else []
        for o in objs:
            if isinstance(o, dict):
                text += " " + str(o.get("name", "")) + " " + str(o.get("label", ""))
    return [kw for kw in cache if kw in text]


# U19 진단(diagnosis-anatomy-missing-외식-음식점): "외식"(N00002)과 "음식점"(N00004)이 별개
# 노드인데 crosswalk/시장 매핑은 "음식점"에만 존재 → alias 라벨로 잡힌 카테고리는 crosswalk
# 미조회 → anatomy 미표시. crosswalk 조회 전 canonical로 정규화(slot_extractor 사전과 동일 계열).
# U32 어휘 SSOT — data/vocab_sot.json(build_19) 로드. 이 소비처의 canonical은 **시장 매핑
# 실라벨**(market_label — "의료/건강"→"의료" 등 U23 드리프트의 원인이던 차이를 SOT가 명시).
# 인라인 사전은 SOT 미로드 폴백만(어휘 추가는 SOT 파일에만 — C1).
import json as _vjson
from pathlib import Path as _VPath

_VOCAB_SOT: dict = {}
for _vp in (_VPath("/app/data/vocab_sot.json"),
            _VPath(__file__).parent / "data" / "vocab_sot.json",          # 컨테이너: /app/bff/data
            _VPath(__file__).parent.parent / "data" / "vocab_sot.json"):  # 리포: data/
    if _vp.exists():
        try:
            _VOCAB_SOT = _vjson.loads(_vp.read_text(encoding="utf-8"))
            break
        except Exception:  # noqa: BLE001
            pass


def _sot_canonical_market() -> dict:
    """SOT categories → {키워드: market_label} — enrich의 crosswalk 조회 축."""
    out = {}
    for canon, spec in (_VOCAB_SOT.get("categories") or {}).items():
        ml = spec.get("market_label", canon)
        if canon != ml:
            out[canon] = ml
        for a in spec.get("aliases", []):
            out[a] = ml
    return out


_FALLBACK_CANONICAL: dict = {
    "외식": "음식점", "맛집": "음식점", "레스토랑": "음식점", "다이닝": "음식점",
    "커피": "커피/음료", "카페": "커피/음료", "커피전문점": "커피/음료", "음료": "커피/음료",
    "온라인": "온라인쇼핑", "온라인 쇼핑": "온라인쇼핑",
    "문화": "여가", "햄버거": "패스트푸드",
    "교육": "교육/학원", "학원": "교육/학원",
    "주류": "주류/유흥", "유흥": "주류/유흥", "술": "주류/유흥",
    "슈퍼마켓": "슈퍼마켓/마트", "마트": "슈퍼마켓/마트", "장보기": "슈퍼마켓/마트",
    "병원": "의료", "건강": "의료", "의료/건강": "의료",
    "패션": "의류/패션", "의류": "의류/패션", "옷": "의류/패션",
    "베이커리": "제과/베이커리", "제과": "제과/베이커리", "빵": "제과/베이커리",
    "화장품": "뷰티", "미용": "뷰티",
}
_CANONICAL_CATEGORY: dict = _sot_canonical_market() or _FALLBACK_CANONICAL


def _canonical(label: str) -> str:
    return _CANONICAL_CATEGORY.get(label, label)


def enrich_ontology(citation: dict, query: str = "",
                    neptune_lookup: Callable[[str], dict] | None = None) -> dict:
    """OntologyContext 반환. 캐시 우선, 미스 시 neptune_lookup(kw)->{category,crosswalk}.

    반환: {categories:[{iri,label,subClassOf}], closure_path:[label], crosswalk:[...], source}
    """
    cache = _ontology_cache()
    kw_map = cache.get("keywords", {})
    cats_by_id = cache.get("categories", {})
    xwalk = cache.get("crosswalk", {})

    keywords = _extract_keywords(citation, query)
    # U19: alias 라벨(외식 등)은 canonical(음식점)로도 조회 — crosswalk/시장 매핑이 canonical에만 있음
    for kw in list(keywords):
        can = _canonical(kw)
        if can != kw and can not in keywords:
            keywords.append(can)
    categories: list[dict] = []
    closure: list[str] = []
    crosswalk: list[dict] = []
    source = "cache"

    seen_cm_labels: set = set()

    def _add_market_crosswalk(label: str) -> None:
        """category_market 기반 crosswalk 구성 — 캐시 노드(entry) 유무와 무관(U19 외식 진단)."""
        if label in seen_cm_labels:
            return
        cm2 = _category_market().get(label)
        if not cm2:
            return
        seen_cm_labels.add(label)
        if not any(c.get("label") == label for c in categories):
            categories.append({"iri": None, "label": label, "subClassOf": None})
        for si in cm2.get("seoul_industries", []):
            crosswalk.append({
                "from": label, "from_scheme": "shinhan-benefit", "from_label": label,
                "to": si, "to_scheme": "seoul-industry", "to_label": si,
            })
        mk2 = _krw_trillion(cm2.get("market_krw"))
        if mk2:
            crosswalk.append({
                "from": label, "from_scheme": "shinhan-benefit", "from_label": label,
                "to": f"서울 시장 {mk2}", "to_scheme": "seoul-market", "to_label": f"서울 시장 {mk2}",
            })

    for kw in keywords:
        # U19: 캐시 노드 없어도 canonical 라벨이 category_market에 있으면 crosswalk 직접 구성
        _add_market_crosswalk(_canonical(kw))
        cat_id = kw_map.get(kw)
        entry = cats_by_id.get(cat_id) if cat_id else None
        if entry is None and neptune_lookup is not None:
            # 캐시 미스 → 실시간 조회 (hybrid)
            looked = neptune_lookup(kw)
            if looked:
                entry = looked.get("category")
                if looked.get("crosswalk"):
                    crosswalk.extend(looked["crosswalk"])
                source = "cache+query"
        if entry:
            label = entry.get("label")
            categories.append({
                "iri": entry.get("iri"), "label": label,
                "subClassOf": entry.get("subClassOf"),
            })
            for lbl in entry.get("closure_labels", []):
                if lbl not in closure:
                    closure.append(lbl)
            if cat_id in xwalk:
                crosswalk.extend(xwalk[cat_id])
            # 완전 소스(category_market): 개념 → 서울업종 + 시장규모 — 중복 방지 공용 헬퍼
            _add_market_crosswalk(_canonical(label) if label else label)

    # 카테고리 직접 매칭 fallback: 키워드엔 없지만 category_market 라벨과 직접 겹치면(편의점 등)
    if not categories:
        qlow = (query or "")
        for label, cm in _category_market().items():
            # 라벨 전체(편의점) 또는 슬래시 분해 토큰(교육/학원→교육,학원) 또는 하위 업종 매칭
            label_tokens = [t for t in label.replace("/", " ").split() if len(t) >= 2]
            if label and (label in qlow
                          or any(tok in qlow for tok in label_tokens)
                          or any(si in qlow for si in cm.get("seoul_industries", []))):
                categories.append({"iri": None, "label": label, "subClassOf": None})
                closure.append(label)
                for si in cm.get("seoul_industries", []):
                    crosswalk.append({"from": label, "from_scheme": "shinhan-benefit", "from_label": label,
                                      "to": si, "to_scheme": "seoul-industry", "to_label": si})
                mk = _krw_trillion(cm.get("market_krw"))
                if mk:
                    crosswalk.append({"from": label, "from_scheme": "shinhan-benefit", "from_label": label,
                                      "to": f"서울 시장 {mk}", "to_scheme": "seoul-market", "to_label": f"서울 시장 {mk}"})
                source = "category_market"
                break

    if not categories:
        return {}          # 보강 결과 없음 → 탭 dimmed (degrade)
    return {
        "categories": categories,
        "closure_path": closure,
        "crosswalk": crosswalk,
        "source": source,
    }


# ---------------------------------------------------------------------------
# Catalog enrichment (U1b → U4/U2a fallback #7)
# ---------------------------------------------------------------------------

def _metric_names(citation: dict) -> list[str]:
    names = []
    for m in citation.get("metrics", []) or []:
        n = m.get("metric_name")
        if n and n not in names:
            names.append(n)
    return names


def enrich_catalog(citation: dict,
                   glossary_lookup: Callable[[str], dict] | None = None,
                   registry_fallback: Callable[[str], dict] | None = None) -> dict:
    """CatalogContext 반환. SMUS glossary 우선, blocker 시 U4 registry/U2a fallback(#7).

    반환: {terms:[{name,definition,owning_project}], lineage:[...], source}
    """
    cache = _catalog_cache()
    term_cache = cache.get("terms", {})
    lineage_cache = cache.get("metric_lineage", {})

    metrics = _metric_names(citation)
    terms: list[dict] = []
    lineage: list[dict] = []
    source = "cache"

    for name in metrics:
        t = term_cache.get(name)
        if t is None and glossary_lookup is not None:
            got = glossary_lookup(name)          # SMUS 실시간
            if got:
                t = got
                source = "cache+smus"
        if t is None and registry_fallback is not None:
            # U1b blocker → U4 registry / U2a TTL fallback (#7)
            t = registry_fallback(name)
            if t:
                source = "fallback:u4-registry"
        if t:
            terms.append({"name": t.get("name"), "definition": t.get("definition"),
                          "owning_project": t.get("owning_project")})
        if name in lineage_cache:
            lineage.extend(lineage_cache[name])

    if not terms and not lineage:
        return {}
    return {"terms": terms, "lineage": lineage, "source": source}


# ── U13 P3: build_insights — citation → InsightCard[] (FD §5.1 매핑) ──
# 생산자=BFF. 프론트는 series 그대로 렌더(재계산 금지). 판정 불가 시 생략(I5).
# citation 있는 경로(배치)에서만 — stream 경로는 citation 미보유(F1).

_BAR_ACTIONS = {"by_industry", "by_area", "area_detail", "by_category",
                "by_age", "by_sex", "by_time", "by_weekday", "industry_sex"}


def _num(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


# market row의 라벨 필드는 action마다 다름(실측): by_industry→industry, by_age→age_band,
# by_time→time_slot, by_weekday→weekday, by_sex→sex, by_area/area_detail→area, by_category→category.
_MARKET_LABEL_KEYS = ("label", "name", "industry", "age_band", "time_slot", "weekday",
                      "sex", "area", "category", "key", "axis")
_MARKET_TITLE = {
    "by_industry": "서울 시장 · 업종별 매출", "by_age": "서울 시장 · 연령대별 소비",
    "by_category": "서울 시장 · 카테고리별 소비", "by_area": "서울 시장 · 지역별 소비",
    "area_detail": "서울 시장 · 상권별 소비", "by_sex": "서울 시장 · 성별 소비",
    "by_time": "서울 시장 · 시간대별 소비", "by_weekday": "서울 시장 · 요일별 소비",
    "industry_sex": "서울 시장 · 업종×성별",
}


def _row_label(r: dict) -> str | None:
    for k in _MARKET_LABEL_KEYS:
        v = r.get(k)
        if v is not None and not isinstance(v, (int, float)):
            return str(v)
    return None


def _row_eok(r: dict) -> float | None:
    """행 금액을 '억원' 단위 숫자로. krw(원)면 /1e8, 없으면 amount 문자열 파싱."""
    krw = _num(r.get("krw") or r.get("value") or r.get("sales"))
    if krw is not None:
        return round(krw / 1e8, 1)      # 원 → 억원 (1억배 오류 수정)
    amt = r.get("amount")               # "15.1조원" 류 fallback
    if isinstance(amt, str):
        import re
        m = re.search(r"([\d.]+)\s*(조|억)", amt)
        if m:
            n = float(m.group(1))
            return round(n * 10000, 1) if m.group(2) == "조" else round(n, 1)
    return None


def build_insights(citation: dict, top_n: int = 8,
                   segment_fetch: Callable[[str, str], list | None] | None = None) -> list[dict]:
    """citation → InsightCard[]. market action→bar/heatmap, ontology→sunburst, market+metric→compare.

    U22 B1: segment_fetch(metric, segment_type) — market by_age인데 citation에 metric이 없으면
    (에이전트 plan상 market은 단일 step이라 공존 불가) BFF가 Valkey 세그먼트 값을 곁들여
    compare 카드(시장 vs 자사)를 성립시킨다. 미주입/미가용 시 기존과 동일(compare 생략).
    """
    if not citation:
        return []
    out: list[dict] = []
    market = citation.get("market") or {}
    action = market.get("action") or market.get("dimension")
    rows = market.get("rows") or []

    # bar: 단일 차원 집계
    if action in _BAR_ACTIONS and isinstance(rows, list) and rows:
        series = []
        for r in rows[:top_n]:
            if not isinstance(r, dict):
                continue
            name = _row_label(r)
            val = _row_eok(r)
            if name is not None and val is not None:
                series.append({"name": name, "value": val, "unit": "억원"})
        if series:
            title = _MARKET_TITLE.get(action, f"서울 시장 {action}")
            if len(rows) > top_n:
                title += f" (상위 {len(series)})"
            out.append({"kind": "bar", "title": title, "series": series, "grade": "집계"})

    # heatmap: 업종×연령 2D (age_breakdown 중첩 dict 지원)
    elif action == "industry_age" and isinstance(rows, list) and rows:
        series = []
        for r in rows:
            if not isinstance(r, dict):
                continue
            industry = r.get("industry") or r.get("row")
            breakdown = r.get("age_breakdown")
            if industry and isinstance(breakdown, dict):
                for age, v in breakdown.items():
                    val = _num(v)
                    if val is not None:
                        series.append({"row": str(industry), "col": str(age), "value": round(val / 1e8, 1)})
            else:  # flat 형태 fallback
                col = r.get("age_band") or r.get("col")
                val = _row_eok(r)
                if industry and col and val is not None:
                    series.append({"row": str(industry), "col": str(col), "value": val})
        if series:
            out.append({"kind": "heatmap", "title": "서울 시장 · 업종 × 연령 소비", "series": series, "grade": "집계"})

    # compare: market(by_age 등) + metric 세그먼트 공존 — 연결 A
    metrics = citation.get("metrics") or []
    seg_metric = next((m for m in metrics if isinstance(m, dict) and m.get("data")), None)
    # U22 B1: metric 미공존이면 Valkey에서 곁들임(에이전트 무변경) — compare 프로덕션 도달
    if action == "by_age" and seg_metric is None and segment_fetch is not None:
        fetched = segment_fetch("effective_reward_rate", "age_band")
        if fetched:
            # effective_reward_rate는 raw ratio(expected/eligible_spend, ≈0.006) → 라벨이 '(%)'이므로
            # 백분율로 스케일(×100, 소수 2자리). 값 없는 행은 그대로 둠(compare 조립 시 걸러짐).
            scaled = []
            for d in fetched:
                v = _num(d.get("value"))
                scaled.append({**d, "value": round(v * 100, 2) if v is not None else d.get("value")})
            seg_metric = {"metric_name": "실질 혜택률(%)", "data": scaled}
    if action == "by_age" and seg_metric and isinstance(rows, list):
        left_by = {_row_label(r): _row_eok(r) for r in rows if isinstance(r, dict) and _row_label(r)}
        cmp_series = []
        for d in seg_metric.get("data", []):
            axis = str(next(iter((d.get("dimensions") or {}).values()), ""))
            rv = _num(d.get("value"))
            lv = left_by.get(axis)
            if axis and rv is not None and lv is not None:
                cmp_series.append({
                    "axis": axis,
                    "left": {"label": "서울 시장", "value": lv, "grade": "집계"},
                    "right": {"label": seg_metric.get("metric_name", "지표"), "value": rv, "grade": "합성"},
                })
        if cmp_series:
            out.append({"kind": "compare", "title": "서울 시장(집계) vs 우리 지표(합성)",
                        "series": cmp_series, "grade": "집계"})

    # ── U27 생활인구×소비 카드 ──
    # pop_vs_sales: compare(점심 생활인구 vs 연매출) — S1 여의도 역설의 대표 시각물.
    if action == "pop_vs_sales" and isinstance(rows, list) and rows:
        cmp_series = []
        for r in rows[:top_n]:
            if not isinstance(r, dict):
                continue
            pop = _num(r.get("lunch_pop_avg"))
            sales = _num(r.get("sales_krw"))
            if r.get("area") and pop is not None and sales is not None:
                cmp_series.append({
                    "axis": str(r["area"]),
                    "left": {"label": "점심 생활인구(명/시)", "value": round(pop), "grade": "집계"},
                    "right": {"label": "카드소비(억원/년)", "value": round(sales / 1e8), "grade": "집계"},
                })
        if cmp_series:
            out.append({"kind": "compare", "title": "생활인구(수요) vs 카드소비 — AreaMapping 연결",
                        "series": cmp_series, "grade": "집계"})

    # penetration: bar(1인당 소비 상위/하위) — S1b.
    if action == "penetration" and isinstance(rows, list) and rows:
        series = []
        for r in rows[:top_n]:
            if not isinstance(r, dict):
                continue
            v = _num(r.get("penetration_krw"))
            if r.get("area") and v is not None:
                series.append({"name": str(r["area"]), "value": round(v / 1e4, 1), "unit": "만원/인"})
        if series:
            out.append({"kind": "bar", "title": "1인당 소비(침투율) — 생활인구×추정매출 파생 지표",
                        "series": series, "grade": "집계"})

    # ── U28 시장 시계열 카드 ──
    # trend: bar(상품군 YoY 상위) — 미매핑은 slate 처리(우리 혜택 체계 밖 정직 표기).
    if action == "trend" and isinstance(rows, list) and rows:
        series = []
        for r in rows[:top_n]:
            if not isinstance(r, dict) or r.get("yoy_pct") is None:
                continue
            mapped = r.get("mapped_category")
            series.append({"name": str(r["group"]) + ("" if mapped else " (미커버)"),
                           "value": r["yoy_pct"], "unit": "%",
                           "grade": "공개-실" if mapped else "unsupported"})
        if series:
            out.append({"kind": "bar", "title": "온라인 상품군 성장률(전년비) — 혜택 카테고리 매핑",
                        "series": series, "grade": "공개-실"})

    # market_total: bar(KSIC 대분류별 시장 승인액) — "시장 vs 우리 694장" 포지셔닝.
    if action == "market_total":
        ks = market.get("ksic_industries") or []
        series = [{"name": str(r["ksic_industry"]), "value": round(r["amount_10bkrw"] / 100, 1),
                   "unit": "조원"} for r in ks[:top_n] if isinstance(r, dict)]
        if series:
            out.append({"kind": "bar", "title": "KSIC 대분류별 카드승인액(연) — 시장 구조",
                        "series": series, "grade": "공개-실"})

    # pop_by_age(전체 밴드): compare 3시리즈 소재 — 인구 share vs 시장 소비 share vs 혜택률.
    # 단일 밴드 조회(row)는 카드 생략(본문+해부가 주인공).
    if action == "pop_by_age" and isinstance(rows, list) and rows and segment_fetch is not None:
        fetched = segment_fetch("effective_reward_rate", "age_band")
        rate_by = {}
        for d in fetched or []:
            axis = str(next(iter((d.get("dimensions") or {}).values()), ""))
            v = _num(d.get("value"))
            if axis and v is not None:
                rate_by[axis] = round(v * 100, 2)
        cmp_series = []
        for r in rows:
            band = str(r.get("age_band", ""))
            share = _num(r.get("share"))
            if band and share is not None and band in rate_by:
                cmp_series.append({
                    "axis": f"{band}대" if not band.endswith("이상") else band,
                    "left": {"label": "점심 생활인구 비중(%)", "value": round(share * 100, 1), "grade": "집계"},
                    "right": {"label": "실질 혜택률(%)", "value": rate_by[band], "grade": "합성"},
                })
        if cmp_series:
            out.append({"kind": "compare", "title": "연령대별 생활인구(수요) vs 실질 혜택률(우리)",
                        "series": cmp_series, "grade": "집계"})

    return out
