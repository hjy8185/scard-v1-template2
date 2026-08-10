// U66 — v2 KPI 점등. v1 `lib/kpi.ts::highlightedKpis`와 **같은 KPI_TILES·같은 매칭 규칙**을
// 쓰지만 신호 원천이 다르다.
//
// v1은 `extractSignals(annotation)`이 citation·tool_calls·ontology에서 신호를 모은다. v2는
// annotation이 없다 — 대신 **실제로 읽은 테이블·그래프 라벨**이 있다. KPI_TILES의 lightKeys에
// 이미 테이블명(`r0_card_product`, `d4_transaction`)과 그래프 라벨(`CARD_Product`, `MERCHANT`)이
// 들어 있어 그대로 맞물린다 — v1 타일 정의를 고치지 않고 점등할 수 있다.
//
// 원칙: **trace에 있는 것만 신호로 쓴다.** 답변 본문을 훑어 타일을 켜지 않는다(그럴듯한 거짓).

import { ASSET_NODES, BRIDGES, IDLE_LIGHTING } from './asset-map';
import { KPI_TILES } from './kpi';
import type { LightingState } from './types';
import type { X2Trace } from './x2-types';

/** trace에서 점등 신호를 모은다 — 읽은 테이블, 순회한 라벨·엣지. */
function x2Signals(trace: X2Trace | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!trace) return out;
  const f = trace.final ?? {};

  for (const t of f.tables_used ?? []) if (t) out.add(String(t).toLowerCase());
  const lg = f.lineage;
  for (const s of lg?.sources ?? []) if (s) out.add(String(s).toLowerCase());
  for (const j of lg?.joins ?? []) {
    if (j.left) out.add(String(j.left).toLowerCase());
    if (j.right) out.add(String(j.right).toLowerCase());
  }
  // Gremlin: 시작 라벨·순회 엣지·결과 노드 라벨
  if (lg?.start) out.add(String(lg.start).split(':')[0]);
  for (const l of lg?.labels ?? []) if (l) out.add(String(l));
  for (const s of lg?.steps ?? []) if (s.edge) out.add(String(s.edge));
  for (const n of f.graph_nodes ?? []) if (n.label) out.add(String(n.label));
  // 재시도 시도들이 읽은 테이블도(최종만 보면 경로가 좁아진다)
  for (const a of trace.attempts ?? []) {
    for (const t of a.tables_used ?? []) if (t) out.add(String(t).toLowerCase());
  }
  return out;
}

/** v1과 **같은 매칭 규칙**(양방향 부분일치)으로 켤 타일 id를 낸다. */
export function x2HighlightedKpis(trace: X2Trace | null | undefined): Set<string> {
  const signals = x2Signals(trace);
  const out = new Set<string>();
  for (const tile of KPI_TILES) {
    if (tile.lightKeys.some((k) => {
      const kl = k.toLowerCase();
      for (const s of signals) {
        const sl = s.toLowerCase();
        if (sl === kl || sl.includes(kl) || kl.includes(sl)) return true;
      }
      return false;
    })) out.add(tile.id);
  }
  return out;
}

// ── 자산 지도 점등 ───────────────────────────────────────────────────────────
// v1 우측 패널의 **기본 장면**은 자산 지도(AssetMap)다. 그 컴포넌트는 순수 props라
// v2에서 그대로 쓸 수 있다 — 필요한 것은 `lighting`뿐이다.
//
// v1 `computeLighting(annotation)`은 citation·tool_calls에서 신호를 뽑는다. v2는 위
// `x2Signals`가 같은 일을 다른 원천(읽은 테이블·순회 라벨)에서 한다. ASSET_NODES의
// `lightMapKeys`에 이미 실제 테이블명(`d4_transaction`·`seoul_area_sales`·
// `market_trend_group`)이 들어 있어 **v1 정의를 고치지 않고** 맞물린다.

/** v1 keyHit과 같은 규칙(양방향 부분일치). 그 함수는 비공개라 같은 규칙을 여기 둔다. */
function hit(key: string, signals: Set<string>): boolean {
  const k = key.toLowerCase();
  for (const s of signals) {
    const sl = s.toLowerCase();
    if (sl === k || sl.includes(k) || k.includes(sl)) return true;
  }
  return false;
}

/** v2 trace → 자산 지도 점등 상태. 신호가 없으면 v1과 같은 IDLE을 돌려준다. */
export function x2Lighting(trace: X2Trace | null | undefined): LightingState {
  const signals = x2Signals(trace);
  if (!signals.size) return IDLE_LIGHTING;
  const litNodes = new Set<string>();
  const litBridges = new Set<string>();
  for (const n of ASSET_NODES) {
    if (n.lightMapKeys.some((k) => hit(k, signals))) litNodes.add(n.id);
  }
  for (const b of BRIDGES) {
    if (b.lightMapKeys.some((k) => hit(k, signals))) litBridges.add(b.id);
  }
  return { litNodes, litBridges, phase: 'lit', unmappedTools: [] };
}
