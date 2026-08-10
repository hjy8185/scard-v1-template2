"""U19 — /api/anatomy 실데이터 서빙 테스트."""
from bff.api.anatomy import anatomy


def test_food_full_anatomy():
    r = anatomy(category="음식점", merchant=None)
    assert len(r["benefit_rows"]) >= 1                      # 크롤 실행
    assert len(r["seoul_rows"]) == 5                        # crosswalk 5업종
    assert r["arithmetic"]["total"] == 19.62                # 서버 검산
    assert "음식점" in r["arithmetic"]["claim"]


def test_any_category_covered():
    # 정적 3벌이 아니라 전 카테고리 — 뷰티/여가/교육 전부 crosswalk+검산
    for cat in ["뷰티", "여가", "교육/학원", "약국"]:
        r = anatomy(category=cat, merchant=None)
        assert r["crosswalk"] is not None, cat
        assert r["arithmetic"] is not None, cat


def test_expanded_r5_category():
    # R5 확장 매핑(수산물→슈퍼마켓) 반영 확인
    r = anatomy(category="슈퍼마켓/마트", merchant=None)
    assert "수산물판매" in r["crosswalk"]["to"]


def test_unknown_category_honest_empty():
    r = anatomy(category="존재하지않는카테고리", merchant=None)
    assert r["crosswalk"] is None and r["arithmetic"] is None


def test_merchant():
    r = anatomy(category=None, merchant="스타벅스")
    assert r["merchant_rows"][0]["canonical_name"] == "스타벅스"


def test_no_false_smart_installment():
    r = anatomy(category="슈퍼마켓/마트", merchant=None)
    assert all("스마트" not in b["benefit_category"] for b in r["benefit_rows"])
