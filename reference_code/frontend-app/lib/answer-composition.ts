// U17-A §1·§2 — 답변 합성 규칙 단일 소스.
// 3층 구조(본문/경로 한 줄/서랍)의 "경로 한 줄" 생성 + intent×차트 선정 + 내부 용어 번역.
// 원칙: 값은 annotation에서만(지어내기 금지) — 만들 수 없으면 null(경로 한 줄 생략 degrade).

import type { PlatformAnnotation, InsightCard, UnderstoodToken } from './types';
import { executedActions } from './annotation-utils';

// ── 내부 용어 → 관객 언어 번역표 (§1 D1d) ──
const VALUE_KO: Record<string, string> = {
  eligibility_check: '자격 확인', lookup: '조회', comparison: '비교',
  simulation: '시뮬레이션', coverage: '커버리지', gap: '갭', negative: '해당 없음 확인',
  tier1_rule: '규칙 매칭', tier2_semantic: '의미 검색', tier3_llm: 'AI 판단',
  context_card_id: '기준 카드', merchant: '가맹점', category: '카테고리', age_band: '연령대',
  field: '조정 항목', metric_name: '지표',
};
export function translateToken(t: UnderstoodToken): UnderstoodToken {
  // U22 A5: missing_slots는 내부 경로("target_scope.context_card_id")로 옴 —
  // 전체 경로 미스면 마지막 토큰(suffix)으로 번역해 내부 슬롯 경로 노출 수리.
  let value = VALUE_KO[t.value] ?? t.value;
  if (value === t.value && t.value.includes('.')) {
    const last = t.value.split('.').pop() ?? t.value;
    value = VALUE_KO[last] ?? last;
  }
  if (value.startsWith('CARD_Product:')) value = '선택한 카드';
  return { label: t.label === '미결정' ? '미결정' : t.label, value };
}

export interface PathLine {
  verified: boolean;          // approved template 실행 여부(✓ vs ◌ AI 생성)
  text: string;               // 연결 요약 1문장 (annotation 값으로만 조립)
  bridgeId?: string;          // 클릭 시 지도 citeFocus 대상 다리
  nodeIds?: string[];
}

type Cit = {
  market?: { action?: string; rows?: unknown[]; meta?: { crosswalk_covered_pct?: number } };
  metrics?: Array<{ metric_name?: string; definition?: string; definition_version?: string }>;
  graph_paths?: unknown[];
  ontology?: { closure_path?: string[]; crosswalk?: Array<{ from_label?: string; to_label?: string }> };
};

function mergedOntology(ann: PlatformAnnotation) {
  const top = ann.ontology ?? undefined;
  const inner = (ann.citation as Cit | undefined)?.ontology;
  return {
    closure: top?.closure_path?.length ? top.closure_path : inner?.closure_path ?? [],
    crosswalk: (top?.crosswalk?.length ? top.crosswalk : inner?.crosswalk ?? []) as Array<{ from_label?: string; to_label?: string }>,
  };
}

// ── §2 intent×경로 한 줄 매트릭스 ──
export function buildPathLine(ann: PlatformAnnotation | undefined): PathLine | null {
  if (!ann?.route_plan) return null;
  const intent = ann.route_plan.intent;
  const verified = (ann.route_plan.template_ids?.filter(Boolean).length ?? 0) > 0;
  const cit = ann.citation as Cit | undefined;
  const { closure, crosswalk } = mergedOntology(ann);
  const pct = cit?.market?.meta?.crosswalk_covered_pct;

  // abstain/unsupported — "막힌 곳에서 길" (문구는 NextSuggestions가 이어받음)
  if (ann.unsupported || intent === 'unsupported') {
    return { verified, text: '이 연결은 아직 없어요 — 대신 갈 수 있는 길:', bridgeId: undefined };
  }

  // U40(P1-1): chain 경로줄을 자기 서술("N-hop 연결")에서 동작 affordance로.
  // 플랫폼 서사는 우측 여정·ChainView 캡션이 담당.
  const chain = ann.citation?.chain;
  if (chain?.status === 'ok' && chain.hops?.length) {
    return {
      verified,
      text: `근거 ${chain.n_hops}단계 보기`,
      bridgeId: 'crosswalk',
    };
  }

  switch (intent) {
    case 'eligibility': {
      if (closure.length >= 2) {
        return {
          verified,
          text: `'${closure[0]}' ⊑ '${closure[closure.length - 1]}' — 온톨로지 분류 체계로 직접 판정했어요`,
          bridgeId: 'subsumption',
        };
      }
      return { verified, text: '약관 조건·실적 구간을 규칙엔진으로 판정했어요', bridgeId: 'rule_engine' };
    }
    case 'market_consumption': case 'coverage_gap': case 'targeting': {
      // U27: 생활인구×소비 — 두 공공 자산의 AreaMapping 연결이 이 답변의 경로
      const mkAction = cit?.market?.action;
      if (mkAction === 'pop_vs_sales' || mkAction === 'penetration' || mkAction === 'pop_by_age') {
        return {
          verified,
          text: "생활인구 '행정동' ↔ 추정매출 '상권' — 코드 체계가 달라 AreaMapping으로 연결해 대조했어요",
          bridgeId: 'area_mapping',
        };
      }
      // U28: 시장 시계열 — KOSIS 상품군을 curated 매핑으로 우리 혜택 카테고리에 연결
      if (mkAction === 'trend') {
        return {
          verified,
          text: "통계청 '상품군' ↔ 우리 '혜택 카테고리' — 체계가 달라 curated 매핑(20/25)으로 연결했어요",
          bridgeId: 'kosis_crosswalk',
        };
      }
      if (mkAction === 'market_total') {
        return {
          verified,
          text: '시장 총량[공개-실: 여신협회·한국은행] ↔ 우리 694장 전수 — 전수 비교 불가의 이유까지 데이터 계보로 설명해요',
          nodeIds: ['market_trend', 'card_product'],
        };
      }
      if (crosswalk.length > 0) {
        const from = [...new Set(crosswalk.map((c) => c.from_label).filter(Boolean))].slice(0, 1);
        const tos = [...new Set(crosswalk.map((c) => c.to_label).filter(Boolean))].slice(0, 5);
        return {
          verified,
          text: `약관어 '${from[0]}' ↔ 통계어 '${tos.join('·')}' — crosswalk로 연결해 계산했어요${pct ? ` (서울 매출 ${pct}% 커버)` : ''}`,
          bridgeId: 'crosswalk',
        };
      }
      if (cit?.market?.rows?.length) {
        return { verified, text: '서울 공공 집계(상권분석 추정매출)에서 직접 조회했어요', nodeIds: ['seoul_sales'] };
      }
      return null;
    }
    case 'self_metric': {
      const m = cit?.metrics?.find((x) => x.definition);
      if (m) {
        return {
          verified,
          text: `📐 ${m.metric_name ?? '지표'} = ${m.definition}${m.definition_version ? ` (시맨틱 레이어 v${m.definition_version.split(':')[0]})` : ''}`,
          bridgeId: 'semantic_metric',
        };
      }
      return null;
    }
    case 'what_if':
      return { verified, text: '자격판정과 동일한 규칙엔진으로 재계산했어요 [합성 데이터]', bridgeId: 'rule_engine' };
    case 'portfolio_overlap':
      return { verified, text: '카드 이름이 아니라 혜택 구조(카테고리·한도·조건)로 유사도를 판정했어요', bridgeId: 'subsumption' };
    case 'category_search': {
      if (closure.length >= 2) {
        return {
          verified,
          text: `'${closure[closure.length - 1]}'를 온톨로지 계층에서 ${closure.slice(0, -1).join('·')}(으)로 확장해 조회했어요`,
          bridgeId: 'subsumption',
        };
      }
      return { verified, text: '카테고리 체계에서 해당 혜택 카드를 조회했어요', nodeIds: ['category_node'] };
    }
    case 'merchant_reverse':
      return { verified, text: '가맹점 → 카테고리 → 카드 순으로 온톨로지를 역추적했어요', bridgeId: 'crosswalk' };
    case 'ontology_map': {
      // U19 R1: complaint action별 구분 — U22 A1: executedActions(template_ids 합집합)로 판별
      const acts = executedActions(ann);
      if (acts.has('complaint_trace')) {
        return { verified, text: '민원 텍스트(비정형)를 원장 거래→약관 조건으로 3단 추적했어요', nodeIds: ['complaint', 'reward_ledger'] };
      }
      if (acts.has('complaint_search')) {
        return { verified, text: '민원 503건(비정형 VOC)에서 검색했어요 — 🔗 표시는 원인 추적 가능', nodeIds: ['complaint'] };
      }
      return { verified, text: '민원·거래 데이터를 온톨로지 맵으로 묶어 조회했어요', bridgeId: 'crosswalk' };
    }
    case 'card_benefit_all': case 'card_benefit_specific': case 'card_fee': case 'card_comparison': {
      const n = cit?.graph_paths?.length ?? ann.subgraph?.nodes?.length ?? 0;
      return n > 0
        ? { verified, text: `카드 지식그래프에서 ${n}개 근거를 조회했어요`, nodeIds: ['card_product', 'benefit'] }
        : null;
    }
    default:
      return null;   // 매트릭스 밖 → 경로 한 줄 생략(degrade)
  }
}

// ── §2a 기본 노출 차트 1개 선정(compare > heatmap > bar > sunburst) ──
const KIND_PRIORITY: InsightCard['kind'][] = ['compare', 'heatmap', 'bar', 'sunburst'];
export function splitInsights(insights: InsightCard[] | undefined | null): { primary: InsightCard | null; rest: InsightCard[] } {
  if (!insights?.length) return { primary: null, rest: [] };
  const sorted = [...insights].sort((a, b) => KIND_PRIORITY.indexOf(a.kind) - KIND_PRIORITY.indexOf(b.kind));
  return { primary: sorted[0], rest: sorted.slice(1) };
}
