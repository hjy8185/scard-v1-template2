// U22 A1 — 답변이 실행한 action/template 판별의 단일 소스.
// 배경: 프론트 3곳(해부 판별·경로 한 줄·후속 버튼)이 tool_calls[].action만 검사했는데,
// 에이전트 audit 레코드는 action이 아니라 template_id(=step.action)를 싣고, U21까지는
// ontology_query 등 정적자산 tool이 audit 미기록이라 tool_calls 자체가 비어 있었음(도달 불가).
// 수리: tool_calls의 action/template_id + route_plan.template_ids를 합집합으로 판별.

import type { PlatformAnnotation } from './types';

export function executedActions(ann: PlatformAnnotation | undefined): Set<string> {
  const out = new Set<string>();
  if (!ann) return out;
  for (const t of (ann.tool_calls ?? []) as Array<Record<string, unknown>>) {
    for (const k of ['action', 'template_id']) {
      const v = t[k];
      if (typeof v === 'string' && v) out.add(v);
    }
  }
  for (const id of ann.route_plan?.template_ids ?? []) {
    if (id) out.add(id);
  }
  return out;
}
