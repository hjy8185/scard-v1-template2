"""Tests for bff/api/scenarios.py — v2 페르소나(P1-P4) + U10 카탈로그 그라운딩.

★ U84 R0: **이 파일 5건 전부 아카이브(`stale`).** 코드가 아니라 이 테스트가 낡았다.

`/api/scenarios`는 **v2 6카테고리 계약**으로 재설계됐다(`scenarios.py:3` docstring —
"6 A급 시나리오×5 질문"). 실제 반환 id는 `A-catalog`·`A-txn`… 이고 `group` 필드도 없다.
이 파일은 그 이전 계약(`P1`~`P4` 페르소나 + `group` in v2/u10/marketer/connection)을
검사한다. 마지막 손댐이 U10·U11 시절(`57bd324`)이고 그 뒤 계약이 두 번 바뀌었다.

    기대                              실제
    {"P1","P2","P3","P4"} <= ids      {"A-catalog","A-txn",…}
    scenario_id == "U10" 1건          0건
    group == "marketer"/"connection"  group 필드 자체가 없다

⚠️ **v1 배포는 살아 있고 정상이다**(33일). 되살리려면 이 테스트를 현재 6카테고리 계약으로
다시 쓰는 것이고, 코드를 되돌리는 것이 아니다. 지우지 않고 남기는 이유 — 무엇이 어떻게
바뀌었는지가 여기 적혀 있어야 다음 사람이 계약 변경을 안다.

돌려보려면: `pytest -m stale bff/tests/test_scenarios_api.py` (5건 실패가 정상)
"""

import pytest
from httpx import AsyncClient, ASGITransport

pytestmark = pytest.mark.stale


def _get_app():
    from bff.main import app
    return app


async def _get(path: str):
    app = _get_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        return await ac.get(path)


async def test_scenarios_v2_default():
    """GET /api/scenarios → v2 페르소나(P1-P4) + U10 카테고리."""
    resp = await _get("/api/scenarios")
    assert resp.status_code == 200
    data = resp.json()
    cats = data["categories"]
    ids = {c["scenario_id"] for c in cats}
    # v2 페르소나 4종은 항상 존재(내용 보존 계약)
    assert {"P1", "P2", "P3", "P4"} <= ids
    for c in cats:
        assert c["questions"]                          # 질문 비어있지 않음
        assert c["story_id"]                           # traceability 고정
        assert c["required_tools"] and c["expected_tabs"] and c["expected_grades"]
        assert c.get("group") in ("v2", "u10", "marketer", "connection")   # 묶음 태그 필수


async def test_scenarios_u10_group_present():
    """U10 카탈로그/온톨로지 그라운딩 카테고리가 group=u10로 추가됨(v2와 분리 표기)."""
    resp = await _get("/api/scenarios")
    cats = resp.json()["categories"]
    u10 = [c for c in cats if c["scenario_id"] == "U10"]
    assert len(u10) == 1
    c = u10[0]
    assert c["group"] == "u10"
    assert len(c["questions"]) == 8                    # 8 쇼케이스 질문(discovery/segment/거버넌스)
    # 카탈로그 발견·세그먼트 비교·지표 거버넌스 대표 질의 포함
    queries = " ".join(q["query"] for q in c["questions"])
    assert "포함돼" in queries                          # catalog discovery
    assert "실질 혜택률" in queries                      # segment metric
    assert "어떻게 계산" in queries or "어떤 데이터" in queries  # 지표 거버넌스


async def test_scenarios_marketer_journey_present():
    """마케터 여정 카테고리(group=marketer)가 순차 8스텝으로 존재."""
    resp = await _get("/api/scenarios")
    cats = resp.json()["categories"]
    mkt = [c for c in cats if c["scenario_id"] == "MKT"]
    assert len(mkt) == 1
    c = mkt[0]
    assert c["group"] == "marketer"
    assert len(c["questions"]) == 8                    # 캠페인 기획 8단계
    # 단계 순서 표기(①~⑧) 유지 — 시연 시 순서대로 클릭
    assert c["questions"][0]["title"].startswith("①")
    assert c["questions"][-1]["title"].startswith("⑧")


async def test_scenarios_v2_group_preserved():
    """기존 v2 페르소나 내용이 보존됨(group=v2 태그만 추가)."""
    resp = await _get("/api/scenarios")
    cats = resp.json()["categories"]
    v2 = [c for c in cats if c["scenario_id"] in {"P1", "P2", "P3", "P4"}]
    assert len(v2) == 4
    assert all(c["group"] == "v2" for c in v2)
    assert all(len(c["questions"]) >= 1 for c in v2)


async def test_scenarios_connection_group():
    """U12 연결증명 카테고리(group=connection)가 v1_failure 툴팁 포함."""
    resp = await _get("/api/scenarios")
    cats = resp.json()["categories"]
    conn = [c for c in cats if c.get("group") == "connection"]
    assert len(conn) >= 5   # X1~X6
    # 질문에 v1_failure(기존엔? 툴팁) 존재
    q = conn[0]["questions"][0]
    assert "v1_failure" in q and q["v1_failure"]
