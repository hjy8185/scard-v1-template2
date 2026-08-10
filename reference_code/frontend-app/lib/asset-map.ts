// U13 자산 지도 — 정적 소스(진실 소스=로컬) + 점등/뱃지/pill 해석 로직.
// ⚠️ 노드/다리는 정적 상수(원천: dataset-catalog-detail 실측 규모를 손으로 옮김).
//    catalog_taxonomy.json은 data/·pipeline/data/에만 있고 frontend엔 없음 → 파서 불요(소량 정적).
// backingTables는 SMUS search-listings 자산명(소문자)과 일치시켜 GovernanceBadge 대조에 사용.

import type {
  AssetNode, Bridge, LightingState, GovernanceBadge, PlatformAnnotation, Camp,
} from './types';

// ── 3진영 ~12노드 (실측 규모) ──
export const ASSET_NODES: AssetNode[] = [
  // ① 신한 약관·상품 [공개-실 jade]
  { id: 'card_product', label: '카드 상품', camp: 'terms', scaleText: '694장', grade: '공개-실',
    backingTables: ['r0_card_product'], connected: true,
    lightMapKeys: ['CARD_Product', 'card_product', 'r0_card_product'] },
  { id: 'benefit', label: '혜택', camp: 'terms', scaleText: '5,647건', grade: '공개-실',
    backingTables: ['r1_benefit'], connected: true,
    lightMapKeys: ['Benefit', 'BenefitGroup', 'benefit', 'r1_benefit'] },
  { id: 'benefit_condition', label: '약관 조건', camp: 'terms', scaleText: '11,533건 (파싱 25%)', grade: '공개-실',
    backingTables: ['r2_benefit_condition'], connected: true,
    lightMapKeys: ['Condition', 'BenefitLimit', 'Exclusion', 'benefit_condition', 'r2_benefit_condition'] },
  { id: 'spend_tier', label: '전월실적 구간', camp: 'terms', scaleText: '758구간', grade: '공개-실',
    backingTables: ['r3_spend_tier'], connected: true,
    lightMapKeys: ['SpendTier', 'spend_tier', 'r3_spend_tier'] },
  { id: 'merchant', label: '가맹점', camp: 'terms', scaleText: '809개', grade: '공개-실',
    backingTables: ['r4_merchant_reference'], connected: true,
    lightMapKeys: ['MERCHANT', 'merchant', 'r4_merchant_reference'] },

  // ② 서울 시장 [집계 aqua]
  // U64: backingTables는 **실제 Glue/SMUS 자산명**이어야 뱃지가 붙는다.
  // 여기 이름들이 로컬 인덱스 파일 시절 이름(seoul_sales·population_market_index·
  // market_trend_index)으로 남아 있어, SMUS에 등재해도 대조가 실패해 뱃지가 안 떴다.
  // U50에서 데이터가 Lakehouse Iceberg로 옮겨간 뒤의 실제 테이블명으로 정정한다.
  { id: 'seoul_sales', label: '서울 상권 추정매출', camp: 'market', scaleText: '85,732행 · 92.7조 · 62업종', grade: '집계',
    backingTables: ['seoul_area_sales'], connected: true,
    lightMapKeys: ['market', 'seoul', 'seoul_sales', 'seoul_area_sales', 'by_industry', 'by_area', 'by_category', 'by_age', 'by_sex', 'by_time', 'by_weekday', 'industry_age'] },
  // U27: 생활인구(수요) — 추정매출과 지역 코드 체계가 달라 AreaMapping 다리로 연결
  { id: 'living_pop', label: '서울 생활인구', camp: 'market', scaleText: '행정동×시간대×성/연령 · 매일 갱신', grade: '집계',
    backingTables: ['seoul_living_population'], connected: true,
    lightMapKeys: ['pop_vs_sales', 'penetration', 'pop_by_age', 'living_pop', 'population', 'seoul_living_population'] },
  // U28: 시장 시계열(KOSIS 온라인쇼핑·ECOS·여신협회) — 공개-실 통계, 카테고리 crosswalk로 연결
  { id: 'market_trend', label: '시장 시계열', camp: 'market', scaleText: 'KOSIS 26상품군 · 승인 112.5조/월', grade: '공개-실',
    backingTables: ['market_trend_group'], connected: true,
    lightMapKeys: ['trend', 'market_total', 'market_trend', 'market_trend_group'] },
  { id: 'category_node', label: '카테고리 체계', camp: 'market', scaleText: '카테고리+관계', grade: '집계',
    backingTables: ['d0_category_node', 'd0_category_relation'], connected: true,
    lightMapKeys: ['CATEGORY', 'category', 'closure_path', 'categories', 'd0_category_node'] },

  // ③ 고객·거래 [합성 amber]
  { id: 'customer', label: '고객', camp: 'synthetic', scaleText: '1,000명', grade: '합성',
    backingTables: ['d1_customer', 'd2_account'], connected: true,
    lightMapKeys: ['customer', 'segment', 'd1_customer', 'd2_account'] },
  { id: 'transaction', label: '거래', camp: 'synthetic', scaleText: '125,891건 (4개월)', grade: '합성',
    backingTables: ['d4_transaction', 'd5_statement_monthly'], connected: true,
    lightMapKeys: ['transaction', 'txn', 'd4_transaction', 'd5_statement_monthly', 'txn_rollup'] },
  { id: 'reward_ledger', label: '리워드 원장', camp: 'synthetic', scaleText: '99,278건', grade: '합성',
    backingTables: ['d6_reward_ledger'], connected: true,
    lightMapKeys: ['reward', 'ledger', 'metric', 'effective_reward_rate', 'eligible_spend', 'd6_reward_ledger'] },
  // U19 R1: 민원 검색·추적 서빙 연동 — 자물쇠 해제(이제 사실)
  { id: 'complaint', label: '민원', camp: 'synthetic', scaleText: '503건 (검색·추적 가능)', grade: '합성',
    backingTables: ['d7_complaint'], connected: true,
    lightMapKeys: ['complaint', 'complaint_search', 'complaint_trace', 'd7_complaint'] },
];

// ── 4다리(진영 사이 연결) ──
export const BRIDGES: Bridge[] = [
  { id: 'crosswalk', kind: 'crosswalk', from: 'market', to: 'terms',
    label: 'crosswalk 43매핑 (커버 90.2%)', exemplar: '한식·중식·일식·양식·분식(서울 5업종) → 음식점(신한)',
    lightMapKeys: ['crosswalk', 'targeting'] },
  { id: 'subsumption', kind: 'subsumption', from: 'market', to: 'terms',
    label: 'subsumption 13관계', exemplar: '식음료 ⊒ 음식점·커피/음료',
    lightMapKeys: ['closure_path', 'categories', 'subsumption'] },
  { id: 'rule_engine', kind: 'rule', from: 'terms', to: 'synthetic',
    label: '규칙엔진 판정', exemplar: '약관 조건 → 거래 자격판정',
    lightMapKeys: ['rule_trace', 'eligibility', 'what_if'] },
  { id: 'semantic_metric', kind: 'metric', from: 'synthetic', to: 'terms',
    label: '시맨틱 metric 7종', exemplar: '거래·원장 → 실질혜택률',
    lightMapKeys: ['metric', 'metrics', 'effective_reward_rate', 'self_metric'] },
  // U27: 상권↔행정동 — 두 공공 자산(추정매출·생활인구)을 같은 지역 축으로 잇는 다리.
  // market 진영 내부 연결: endpoints로 노드를 명시(camp 기반 기본 배선은 self-loop가 됨 — B5 교훈).
  { id: 'area_mapping', kind: 'crosswalk', from: 'market', to: 'market',
    endpoints: { source: 'living_pop', target: 'seoul_sales' },
    label: 'AreaMapping 25상권↔행정동', exemplar: '여의도역(상권코드) → 여의동 11560540(행정동코드)',
    lightMapKeys: ['pop_vs_sales', 'penetration', 'pop_by_age', 'area_mapping'] },
  // U28: KOSIS 상품군 ↔ 신한 혜택 카테고리 — 시장 시계열을 우리 혜택 축으로 잇는 curated 매핑.
  { id: 'kosis_crosswalk', kind: 'crosswalk', from: 'market', to: 'terms',
    endpoints: { source: 'market_trend', target: 'benefit' },
    label: 'KOSIS 매핑 20/25상품군', exemplar: '화장품(+36.6%) → 뷰티(신한 카테고리)',
    lightMapKeys: ['trend', 'kosis_crosswalk'] },
];

// annotation → 점등 신호 집합 추출
export function extractSignals(ann: PlatformAnnotation | undefined): Set<string> {
  const sig = new Set<string>();
  if (!ann) return sig;
  const cit = ann.citation;
  if (cit) {
    // graph_paths: node_type/label 문자열
    for (const gp of cit.graph_paths ?? []) {
      const s = typeof gp === 'string' ? gp : JSON.stringify(gp);
      sig.add(s);
    }
    // sql source_tables (query 텍스트에서 테이블명 등장)
    if (cit.sql?.query) sig.add(cit.sql.query);
    for (const m of cit.metrics ?? []) if (m?.metric_name) sig.add(m.metric_name);
    // market
    const market = (cit as { market?: { rows?: unknown[]; action?: string; crosswalk_summary?: unknown } }).market;
    if (market) {
      if (market.rows || market.crosswalk_summary) sig.add('market');
      if (market.action) sig.add(market.action);
    }
    if (cit.rule_trace) sig.add('rule_trace');
    // provenance: 테이블/컴포넌트 레벨 근거(component/source)
    for (const p of (cit as { provenance?: Array<{ component?: string; source?: string }> }).provenance ?? []) {
      if (p.component) sig.add(p.component);
      if (p.source) sig.add(p.source);
    }
  }
  if (ann.ontology) {
    if (ann.ontology.crosswalk?.length) sig.add('crosswalk');
    if (ann.ontology.closure_path?.length) sig.add('closure_path');
    if (ann.ontology.categories?.length) sig.add('categories');
  }
  const intent = ann.route_plan?.intent;
  if (intent) sig.add(intent);
  return sig;
}

// 신호가 lightMapKey와 매칭되나 (부분 문자열 양방향)
function keyHit(key: string, signals: Set<string>): boolean {
  for (const s of signals) {
    if (s === key) return true;
    if (s.includes(key) || key.includes(s)) return true;
  }
  return false;
}

// tool 이름 → 점등 신호 매핑 (F1 엄격: orchestrated_stream은 citation 없이 tool_calls+intent만 보유).
// 같은 tool 내 세부 노드 구분은 거칠 수 있음(예: market_query는 서울매출 노드 위주) — 수용된 한계.
const TOOL_SIGNALS: Record<string, string[]> = {
  graph_query: ['CARD_Product', 'Benefit', 'benefit_condition', 'spend_tier', 'merchant'],
  sql_query: ['transaction', 'reward'],
  market_query: ['market', 'seoul'],
  metric_query: ['metric', 'reward'],
  ontology_query: ['closure_path', 'categories', 'crosswalk'],
  rule_eval: ['rule_trace'],
  doc_search: ['benefit_condition'],
};

// 점등 계산 (Q2 핵심). tool_calls + intent 기반(F1 엄격 — citation 미보유).
export function computeLighting(
  ann: PlatformAnnotation | undefined,
  toolNames: string[] = [],
): LightingState {
  const signals = extractSignals(ann);
  // tool 이름을 신호로 편입 (citation 없는 stream 경로 대응)
  for (const t of toolNames) {
    signals.add(t);
    for (const s of TOOL_SIGNALS[t] ?? []) signals.add(s);
  }
  const litNodes = new Set<string>();
  const litBridges = new Set<string>();
  for (const n of ASSET_NODES) {
    if (n.lightMapKeys.some((k) => keyHit(k, signals))) litNodes.add(n.id);
  }
  for (const b of BRIDGES) {
    if (b.lightMapKeys.some((k) => keyHit(k, signals))) litBridges.add(b.id);
  }
  // 미매핑 tool: TOOL_SIGNALS에도 없고 어떤 키도 못 켠 tool (콘솔 경고용, 전체 dim 금지 — L3)
  const allKeys = [...ASSET_NODES.flatMap((n) => n.lightMapKeys), ...BRIDGES.flatMap((b) => b.lightMapKeys)];
  const unmappedTools = toolNames.filter(
    (t) => !(t in TOOL_SIGNALS) && !allKeys.some((k) => t.includes(k) || k.includes(t)),
  );
  if (unmappedTools.length) console.warn('[asset-map] unmapped tools (지도 미점등):', unmappedTools);
  return { litNodes, litBridges, phase: 'lit', unmappedTools };
}

export const IDLE_LIGHTING: LightingState = {
  litNodes: new Set(), litBridges: new Set(), phase: 'idle', unmappedTools: [],
};

// SMUS 등록 자산명 → 노드별 GovernanceBadge (R4a 부분등록 규칙)
export function mapTablesToNodes(
  registeredAssets: string[],
  snapshotDate: string | null,
): Map<string, GovernanceBadge> {
  const reg = new Set(registeredAssets.map((a) => a.toLowerCase()));
  const label = snapshotDate ? `등록 확인: SMUS 스냅샷 ${snapshotDate.slice(0, 10)}` : '등록 확인: SMUS';
  const out = new Map<string, GovernanceBadge>();
  for (const n of ASSET_NODES) {
    const registered = n.backingTables.filter((t) => reg.has(t.toLowerCase()));
    let status: GovernanceBadge['status'] = 'none';
    if (registered.length === n.backingTables.length && registered.length > 0) status = 'full';
    else if (registered.length > 0) status = 'partial';
    if (status !== 'none') {
      out.set(n.id, { nodeId: n.id, registeredTables: registered, status, snapshotLabel: label });
    }
  }
  return out;
}

// P7: 답변이 실제 사용한 노드/테이블 레벨 근거 추출(비저빌리티).
export interface UsedNode { id: string; label: string; name: string }
export interface UsedTable { component: string; source: string }
export interface UsedMarketRow { label: string; amount: string }

// market action별 라벨 필드가 다름(by_age→age_band, by_industry→industry, by_category→category...).
// 범용 탐지: 알려진 라벨 키 우선, 없으면 숫자/amount 아닌 첫 문자열 필드.
const _MARKET_LABEL_KEYS = ['industry', 'age_band', 'category', 'area', 'sex', 'time_band', 'weekday', 'label', 'name', 'key'];
const _MARKET_DIM_TITLE: Record<string, string> = {
  by_age: '연령대', by_industry: '업종', by_category: '카테고리', by_area: '지역',
  by_sex: '성별', by_time: '시간대', by_weekday: '요일', industry_age: '업종×연령',
};

function _rowLabel(r: Record<string, unknown>): string | null {
  for (const k of _MARKET_LABEL_KEYS) {
    if (r[k] != null && typeof r[k] !== 'number') return String(r[k]);
  }
  // fallback: amount/krw/share 아닌 첫 non-number 필드
  for (const [k, v] of Object.entries(r)) {
    if (!['krw', 'amount', 'share', 'value', 'count'].includes(k) && typeof v === 'string') return v;
  }
  return null;
}

export function marketDimTitle(action?: string): string {
  return action ? (_MARKET_DIM_TITLE[action] ?? action) : '';
}

interface GNode { id?: string; label?: string; name?: string }
// graph_paths 원소는 두 형태: {objects:[노드...]}(경로) 또는 노드 dict 그 자체. 둘 다 노드로 평탄화.
function _flattenGraphObjects(gp: unknown): GNode[] {
  const out: GNode[] = [];
  for (const item of (gp as unknown[]) ?? []) {
    if (item && typeof item === 'object') {
      const objs = (item as { objects?: GNode[] }).objects;
      if (Array.isArray(objs)) out.push(...objs.filter((o) => o && o.id));
      else if ((item as GNode).id) out.push(item as GNode);  // 노드 dict 직접
    }
  }
  return out;
}
// graph_paths 원소가 경로(objects)면 연속 노드 엣지 반환, 노드 dict 직접이면 엣지 없음.
function _pathEdges(gp: unknown): Array<[string, string]> {
  const edges: Array<[string, string]> = [];
  for (const item of (gp as unknown[]) ?? []) {
    const objs = (item as { objects?: GNode[] })?.objects;
    if (Array.isArray(objs)) {
      const ids = objs.filter((o) => o?.id).map((o) => o.id!);
      for (let i = 1; i < ids.length; i++) edges.push([ids[i - 1], ids[i]]);
    }
  }
  return edges;
}

export function extractProvenance(ann: PlatformAnnotation | undefined): {
  nodes: UsedNode[]; tables: UsedTable[]; marketRows: UsedMarketRow[]; marketAction?: string;
} {
  const nodes: UsedNode[] = [];
  const tables: UsedTable[] = [];
  const marketRows: UsedMarketRow[] = [];
  const cit = ann?.citation as {
    graph_paths?: unknown[];
    provenance?: Array<{ component?: string; source?: string }>;
    market?: { rows?: Array<Record<string, unknown>>; action?: string };
  } | undefined;
  if (!cit) return { nodes, tables, marketRows };
  const seen = new Set<string>();
  for (const o of _flattenGraphObjects(cit.graph_paths)) {
    if (o.id && !seen.has(o.id)) {
      seen.add(o.id);
      nodes.push({ id: o.id, label: o.label ?? '', name: o.name ?? o.id });
    }
  }
  for (const p of cit.provenance ?? []) {
    tables.push({ component: p.component ?? '', source: p.source ?? '' });
  }
  for (const r of cit.market?.rows ?? []) {
    const label = _rowLabel(r);
    const amount = (r.amount as string) ?? (r.krw != null ? String(r.krw) : '');
    if (label) marketRows.push({ label, amount });
  }
  return { nodes, tables, marketRows, marketAction: cit.market?.action };
}

// (U18: buildConceptMapping/ConceptMapping 제거 — AnatomyView(lib/anatomy.ts)가 상위 호환)

// 온톨로지 노드 label → 실 소스 테이블 (RealNodeGraph·해부 뷰 공용)
const _LABEL_TABLE: Record<string, string> = {
  CARD_Product: 'r0_card_product', CARD_BenefitGroup: 'r1_benefit', CARD_Benefit: 'r1_benefit',
  CARD_Condition: 'r2_benefit_condition', CARD_BenefitLimit: 'r2_benefit_condition',
  CARD_SpendTier: 'r3_spend_tier', CARD_AnnualFee: 'r0_card_product', CARD_Exclusion: 'r2_benefit_condition',
  MERCHANT: 'r4_merchant_reference', CATEGORY: 'd0_category_node',
};
export function tableOf(label: string): string { return _LABEL_TABLE[label] ?? label; }

export interface RealNode { id: string; label: string; name: string; camp: Camp }
export interface RealEdge { source: string; target: string }

function nodeCamp(label: string): Camp {
  if (label.startsWith('CARD_') || label === 'MERCHANT') return 'terms';
  if (label.includes('Category') || label.includes('Seoul') || label.includes('Market')) return 'market';
  return 'synthetic';
}

export function graphPathsToRealGraph(ann: PlatformAnnotation | undefined): { nodes: RealNode[]; edges: RealEdge[] } {
  const gp = (ann?.citation as { graph_paths?: unknown[] } | undefined)?.graph_paths;
  const nodeMap = new Map<string, RealNode>();
  for (const o of _flattenGraphObjects(gp)) {
    if (o.id && !nodeMap.has(o.id)) {
      nodeMap.set(o.id, { id: o.id, label: o.label ?? '', name: o.name ?? o.id, camp: nodeCamp(o.label ?? '') });
    }
  }
  const edgeSet = new Set<string>();
  const edges: RealEdge[] = [];
  for (const [s, t] of _pathEdges(gp)) {
    const key = `${s}->${t}`;
    if (!edgeSet.has(key) && nodeMap.has(s) && nodeMap.has(t)) { edgeSet.add(key); edges.push({ source: s, target: t }); }
  }
  return { nodes: [...nodeMap.values()], edges };
}


// U34(C9): resolveCiteRef 제거 — cite pill은 resolveCiteBridge(bridgeId) 단일 경로.

// U16 2번: 온톨로지 cite pill(예: '생활'⊑분류) → 자산지도 다리 점등 대상.
// closure/subsumption 신호는 subsumption 다리, crosswalk 신호는 crosswalk 다리로.
// 반환: {litBridges, litNodes, drilldown} — 없으면 null(다리 매핑 실패).
const _SUBSUMPTION_HINTS = ['생활', '분류', '상위', '포함관계', '온톨로지', 'closure', 'subsumption', '⊑', '식음료', '카테고리'];
const _CROSSWALK_HINTS = ['crosswalk', '연결', '매핑', '통계어', '약관어'];
// isOntologyLabel: ref가 annotation.ontology의 라벨(categories/closure/crosswalk)이면 true.
// 이 경우 힌트 단어가 없어도(예: '편의점') 기본 subsumption 다리로 연결한다 — pill 자체가
// "온톨로지 근거"라는 뜻이므로 카테고리 계층(subsumption)을 보여주는 게 맞다.
export function resolveCiteBridge(ref: string, isOntologyLabel = false): { bridgeId: string; nodeIds: string[] } | null {
  const r = ref.toLowerCase();
  if (_CROSSWALK_HINTS.some((h) => r.includes(h.toLowerCase()))) {
    return { bridgeId: 'crosswalk', nodeIds: ['seoul_sales', 'category_node'] };
  }
  // subsumption(카테고리 계층) — 힌트 단어 or 온톨로지 라벨이면 연결(FR-1 '편의점'⊑'생활' 판정 근거)
  if (isOntologyLabel || _SUBSUMPTION_HINTS.some((h) => r.includes(h.toLowerCase()))) {
    return { bridgeId: 'subsumption', nodeIds: ['category_node', 'benefit'] };
  }
  return null;
}
