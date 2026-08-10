
// U17 FR-5b: v1 SCENARIOS 목록 제거(ChatPanel fallback이 도달 불가 코드였음 — 진단 §1 원인4)


// U34(C9): SCENARIO_CATEGORIES 제거 — 소비처 0(v1 fallback 폐기 후 잔재).

// ═══ U6 v2 — 6 A급 시나리오 카테고리 (BFF /api/scenarios) ═══
import type { ScenarioCategory } from './types';

export async function fetchScenarioCategories(): Promise<ScenarioCategory[]> {
  try {
    const resp = await fetch('/api/scenarios', { cache: 'no-store' });
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.categories ?? [];
  } catch {
    return [];
  }
}
