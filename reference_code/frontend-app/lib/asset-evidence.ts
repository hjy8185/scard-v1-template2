// U38 Stage 0 — DataAssetEvidence: 답변별 데이터 자산 증거의 표시 계약.
//
// 원칙(계획 v2 §3.1-5, 리뷰 P0-3):
// - 자산 식별은 정적 registry(ASSET_REGISTRY) + provenance.component 결정론 매핑 —
//   프론트 추측 조인 금지. 매핑 안 되는 것은 미표시가 아니라 'unknown 자산'으로 정직 표시.
// - '답변에 사용된 행'은 citation에 실제 rows가 있을 때만(sampleKind='used-in-answer').
//   정적 table_anatomy의 행은 'representative'로 구분.
// - 없는 값(as_of/hash/스키마)은 채우지 않고 unavailable에 기록 — "미제공" 렌더.
// - source_kind / processing / provider 분리(§5.2 — '집계' 의미 혼용 해소).

import type { PlatformAnnotation, ChainResult } from './types';

export type SourceKind = 'public-real' | 'aggregate' | 'synthetic' | 'estimated' | 'unknown';

export interface DataAssetEvidence {
  assetId: string;
  displayName: string;
  roleInAnswer: string;                 // 이 답변에서 자산이 한 일
  source: { provider?: string; sourceKind: SourceKind; processing?: 'raw' | 'aggregate' };
  freshness?: { asOf?: string };
  scale?: { displayText?: string };     // "5,647행" 등 — registry의 실측 표기
  schemaPreview?: Array<{ name: string; type?: string; desc?: string }>;
  sampleRows?: Array<Record<string, unknown>>;
  sampleKind?: 'used-in-answer' | 'representative';
  governance?: { trust?: string; note?: string };
  unavailable: string[];                // 이 응답에서 미제공인 필드명
}

// ── 정적 자산 registry — asset-map/table_anatomy/KPI와 단일 사실 유지 ─────────
// (값은 기존 자산 표기를 그대로 — 여기서 새 수치를 만들지 않는다)
interface RegistryEntry {
  displayName: string; provider: string; sourceKind: SourceKind;
  processing?: 'raw' | 'aggregate'; scaleText?: string; anatomyTableId?: string;
  asOf?: string;
}

export const ASSET_REGISTRY: Record<string, RegistryEntry> = {
  card_graph: { displayName: '카드 상품 그래프(Neptune)', provider: '신한카드 공개 상품(크롤)',
    sourceKind: 'public-real', processing: 'raw', scaleText: '694장 · 혜택 5,647 · 조건 11,533',
    anatomyTableId: 'r1_benefit' },
  rule_engine: { displayName: '약관 규칙엔진', provider: '신한 약관 파싱(R2)',
    sourceKind: 'public-real', processing: 'raw', scaleText: '조건 11,533행 · 파싱 25%',
    anatomyTableId: 'r2_benefit_condition' },
  doc_search: { displayName: '약관 문서 검색(OpenSearch)', provider: '신한 약관 원문',
    sourceKind: 'public-real', processing: 'raw' },
  metric_store: { displayName: '시맨틱 지표 저장소(Valkey)', provider: 'D6 리워드 원장 집계',
    sourceKind: 'synthetic', processing: 'aggregate', scaleText: '원장 9.9만행 기반',
    anatomyTableId: 'metric_value' },
  seoul_market: { displayName: '서울 상권 추정매출', provider: '서울시 상권분석서비스',
    sourceKind: 'aggregate', processing: 'aggregate', scaleText: '85,732행 · 92.7조 · 62업종',
    anatomyTableId: 'seoul_sales', asOf: '2025 연간' },
  living_pop: { displayName: '서울 생활인구', provider: '서울시 공공데이터(통신 추계)',
    sourceKind: 'aggregate', processing: 'aggregate', scaleText: '행정동×시간대×성/연령',
    anatomyTableId: 'living_pop', asOf: '2026-06 대표월' },
  market_trend: { displayName: '시장 시계열(KOSIS·ECOS·여신협회)', provider: '통계청·한국은행·여신금융협회',
    sourceKind: 'public-real', processing: 'aggregate', scaleText: 'KOSIS 26상품군 · 승인 112.5조/월',
    asOf: '2026-05' },
  ontology_maps: { displayName: '온톨로지 맵(민원·조건·롤업·제외)', provider: 'D7 민원 × 약관 조건 × D4 거래',
    sourceKind: 'synthetic', processing: 'aggregate', scaleText: '민원 5,974 앵커 · 조건유형 7종',
    anatomyTableId: 'd7_complaint' },
  catalog: { displayName: '데이터 카탈로그(SMUS glossary)', provider: 'taxonomy.ttl · glossary',
    sourceKind: 'public-real', processing: 'raw', scaleText: '용어 7종 · lineage 3종' },
  crosswalk: { displayName: 'D0 crosswalk(어휘 연결)', provider: 'D0 규칙 매칭 + U19 사람 검수',
    sourceKind: 'public-real', processing: 'raw', scaleText: '44엣지 · promoted 33 / reviewed 11' },
  // U44: 지표 답변의 '원천'(정의의 반대쪽). anatomy metric:lineage가 좌측에 쓰는 그 원장 —
  // 지표 저장소(metric_store)만 잡히던 self_metric 답변이 자산 1종으로 끝나던 문제 수리.
  reward_ledger: { displayName: '리워드 원장·월명세(D5·D6)', provider: 'D5 명세 × D6 리워드 원장(합성)',
    sourceKind: 'synthetic', processing: 'raw', scaleText: '원장 99,278건',
    anatomyTableId: 'd6_reward_ledger_src' },
  // U44: 국세청 업종코드↔KSIC 공식 매핑(XW/x4 계열의 official_bridge). 지도에 노드가 없는
  // off-map 자산 — 규모는 응답이 주는 값이라 registry에 정적 수치를 만들지 않는다.
  nts_ksic: { displayName: '국세청 업종코드↔KSIC 공식 매핑', provider: '국세청 업종코드 · 통계청 KSIC 11차',
    sourceKind: 'public-real', processing: 'raw' },
  // U44: 내부 거래(D4) — txn_rollup 답변이 crosswalk와 함께 쓰는 그 원천.
  transaction: { displayName: '내부 거래 명세(D4)', provider: 'D4 합성 거래(method demo — 실 고객 아님)',
    sourceKind: 'synthetic', processing: 'raw', scaleText: '125,891건(4개월)',
    anatomyTableId: 'd4_transaction' },
};

// provenance.component → registry 키 (결정론 — 실측 9종 전수)
const COMPONENT_TO_ASSET: Record<string, string> = {
  graph: 'card_graph', rule: 'rule_engine', doc: 'doc_search', metric: 'metric_store',
  market_consumption: 'seoul_market', ontology: 'crosswalk', ontology_map: 'ontology_maps',
  catalog_taxonomy: 'catalog', plan: 'catalog',
};

// U63c: SQL이 실제로 읽은 **Iceberg 테이블** → 자산.
//
// 왜: U50이 시장·인구 축을 SQL로 옮긴 뒤 서버 provenance가 `sql` 한 줄로 접혀 자산이
// 1종으로 세어졌고, 여정·데이터 흐름 탭(자산 ≥2 조건)이 사라졌다. 서버가 이제
// `table:<이름>`으로 실제 접근 테이블을 보내므로(추측 아님 — 템플릿 allowed_tables)
// 그것을 자산으로 되읽는다. 표에 없는 테이블은 무시(없는 자산을 만들지 않는다).
const TABLE_TO_ASSET: Record<string, string> = {
  seoul_living_population: 'living_pop',
  seoul_area_sales: 'seoul_market',
  seoul_trade_area: 'seoul_market',
  market_trend_group: 'market_trend',
  d0_market_crosswalk: 'crosswalk',
  r1_card_category: 'card_graph',
  d4_txn_category_rollup: 'transaction',
  d7_complaints: 'ontology_maps',
  r2_card_conditions: 'rule_engine',
  d0_nts_ksic: 'nts_ksic',
};

/** provenance.component("table:seoul_area_sales" 포함) → 자산 id. 없으면 undefined. */
function componentAsset(component: string): string | undefined {
  if (component.startsWith('table:')) return TABLE_TO_ASSET[component.slice(6)];
  return COMPONENT_TO_ASSET[component];
}

// ── U44: citation 페이로드 → 자산 (provenance 1줄로 압축된 자산들의 복원) ──────
// 왜 필요한가: 서버는 답변 1건의 provenance를 **컴포넌트 단위 1줄**로 접어 보낸다.
// 예) POP 계열의 단일 항목 `market_consumption: "서울 생활인구(공공) × 상권 추정매출(집계)
// — AreaMapping 연결"` 은 자산 **2종 + 다리 1개**를 한 줄에 담고 있다. component만 읽으면
// seoul_market 1종으로 접혀 hasFlow/hasJourney(자산 ≥2)가 영구히 거짓이 됐다(U42가 탭만
// 옮기고 이 조건을 못 본 이유 — 멀티홉만 hop lineage에서 자산 4종을 얻어 여정이 떴다).
// 원칙 유지: 페이로드에 **그 자산의 실제 필드가 있을 때만** 추가한다(추측 조인 금지 —
// 필드 존재 = 그 자산이 조회됐다는 서버측 사실). 없는 자산을 만들지 않는다.
const GRAPH_LABEL_TO_ASSET: Record<string, string> = {
  CARD_Product: 'card_graph', CARD_Benefit: 'card_graph', CARD_BenefitGroup: 'card_graph',
  CARD_AnnualFee: 'card_graph',
  CARD_Condition: 'rule_engine',
  BenefitCategory: 'catalog', CATEGORY: 'catalog',
};

/** citation 페이로드에서 자산 id → 이 답변에서 한 일. 순서 = 표시 순서(원천 → 연결 → 산출). */
function payloadAssets(cit: Record<string, unknown>, annOnto?: unknown): Array<[string, string]> {
  const found: Array<[string, string]> = [];
  const add = (id: string, role: string) => {
    if (!found.some(([f]) => f === id)) found.push([id, role]);
  };

  // graph_paths의 노드 라벨 → 그 라벨을 담은 자산(카드 그래프 / 약관 조건 / 카테고리 체계)
  const paths = (cit.graph_paths ?? []) as Array<{ objects?: Array<{ label?: string }> }>;
  for (const p of paths) {
    for (const o of p.objects ?? []) {
      const id = GRAPH_LABEL_TO_ASSET[o.label ?? ''];
      if (id) add(id, ROLE_BY_ASSET[id] ?? '그래프 조회');
    }
  }

  // market 페이로드 — 어떤 시장 자산이 실제로 조회됐는지는 meta의 필드가 결정한다
  const market = cit.market as {
    meta?: { pop_month?: string; sales_year?: string; year?: string;
             sources?: Record<string, string>; crosswalk_note?: string };
    area_mapping?: string; crosswalk_note?: string;
    official_bridge?: unknown; crosswalk_summary?: unknown; mappings?: unknown;
    approval?: unknown; ksic_industries?: unknown; ecos?: unknown;
  } | undefined;
  if (market) {
    const meta = market.meta ?? {};
    // 생활인구 × 추정매출(AreaMapping) — pop_month가 있으면 생활인구를 실제로 읽은 것
    if (meta.pop_month) {
      add('living_pop', '지역별 생활인구(수요) 조회');
      if (meta.sales_year || market.area_mapping) add('seoul_market', '상권 추정매출(공급) 조회');
    }
    if (meta.year || meta.sales_year) add('seoul_market', '서울 시장 통계 조회');
    // KOSIS·ECOS·여신협회 시계열
    if (meta.sources || market.approval || market.ksic_industries || market.ecos) {
      add('market_trend', '시장 시계열(KOSIS·ECOS·여신협회) 조회');
    }
    // 어휘 다리 — crosswalk 표기가 있을 때만
    if (meta.crosswalk_note || market.crosswalk_note || market.crosswalk_summary || market.mappings) {
      add('crosswalk', '약관어↔통계어 crosswalk 연결');
    }
    if (market.official_bridge) add('nts_ksic', '국세청↔KSIC 공식 매핑 대조');
  }

  // 지표 — 정의(시맨틱 레이어)와 원천(원장)은 서로 다른 자산
  const metrics = (cit.metrics ?? []) as Array<{ source_tables?: string[] }>;
  const metricMeta = cit.metric_meta as { metadata?: { source_tables?: string[]; source_cols?: string[] } } | undefined;
  if (metrics.length || metricMeta) {
    add('metric_store', '지표 정의·값 조회');
    const srcs = [
      ...metrics.flatMap((m) => m.source_tables ?? []),
      ...(metricMeta?.metadata?.source_tables ?? []),
      ...(metricMeta?.metadata?.source_cols ?? []),
    ].join(' ');
    // 지표의 source_tables는 원장뿐 아니라 crosswalk·시장 통계까지 가리킨다(예: 커버리지 지표).
    if (/d5_|d6_/.test(srcs)) add('reward_ledger', '지표의 원천 원장(D5·D6)');
    if (/d0_crosswalk/.test(srcs)) add('crosswalk', '지표가 사용한 crosswalk');
    if (/seoul_sales/.test(srcs)) add('seoul_market', '지표가 사용한 서울 시장 통계');
    if (/d0_category_node/.test(srcs)) add('catalog', '지표가 사용한 카테고리 체계');
  }

  // 약관 판정 — 규칙엔진 + (실약관 조립이면) 카드 그래프
  const rt = cit.rule_trace as { rule_source?: string; source_conditions?: unknown[] } | undefined;
  if (rt) {
    add('rule_engine', '약관 규칙 판정');
    if (String(rt.rule_source ?? '').startsWith('graph:')) add('card_graph', '실약관 조립(그래프)');
  }

  if ((cit.doc_chunks as unknown[] | undefined)?.length) add('doc_search', '약관 원문 검색');
  // 포트폴리오 겹침 = 카드 그래프 × 혜택 카테고리 체계(jaccard의 축이 카테고리)
  const pf = cit.portfolio as { method?: string } | undefined;
  if (pf) {
    add('card_graph', '카드 포트폴리오 비교');
    if (/category/.test(String(pf.method ?? ''))) add('catalog', '겹침 판정의 카테고리 축');
  }

  // annotation.ontology(최상위) — crosswalk/분류 경로는 catalog·crosswalk 자산의 직접 증거.
  // citation.ontology와 별개 위치라 U38 원구현이 놓쳤다(x3 계열이 자산 1종이던 원인).
  const ao = annOnto as { categories?: unknown[]; closure_path?: unknown[]; crosswalk?: unknown[] } | undefined;
  if (ao?.categories?.length || ao?.closure_path?.length) add('catalog', '용어·분류(taxonomy) 조회');
  if (ao?.crosswalk?.length) add('crosswalk', '약관어↔통계어 crosswalk 연결');

  // citation.ontology — 온톨로지 맵(민원·롤업) vs 분류체계(taxonomy)를 필드로 구분
  const onto = cit.ontology as {
    rows?: unknown[]; by_issue?: unknown; anchors?: unknown; cases?: unknown; hits?: unknown;
    case?: unknown; chain?: unknown; categories?: unknown[]; closure_path?: unknown[];
    meta?: { source?: string };
  } | undefined;
  if (onto) {
    if (onto.rows || onto.by_issue || onto.anchors || onto.cases || onto.hits || onto.case || onto.chain) {
      add('ontology_maps', '온톨로지 맵 조회');
    }
    if (onto.categories?.length || onto.closure_path?.length) add('catalog', '용어·분류 조회');
    // 온톨로지 맵 답변의 '×' 상대편 — meta.source가 명시한 조인 상대만 추가(추측 금지).
    // 예) "D7 민원 × D6 원장(근본원인)" / "D4 합성 거래 × D0 crosswalk"
    const src = String(onto.meta?.source ?? '');
    if (/D6|원장/.test(src)) add('reward_ledger', '민원↔거래 연결의 원장측');
    if (/D4|거래/.test(src)) add('transaction', '내부 거래 명세 조회');
    if (/crosswalk/i.test(src)) add('crosswalk', '카테고리 crosswalk 연결');
    if (/약관|조건/.test(src)) add('rule_engine', '약관 조건 대조');
    // complaint_trace의 실제 추적 사슬 — meta.source가 일반문("온톨로지 맵")이어도
    // chain의 각 마디가 어떤 자산을 거쳤는지는 응답 자체가 말한다.
    const ch = onto.chain as { ledger?: unknown; condition_type?: unknown } | undefined;
    if (ch?.ledger) add('reward_ledger', '민원↔거래 추적의 원장 마디');
    if (ch?.condition_type) add('rule_engine', '거절 사유 ↔ 약관 조건유형 대조');
  }

  return found;
}

const ROLE_BY_ASSET: Record<string, string> = {
  card_graph: '카드·혜택 그래프 조회', rule_engine: '약관 조건 조회', catalog: '용어·분류 조회',
};
// chain hop lineage.source_asset(파일명) → registry 키 (chain_walk 9자산 전수)
const CHAIN_ASSET: Record<string, string> = {
  'population_market_index.json': 'living_pop',
  'market_consumption_index.json': 'seoul_market',
  'market_trend_index.json': 'market_trend',
  'txn_category_rollup.json': 'ontology_maps',
  'card_category_signatures.json': 'card_graph',
  'condition_type_index.json': 'rule_engine',
  'exclusion_norm.json': 'rule_engine',
  'complaint_index.json': 'ontology_maps',
  'vocab_sot.json': 'crosswalk',
};

const KIND_FROM_GRADE: Record<string, SourceKind> = {
  '공개-실': 'public-real', '공개-집계': 'aggregate', '집계': 'aggregate',
  '합성': 'synthetic', '합성-근거': 'synthetic', '추정': 'estimated',
};

function entryToEvidence(assetId: string, role: string): DataAssetEvidence {
  const e = ASSET_REGISTRY[assetId];
  if (!e) {
    return { assetId, displayName: assetId, roleInAnswer: role,
      source: { sourceKind: 'unknown' }, unavailable: ['registry'] };
  }
  const unavailable: string[] = [];
  if (!e.asOf) unavailable.push('as_of');
  return {
    assetId, displayName: e.displayName, roleInAnswer: role,
    source: { provider: e.provider, sourceKind: e.sourceKind, processing: e.processing },
    freshness: e.asOf ? { asOf: e.asOf } : undefined,
    scale: e.scaleText ? { displayText: e.scaleText } : undefined,
    unavailable,
  };
}

/** annotation → 이 답변이 사용한 자산 증거 목록(결정론 조립 — 추측 없음). */
export function buildAssetEvidence(ann: PlatformAnnotation | undefined): DataAssetEvidence[] {
  if (!ann?.citation) return [];
  const cit = ann.citation as Record<string, unknown>;
  const out = new Map<string, DataAssetEvidence>();

  // 1) chain 답변: hop lineage가 가장 정밀 — hop 순서 = roleInAnswer
  const chain = cit.chain as ChainResult | null | undefined;
  if (chain?.status === 'ok') {
    for (const [i, h] of (chain.hops ?? []).entries()) {
      for (const f of (h.lineage?.source_asset ?? '').split('+').map((s) => s.trim())) {
        const id = CHAIN_ASSET[f];
        if (!id) continue;
        if (!out.has(id)) {
          const ev = entryToEvidence(id, `hop ${i + 1}: ${h.summary?.slice(0, 40) ?? ''}`);
          const rows = (h.rows ?? []) as Array<Record<string, unknown>>;
          if (rows.length) { ev.sampleRows = rows.slice(0, 3); ev.sampleKind = 'used-in-answer'; }
          out.set(id, ev);
        }
      }
    }
  }

  // 2) provenance component → 자산 (chain으로 이미 잡힌 것은 role 유지)
  const prov = (cit.provenance ?? []) as Array<{ component?: string; source?: string;
    super_term?: string; categories?: string[] }>;
  for (const p of prov) {
    const raw = p.component ?? '';
    const comp = raw.startsWith('table:') ? raw : raw.split(':')[0];  // table:<이름>은 통째로
    if (comp === 'chain') continue;                    // "chain:gap" → 위에서 처리
    const id = componentAsset(comp);
    if (!id || out.has(id)) continue;
    const ev = entryToEvidence(id,
      ROLE_BY_COMPONENT[comp] ?? (raw.startsWith('table:')
        ? `${raw.slice(6)} 테이블 질의(Athena)` : '근거 조회'));
    // provenance.source가 등급 문자열이면 kind 교차검증(불일치 시 registry 우선 — 표기만)
    const kind = KIND_FROM_GRADE[p.source ?? ''];
    if (kind && kind !== ev.source.sourceKind) ev.governance = { note: `응답 표기: ${p.source}` };
    out.set(id, ev);
    // U44: catalog_taxonomy 항목이 super_term/categories를 직접 실어 보내는 경우 —
    // 상위어→하위 카테고리 전개는 taxonomy(subClassOf) 조회의 증거이므로 그 관계도 자산.
    if (comp === 'catalog_taxonomy' && p.super_term && (p.categories?.length ?? 0) > 0
        && !out.has('crosswalk')) {
      out.set('crosswalk', entryToEvidence('crosswalk',
        `'${p.super_term}' 하위 ${p.categories!.length}개 카테고리 전개(subClassOf)`));
    }
  }

  // 2.5) U44: citation 페이로드에서 provenance가 접어버린 자산 복원(위 두 단계에 없는 것만).
  // provenance/chain이 더 신뢰도 높은 소스이므로 이미 잡힌 자산의 roleInAnswer는 덮지 않는다.
  for (const [id, role] of payloadAssets(cit, ann.ontology)) {
    if (!out.has(id)) out.set(id, entryToEvidence(id, role));
  }

  // 3) 사용 행: market.rows / metrics.data — 실제 응답 데이터만 used-in-answer
  const market = cit.market as { rows?: Array<Record<string, unknown>> } | undefined;
  if (market?.rows?.length && out.has('seoul_market')) {
    const ev = out.get('seoul_market')!;
    if (!ev.sampleRows) { ev.sampleRows = market.rows.slice(0, 3); ev.sampleKind = 'used-in-answer'; }
  }
  const metrics = cit.metrics as Array<{ data?: Array<Record<string, unknown>> }> | undefined;
  if (metrics?.length && out.has('metric_store')) {
    const rows = metrics.flatMap((m) => m.data ?? []).slice(0, 3);
    const ev = out.get('metric_store')!;
    if (rows.length && !ev.sampleRows) { ev.sampleRows = rows; ev.sampleKind = 'used-in-answer'; }
  }

  return [...out.values()];
}

const ROLE_BY_COMPONENT: Record<string, string> = {
  graph: '카드·혜택·조건 그래프 조회', rule: '약관 규칙 판정/시뮬', doc: '약관 원문 검색',
  metric: '지표 값 조회', market_consumption: '서울 시장 통계 조회',
  ontology: 'crosswalk 연결', ontology_map: '온톨로지 맵 조회', catalog_taxonomy: '용어·분류 조회',
  plan: '계획 수립',
};
