// U39 — Map Journey 계약·어댑터 (계획 v2 §4, 리뷰 §7 채택).
//
// 핵심 원칙: 여정 레일은 hop의 의미·순서를 정확히 보존(병합·생략 금지 — 불변식),
// 지도는 자산 문맥(앵커 강조), 화살표는 (chain_id, hop_id)별 검수된 verifiedLink만.
// 일반 답변은 관계를 만들어내지 않는다(폴백 4단계).

import type { PlatformAnnotation, ChainResult } from './types';
import { hopHeadline, edgeShort, edgeSubtitle, normalizeGrade } from './chain-presentation';
import { buildAssetEvidence } from './asset-evidence';

export type MapStatus = 'mapped' | 'partial' | 'unmapped';

export interface JourneyHop {
  hopId: string;
  order: number;                     // 1-based — 레일 표시 순서(= chain hop 순서)
  traversal: { from: string; edgeType: string; to: string; joinKey: string; cardinality: string };
  presentation: { headline?: string; detail?: string; summary: string;
    edgeLabel: string; edgeSubtitle?: string };
  evidence: { sourceAssets: string[]; assetNodeIds: string[]; offMapAssets: string[]; grade: string };
  map: { status: MapStatus;
         verifiedLink?: { sourceNodeId: string; targetNodeId: string; label: string } };
  anatomyAvailable: boolean;
}

export interface MapJourney {
  id: string;
  chainId?: string;
  kind: 'chain' | 'asset-usage';     // verified-path는 후속(현 데이터에 명시 lineage edge 없음)
  hops: JourneyHop[];
  conclusion?: ChainResult['conclusion'];
  caveats?: string[];
  expectedHopCount?: number;
  /** U46: 이 답변이 실제로 쓴 온톨로지 연결 근거(asset-usage 배너의 정직한 설명용).
   *  없는 것은 '온톨로지 연결'이 아니라 **지도에 그릴 검수된 화살표**(JOURNEY_VISUALS
   *  registry는 chain 5종만 채워져 있음)라는 사실을 문구가 구분하게 하기 위한 필드. */
  ontologyLinks?: { crosswalkPairs: number; closurePath: string[]; note?: string;
    /** 지표 답변의 계보(원장 → 정의된 집계 → 지표) — crosswalk는 없지만 연결은 있다. */
    metricLineage?: string[] };
}

// ── JOURNEY_VISUALS — (chain_id, hop_id) 검수 시각 매핑 registry (20엔트리) ──
// assetNodeIds: 이 hop이 사용한 지도 노드(asset-map.ts ASSET_NODES id — 13노드).
// verifiedLink: 지도에 화살표를 그려도 되는 검증된 자산 관계만(억지 직선화 금지 —
//   complaint_structure처럼 같은 자산 3연산인 체인은 링크 없이 앵커+순서 배지).
// offMapAssets: 지도 노드가 없는 자산(vocab SOT·exclusion_norm) — 레일에 텍스트 표기.
// anatomy: buildHopAnatomy 가용 여부(MVP 가용표 — 계획 §4).
interface VisualEntry {
  assetNodeIds: string[];
  offMapAssets?: string[];
  verifiedLink?: { sourceNodeId: string; targetNodeId: string; label: string };
  anatomy?: boolean;
}

export const JOURNEY_VISUALS: Record<string, Record<string, VisualEntry>> = {
  area_gap: {
    gap: { assetNodeIds: ['living_pop', 'seoul_sales'],
           verifiedLink: { sourceNodeId: 'living_pop', targetNodeId: 'seoul_sales',
                           label: 'AreaMapping — 지역 기준을 맞춘 연결' }, anatomy: true },
    industries: { assetNodeIds: ['seoul_sales'] },
    crosswalk: { assetNodeIds: ['seoul_sales', 'category_node'], offMapAssets: ['vocab SOT'],
                 verifiedLink: { sourceNodeId: 'seoul_sales', targetNodeId: 'category_node',
                                 label: 'crosswalk — 분류를 맞춘 연결' }, anatomy: true },
    coverage: { assetNodeIds: ['category_node', 'card_product'],
                verifiedLink: { sourceNodeId: 'category_node', targetNodeId: 'card_product',
                                label: 'HAS_CATEGORY' } },
  },
  trend_exclusion: {
    trend: { assetNodeIds: ['market_trend', 'category_node'],
             verifiedLink: { sourceNodeId: 'market_trend', targetNodeId: 'category_node',
                             label: 'curated 매핑 (20/25)' }, anatomy: true },
    market: { assetNodeIds: ['category_node', 'seoul_sales'],
              verifiedLink: { sourceNodeId: 'category_node', targetNodeId: 'seoul_sales',
                              label: 'crosswalk — 분류를 맞춘 연결' }, anatomy: true },
    cards: { assetNodeIds: ['card_product'] },
    exclusion: { assetNodeIds: ['card_product', 'benefit_condition'], offMapAssets: ['exclusion_norm'],
                 verifiedLink: { sourceNodeId: 'card_product', targetNodeId: 'benefit_condition',
                                 label: 'HAS_EXCLUSION' } },
  },
  complaint_structure: {
    // 앵커 2개(민원·약관) — 레일이 4단계를 맡고 지도는 링크 없이 앵커+순서 배지(리뷰 §8)
    complaint: { assetNodeIds: ['complaint'] },
    condition_type: { assetNodeIds: ['complaint', 'benefit_condition'],
                      verifiedLink: { sourceNodeId: 'complaint', targetNodeId: 'benefit_condition',
                                      label: 'denial→condition 연결' }, anatomy: true },
    structure: { assetNodeIds: ['benefit_condition'] },
    candidates: { assetNodeIds: ['benefit_condition', 'card_product'] },
  },
  internal_coverage: {
    internal: { assetNodeIds: ['transaction'] },
    market: { assetNodeIds: ['transaction', 'seoul_sales'],
              verifiedLink: { sourceNodeId: 'transaction', targetNodeId: 'seoul_sales',
                              label: 'crosswalk 교차검증' }, anatomy: true },
    coverage: { assetNodeIds: ['card_product'] },
    conditions: { assetNodeIds: ['card_product', 'benefit_condition'],
                  verifiedLink: { sourceNodeId: 'card_product', targetNodeId: 'benefit_condition',
                                  label: 'card_conditions' } },
  },
  count_limit_structure: {
    complaint: { assetNodeIds: ['complaint'] },
    condition_type: { assetNodeIds: ['complaint', 'benefit_condition'],
                      verifiedLink: { sourceNodeId: 'complaint', targetNodeId: 'benefit_condition',
                                      label: 'denial→condition 연결' }, anatomy: true },
    pattern: { assetNodeIds: ['transaction'] },
    structure: { assetNodeIds: ['benefit_condition'] },   // 재방문 — 순서 배지로 표현
  },
};

/** annotation → MapJourney. 불변식: kind==='chain' → hops.length === n_hops. */
export function buildJourney(ann: PlatformAnnotation | undefined): MapJourney | null {
  const chain = (ann?.citation as { chain?: ChainResult | null } | undefined)?.chain;

  if (chain?.status === 'ok' && chain.hops?.length) {
    const visuals = JOURNEY_VISUALS[chain.chain_id] ?? {};
    const hops: JourneyHop[] = chain.hops.map((h, i) => {
      const v = visuals[h.id];   // 없으면 unmapped — 생략 금지(P0-3)
      const { headline, detail } = hopHeadline(h);
      const sourceAssets = (h.lineage?.source_asset ?? '').split('+').map((s) => s.trim()).filter(Boolean);
      return {
        hopId: h.id, order: i + 1,
        traversal: { from: h.from_entity, edgeType: h.edge_type, to: h.to_entity,
                     joinKey: h.join_key, cardinality: h.cardinality },
        presentation: { headline, detail, summary: h.summary,
                        edgeLabel: edgeShort(h.edge_type), edgeSubtitle: edgeSubtitle(h.edge_type) },
        evidence: { sourceAssets, assetNodeIds: v?.assetNodeIds ?? [],
                    offMapAssets: v?.offMapAssets ?? [], grade: normalizeGrade(h.grade) },
        map: { status: v ? (v.offMapAssets?.length ? 'partial' : 'mapped') : 'unmapped',
               verifiedLink: v?.verifiedLink },
        anatomyAvailable: !!v?.anatomy,
      };
    });
    return { id: `chain:${chain.chain_id}`, chainId: chain.chain_id, kind: 'chain',
             hops, conclusion: chain.conclusion, caveats: chain.caveats,
             expectedHopCount: chain.n_hops };
  }

  // 폴백: 사용 자산이 있으면 asset-usage(화살표 없음 — P0-4).
  //
  // U63c: 임계값을 2 → 1로 내린다. 사용자 지정("모든 질문에 여정탭이 나왔으면 해").
  // 자산 1종이라도 "이 답변이 무엇을 읽었는가"는 보여줄 가치가 있고, 근거가 아예 없는
  // 답변(기권·안내)만 여정이 없어야 한다. 자산 0종이면 여전히 null(없는 것을 그리지 않음).
  const evs = buildAssetEvidence(ann);
  if (evs.length >= 1) {
    const hops: JourneyHop[] = evs.map((e, i) => ({
      hopId: e.assetId, order: i + 1,
      traversal: { from: '', edgeType: '', to: e.displayName, joinKey: '', cardinality: '' },
      presentation: { headline: e.scale?.displayText?.split(' · ')[0],
                      detail: e.roleInAnswer, summary: e.roleInAnswer, edgeLabel: '' },
      evidence: { sourceAssets: [e.assetId], assetNodeIds: ASSET_TO_NODE[e.assetId] ? [ASSET_TO_NODE[e.assetId]] : [],
                  offMapAssets: [], grade: KIND_GRADE[e.source.sourceKind] ?? '미확인' },
      map: { status: ASSET_TO_NODE[e.assetId] ? 'mapped' : 'unmapped' },   // verifiedLink 없음
      anatomyAvailable: false,
    }));
    return { id: 'assets', kind: 'asset-usage', hops,
             ontologyLinks: ontologyLinksOf(ann) };
  }
  return null;
}

/** U46: annotation에서 이 답변이 실제 사용한 온톨로지 연결 근거를 읽는다(추측 금지 —
 *  crosswalk 쌍/subsumption closure/서버 crosswalk 표기가 있을 때만). */
function ontologyLinksOf(ann: PlatformAnnotation | undefined): MapJourney['ontologyLinks'] {
  const cit = (ann?.citation ?? {}) as {
    ontology?: { closure_path?: string[] };
    market?: { crosswalk_note?: string; area_mapping?: unknown;
               meta?: { crosswalk_note?: string; join_rule?: string } };
    metrics?: Array<{ source_tables?: string[] }>;
  };
  const top = (ann?.ontology ?? {}) as { crosswalk?: unknown[] };
  const mkt = cit.market ?? {};
  const meta = mkt.meta ?? {};
  // 서버가 연결을 표기하는 형태는 하나가 아니다(실측): crosswalk_note 외에
  // pop 계열은 area_mapping + meta.join_rule("… TRDAR_CD_N↔ADSTRD_CD (AreaMapping) …")로 온다.
  // join_rule은 길어 그대로 노출하면 배너가 넘치므로 연결 이름만 뽑는다.
  let note = meta.crosswalk_note ?? mkt.crosswalk_note;
  if (!note && (mkt.area_mapping || /AreaMapping/.test(meta.join_rule ?? ''))) {
    note = 'AreaMapping — 상권↔행정동 코드 체계를 맞춘 연결';
  }
  // 지표 답변: crosswalk는 없지만 원장→지표 계보가 실제 연결이다(anatomy metric:lineage와 동일 근거).
  const lineage = [...new Set((cit.metrics ?? []).flatMap((m) => m.source_tables ?? [])
    .map((t) => String(t).split('.')[0]))];
  return {
    crosswalkPairs: (top.crosswalk ?? []).length,
    closurePath: cit.ontology?.closure_path ?? [],
    note,
    metricLineage: lineage.length ? lineage : undefined,
  };
}

// DataAssetEvidence assetId → 지도 노드 id(13노드)
const ASSET_TO_NODE: Record<string, string> = {
  card_graph: 'card_product', rule_engine: 'benefit_condition', doc_search: 'benefit_condition',
  metric_store: 'reward_ledger', seoul_market: 'seoul_sales', living_pop: 'living_pop',
  market_trend: 'market_trend', ontology_maps: 'complaint', catalog: 'category_node',
  crosswalk: 'category_node',
};
const KIND_GRADE: Record<string, string> = {
  'public-real': '공개-실', aggregate: '집계', synthetic: '합성', estimated: '추정',
};

/** 여정 검증(개발·테스트 게이트): 불변식 위반 시 사유 목록 반환. */
export function validateJourney(j: MapJourney, chain?: ChainResult | null): string[] {
  const errs: string[] = [];
  if (j.kind === 'chain' && chain) {
    if (j.hops.length !== chain.n_hops) errs.push(`hops ${j.hops.length} !== n_hops ${chain.n_hops}`);
    const ids = new Set(j.hops.map((h) => h.hopId));
    if (ids.size !== chain.n_hops) errs.push('hopId 중복/누락');
  }
  if (j.kind === 'asset-usage') {
    for (const h of j.hops) if (h.map.verifiedLink) errs.push(`asset-usage에 화살표: ${h.hopId}`);
  }
  return errs;
}
