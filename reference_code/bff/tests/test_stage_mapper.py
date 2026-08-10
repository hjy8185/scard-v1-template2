"""Tests for bff/stage_mapper.py — AgentResponse → 8-stage StageEvent mapping."""

from bff.stage_mapper import map_to_stages


SAMPLE_AGENT_RESPONSE = {
    "answer": "딥드림 카드 스타벅스 5% 할인",
    "card_id": "CARD_Product:딥드림",
    "intent": "card_benefit_specific",
    "entities": {"merchant": "스타벅스"},
    "tool_calls": [
        {"tool_name": "glossary", "params": {"query": "딥드림"}, "result_summary": "card_id=CARD_Product:딥드림, card_name=딥드림"},
        {"tool_name": "neptune", "params": {"intent": "card_benefit_specific"}, "result_summary": "T2, nodes=12, edges=15"},
    ],
    "subgraph_used": {"nodes": [{"id": "n1"}] * 8, "edges": [{"id": "e1"}] * 10},
    "validation_result": {"passed": True, "stages": [{"stage": "cite_traceback", "passed": True, "issues": []}]},
    "correction_count": 0,
}


def test_basic_7_stage_mapping():
    """tool_calls → glossary, classify, search(skip), traverse, prune, generate, validate."""
    stages = map_to_stages(SAMPLE_AGENT_RESPONSE)
    stage_names = [s.stage for s in stages]
    assert "glossary" in stage_names
    assert "classify" in stage_names
    assert "traverse" in stage_names
    assert "prune" in stage_names
    assert "generate" in stage_names
    assert "validate" in stage_names
    # validate should show passed=True
    validate = next(s for s in stages if s.stage == "validate")
    assert validate.data["passed"] is True


def test_entity_branch_search_skip():
    """card_id present + no opensearch tool_call → search stage status=skip."""
    stages = map_to_stages(SAMPLE_AGENT_RESPONSE)
    search = next(s for s in stages if s.stage == "search")
    assert search.status == "skip"
    assert "entity_branch" in search.data.get("reason", "")


def test_search_branch_done():
    """card_id absent + opensearch tool_call → search stage status=done."""
    resp = {
        **SAMPLE_AGENT_RESPONSE,
        "card_id": None,
        "tool_calls": [
            {"tool_name": "glossary", "params": {}, "result_summary": "card_id=None"},
            {"tool_name": "opensearch", "params": {}, "result_summary": "top_results=[딥드림,Mr.Life], count=5"},
            {"tool_name": "neptune", "params": {}, "result_summary": "T7, nodes=18, edges=22"},
        ],
    }
    stages = map_to_stages(resp)
    search = next(s for s in stages if s.stage == "search")
    assert search.status == "done"


def test_correct_stage_on_validation_fail():
    """validation failed + correction_count>0 → correct stage generated."""
    resp = {
        **SAMPLE_AGENT_RESPONSE,
        "validation_result": {"passed": False, "stages": [{"stage": "cite_traceback", "passed": False, "issues": ["missing CITE"]}]},
        "correction_count": 1,
    }
    stages = map_to_stages(resp)
    correct = next((s for s in stages if s.stage == "correct"), None)
    assert correct is not None
    assert correct.status == "done"
    assert correct.data["correction_count"] == 1


def test_empty_tool_calls():
    """Empty tool_calls → still produces basic stages."""
    resp = {**SAMPLE_AGENT_RESPONSE, "tool_calls": []}
    stages = map_to_stages(resp)
    stage_names = [s.stage for s in stages]
    assert "classify" in stage_names
    assert "generate" in stage_names
    assert "validate" in stage_names


def test_unknown_tool_name_ignored():
    """Unexpected tool_name → ignored, no crash."""
    resp = {
        **SAMPLE_AGENT_RESPONSE,
        "tool_calls": [
            {"tool_name": "unknown_tool", "params": {}, "result_summary": ""},
            {"tool_name": "glossary", "params": {}, "result_summary": "card_id=X"},
        ],
    }
    stages = map_to_stages(resp)
    stage_names = [s.stage for s in stages]
    assert "glossary" in stage_names
