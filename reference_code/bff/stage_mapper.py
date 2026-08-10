"""Map AgentResponse to 8-stage StageEvent list for DSP streaming.

Stages: glossary → classify → search → traverse → prune → generate → validate → (correct)
"""

from __future__ import annotations

from bff.models import StageEvent

TOOL_TO_STAGE = {
    "glossary": "glossary",
    "opensearch": "search",
    "neptune": "traverse",
}


def map_to_stages(agent_response: dict) -> list[StageEvent]:
    tool_calls = agent_response.get("tool_calls", [])
    card_id = agent_response.get("card_id")
    intent = agent_response.get("intent", "")
    entities = agent_response.get("entities", {})
    subgraph = agent_response.get("subgraph_used", {})
    validation = agent_response.get("validation_result", {})
    correction_count = agent_response.get("correction_count", 0)

    # Build lookup: stage_name → tool_call
    tool_map: dict[str, dict] = {}
    for tc in tool_calls:
        stage_name = TOOL_TO_STAGE.get(tc.get("tool_name", ""))
        if stage_name:
            tool_map[stage_name] = tc

    stages: list[StageEvent] = []

    # 1. Glossary
    glossary_tc = tool_map.get("glossary")
    stages.append(StageEvent(
        stage="glossary",
        status="done" if glossary_tc else "done",
        ms=0,
        data={
            "card_id": card_id,
            "card_name": _extract_field(glossary_tc, "card_name"),
            "merchant_name": _extract_field(glossary_tc, "merchant_name"),
        },
    ))

    # 2. Classify (not a tool_call — derived from agent state)
    stages.append(StageEvent(
        stage="classify",
        status="done",
        ms=0,
        data={"intent": intent, "entities": entities},
    ))

    # 3. Search (conditional: skip if entity branch)
    search_tc = tool_map.get("search")
    if card_id and not search_tc:
        stages.append(StageEvent(
            stage="search",
            status="skip",
            ms=0,
            data={"reason": "entity_branch: card_id resolved"},
        ))
    else:
        stages.append(StageEvent(
            stage="search",
            status="done",
            ms=0,
            data={"result_summary": search_tc.get("result_summary", "") if search_tc else ""},
        ))

    # 4. Traverse
    traverse_tc = tool_map.get("traverse")
    nodes_count = len(subgraph.get("nodes", []))
    edges_count = len(subgraph.get("edges", []))
    stages.append(StageEvent(
        stage="traverse",
        status="done" if traverse_tc else "done",
        ms=0,
        data={
            "template": _extract_field(traverse_tc, "T"),
            "nodes": nodes_count,
            "edges": edges_count,
        },
    ))

    # 5. Prune (derived from subgraph — pruning happens inside neptune tool)
    stages.append(StageEvent(
        stage="prune",
        status="done",
        ms=0,
        data={
            "after": {"nodes": nodes_count, "edges": edges_count},
        },
    ))

    # 6. Generate
    stages.append(StageEvent(
        stage="generate",
        status="done",
        ms=0,
        data={"answer_length": len(agent_response.get("answer", ""))},
    ))

    # 7. Validate
    passed = validation.get("passed", False)
    stages.append(StageEvent(
        stage="validate",
        status="done" if passed else "blocked",
        ms=0,
        data={"passed": passed, "stages": len(validation.get("stages", []))},
    ))

    # 8. Correct (conditional — only if validation failed and correction happened)
    if correction_count > 0:
        stages.append(StageEvent(
            stage="correct",
            status="done",
            ms=0,
            data={"correction_count": correction_count},
        ))

    return stages


def _extract_field(tool_call: dict | None, prefix: str) -> str | None:
    """Extract a field from result_summary like 'card_name=딥드림'."""
    if not tool_call:
        return None
    summary = tool_call.get("result_summary", "")
    for part in summary.split(","):
        part = part.strip()
        if part.startswith(f"{prefix}="):
            return part[len(prefix) + 1:]
        if part.startswith(prefix):
            return part
    return None
