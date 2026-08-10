"""U6 — enrich.py: ontology/catalog hybrid (cache hit/miss/fallback)."""

from bff import enrich


def test_enrich_ontology_cache_hit():
    # 스타벅스 → 커피 카테고리 (캐시 hit) + closure + crosswalk
    citation = {"graph_paths": [{"objects": [{"name": "스타벅스", "label": "MERCHANT"}]}]}
    ctx = enrich.enrich_ontology(citation, query="스타벅스 커피 혜택")
    assert ctx["source"] == "cache"
    assert any("커피" in c["label"] for c in ctx["categories"])
    assert "외식" in ctx["closure_path"]              # subsumption closure
    assert any(x["to_scheme"] == "seoul-industry" for x in ctx["crosswalk"])


def test_enrich_ontology_miss_triggers_lookup():
    called = {}
    def neptune_lookup(kw):
        called["kw"] = kw
        return {"category": {"iri": "x", "label": "새카테고리", "closure_labels": ["새카테고리"]},
                "crosswalk": []}
    # '반려동물'은 캐시에 없음 → lookup 경로. 단, keyword 추출은 캐시 키 기반이므로
    # 캐시에 없는 키워드는 후보에서 빠짐 → lookup 미호출이 정상(=degrade)
    citation = {"graph_paths": []}
    ctx = enrich.enrich_ontology(citation, query="반려동물 혜택", neptune_lookup=neptune_lookup)
    assert ctx == {}                                  # 후보 없음 → degrade(빈 컨텍스트)


def test_enrich_ontology_degrade_empty():
    ctx = enrich.enrich_ontology({"graph_paths": []}, query="관련 없는 질문")
    assert ctx == {}


def test_enrich_catalog_cache_hit():
    citation = {"metrics": [{"metric_name": "effective_reward_rate"}]}
    ctx = enrich.enrich_catalog(citation)
    assert ctx["source"] == "cache"
    assert any("실질혜택률" in t["name"] for t in ctx["terms"])
    assert any(l["kind"] == "serve" for l in ctx["lineage"])   # lineage 계보


def test_enrich_catalog_fallback_on_blocker():
    # 캐시에 없는 metric → glossary_lookup None → registry_fallback (U1b blocker #7)
    citation = {"metrics": [{"metric_name": "brand_new_metric"}]}
    def registry_fallback(name):
        return {"name": name, "definition": "U4 registry 정의", "owning_project": "u4"}
    ctx = enrich.enrich_catalog(citation, registry_fallback=registry_fallback)
    assert ctx["source"] == "fallback:u4-registry"
    assert ctx["terms"][0]["owning_project"] == "u4"


def test_enrich_catalog_degrade_empty():
    ctx = enrich.enrich_catalog({"metrics": []})
    assert ctx == {}


# ── U14 P0: build_insights (실 row 키 기반 — 문서 §1b 버그 회귀 방지) ──
# 실측 row 키: by_industry→industry, by_age→age_band, by_time→time_slot 등. krw는 원 단위.
def test_build_insights_bar_industry_key():
    # industry 키(실측) — 예전엔 label만 봐서 0장이던 버그
    cit = {"market": {"action": "by_industry", "rows": [
        {"industry": "한식음식점", "krw": 15059664523557, "amount": "15.1조원"}]}}
    out = enrich.build_insights(cit)
    assert len(out) == 1 and out[0]["kind"] == "bar"
    s = out[0]["series"][0]
    assert s["name"] == "한식음식점"
    # 15.05조원 → 억원 = 150596.6 (1억배 오류 없음)
    assert 150000 < s["value"] < 151000, s["value"]
    assert s["unit"] == "억원"


def test_build_insights_bar_age_time_sex_keys():
    for action, key, val in [("by_age", "age_band", "60_이상"),
                             ("by_time", "time_slot", "00~06"),
                             ("by_sex", "sex", "M"),
                             ("by_weekday", "weekday", "주중")]:
        cit = {"market": {"action": action, "rows": [{key: val, "krw": 10000000000000}]}}
        out = enrich.build_insights(cit)
        assert out and out[0]["series"][0]["name"] == val, f"{action} 실패"
        assert out[0]["series"][0]["value"] == 100000.0  # 10조 = 100,000억


def test_build_insights_amount_fallback():
    # krw 없고 amount 문자열만 있을 때
    cit = {"market": {"action": "by_industry", "rows": [{"industry": "커피", "amount": "2.8조원"}]}}
    out = enrich.build_insights(cit)
    assert out[0]["series"][0]["value"] == 28000.0  # 2.8조 = 28,000억


def test_build_insights_compare_age_band():
    cit = {"market": {"action": "by_age", "rows": [{"age_band": "20대", "krw": 5000000000000}]},
           "metrics": [{"metric_name": "effective_reward_rate",
                        "data": [{"dimensions": {"age_band": "20대"}, "value": 3.2}]}]}
    out = enrich.build_insights(cit)
    cmp = [c for c in out if c["kind"] == "compare"]
    assert cmp and cmp[0]["series"][0]["axis"] == "20대"
    assert cmp[0]["series"][0]["left"]["grade"] == "집계"
    assert cmp[0]["series"][0]["right"]["grade"] == "합성"


def test_build_insights_empty_when_no_market():
    assert enrich.build_insights({}) == []
    assert enrich.build_insights({"graph_paths": [{}]}) == []


# ── U13 P6: enrich_ontology query-only(citation 없이 구체 연결) ──
def test_enrich_ontology_query_only_crosswalk():
    # citation 비어도 query "커피"만으로 구체 crosswalk 쌍 반환(주 스트림 경로 F1 준수)
    r = enrich.enrich_ontology({}, "커피 혜택이 서울 시장에서 얼마나")
    assert r, "커피 키워드로 ontology 나와야"
    pairs = r.get("crosswalk", [])
    assert len(pairs) >= 1
    # 구체 개념쌍: 신한 약관어 → 외부 통계어(오버뷰 아님)
    labels = [(p.get("from_label"), p.get("to_label"), p.get("to_scheme")) for p in pairs]
    assert any(fl == "커피/음료" and tl for fl, tl, ts in labels), labels


# ── U19: 외식/음식점 alias 정규화(diagnosis-anatomy-missing-외식-음식점) ──

def test_enrich_ontology_alias_label_gets_crosswalk():
    """'외식'(N00002, crosswalk 없음)로 잡혀도 canonical '음식점'의 crosswalk가 조회돼야."""
    from bff.enrich import enrich_ontology
    r = enrich_ontology({"graph_paths": []}, "우리 음식점 혜택이 노리는 서울 외식 시장이 얼마나 커?")
    assert len(r.get("crosswalk", [])) >= 5           # 음식점 5업종 + 시장규모
    labels = [c["label"] for c in r.get("categories", [])]
    assert "음식점" in labels                          # canonical 포함


def test_enrich_ontology_pure_alias_query():
    from bff.enrich import enrich_ontology
    r = enrich_ontology({"graph_paths": []}, "외식 시장 얼마나 커?")
    assert len(r.get("crosswalk", [])) >= 5


# ── U23: 병원 질의 커피 오염 수리 — query 어휘를 canonical/시장 라벨까지 인정 ──
def test_enrich_ontology_hospital_not_contaminated_by_search_results():
    # 검색결과에 커피 카드가 섞여 있어도 query가 '병원'이면 의료 crosswalk (커피 폴백 금지)
    cit = {"graph_paths": [{"objects": [{"name": "YOLO Tasty", "label": "카드"},
                                        {"name": "커피/음료 10% 할인", "label": "혜택"}]}]}
    r = enrich.enrich_ontology(cit, "병원 혜택 있어?")
    froms = {x.get("from_label") for x in (r or {}).get("crosswalk", [])}
    assert "커피/음료" not in froms
    assert "의료" in froms


def test_enrich_ontology_fallback_kept_when_no_query_vocab():
    # query에 카테고리 어휘가 전혀 없으면 기존 폴백(검색결과 텍스트) 유지
    cit = {"graph_paths": [{"objects": [{"name": "커피/음료 10% 할인", "label": "혜택"}]}]}
    r = enrich.enrich_ontology(cit, "이 카드 제일 큰 혜택 뭐야?")
    labels = [c.get("label") for c in (r or {}).get("categories", [])]
    assert "커피/음료" in labels
