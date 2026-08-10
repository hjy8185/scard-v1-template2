// U17-A §3 — "다음은?" 결정론 맵. LLM 무관(환각 차단), intent(+market action) → 후속 질문 제안.
// carry: 현재 답의 엔티티(업종/카테고리/연령)를 annotation에서 추출해 질문 템플릿에 치환.
// 값을 못 채우면 그 제안은 생략(지어내기 금지).

import type { PlatformAnnotation } from './types';
import { executedActions } from './annotation-utils';

export interface NextSuggestion { label: string; query: string }

type Cit = {
  // U12/U19: ontology_query 결과(citation.ontology dict — action/hits/cases)
  ontology?: { action?: string; hits?: Array<Record<string, unknown>> };
  market?: {
    action?: string;
    rows?: Array<Record<string, unknown>>;
    redirect_hint?: { options?: Array<{ label?: string; query?: string }> };
  };
  metrics?: Array<{ metric_name?: string; data?: Array<{ dimensions: Record<string, unknown>; value: unknown }> }>;
};

// 답변에서 carry 엔티티 추출(전부 annotation 실데이터)
function carryFrom(ann: PlatformAnnotation) {
  const cit = ann.citation as Cit | undefined;
  const rows = cit?.market?.rows ?? [];
  const top = rows[0] as Record<string, unknown> | undefined;
  const topIndustry = (top?.industry as string) ?? undefined;
  const topCategory = (top?.category as string) ?? undefined;
  const topAge = (top?.age_band as string) ?? (top?.top_age_band as string) ?? undefined;
  // understood_tokens에서 카테고리(질문에 있던 것)
  const tokCategory = ann.route_plan?.understood_tokens?.find((t) => t.label === '카테고리')?.value;
  // self_metric 세그먼트 최저값 축
  let worstSegment: string | undefined;
  const seg = cit?.metrics?.find((m) => m.data?.length);
  if (seg?.data) {
    const sorted = [...seg.data].filter((d) => typeof d.value === 'number')
      .sort((a, b) => (a.value as number) - (b.value as number));
    worstSegment = sorted[0] ? String(Object.values(sorted[0].dimensions)[0] ?? '') : undefined;
  }
  return { topIndustry, topCategory, topAge, tokCategory, worstSegment };
}

export function buildNextSuggestions(ann: PlatformAnnotation | undefined): NextSuggestion[] {
  if (!ann?.route_plan) return [];
  const intent = ann.route_plan.intent;
  const cit = ann.citation as Cit | undefined;
  const action = cit?.market?.action;
  const c = carryFrom(ann);
  const out: NextSuggestion[] = [];
  const add = (label: string, query: string | undefined) => {
    if (query && out.length < 3 && !out.some((s) => s.query === query)) out.push({ label, query });
  };

  // abstain: redirect_hint 버튼화 — 막힌 곳에서 길 ★
  if (ann.unsupported || intent === 'unsupported') {
    const opts = cit?.market?.redirect_hint?.options ?? [];
    for (const o of opts) add(o.label ?? o.query ?? '', o.query);
    if (!out.length) {
      add('연령대별로 보기', '서울에서 연령대별 소비 규모 알려줘');
      add('성별로 보기', '서울에서 성별 소비 규모는?');
    }
    return out;
  }

  if (intent === 'market_consumption' || intent === 'coverage_gap' || intent === 'targeting') {
    switch (action) {
      case 'by_industry':
        add(`'${c.topIndustry}' 혜택 카드 찾기`, c.topIndustry && `${c.topIndustry} 혜택 주는 우리 카드는 뭐가 있어?`);
        add('누가 많이 쓰는지 보기', c.topIndustry && `${c.topIndustry}은 주로 몇 대가 많이 소비해?`);
        add('우리 혜택 기준으로 보기', '우리 혜택 카테고리 기준으로 서울 시장 나눠줘');
        break;
      case 'by_category':
        add('이 카테고리 혜택 카드', c.topCategory && `${c.topCategory} 혜택 주는 우리 카드는 뭐가 있어?`);
        add('소비 몰리는 시간대', '서울 소비가 몰리는 시간대는 언제야?');
        add('우리 고객 혜택률과 대조', '우리 고객은 연령대별 실질 혜택률이 어때?');
        break;
      case 'industry_age':
        add(`우리 ${c.topAge ?? ''}대 혜택률 확인`, c.topAge && `우리 ${c.topAge}대 고객 실질 혜택률은 어때?`);
        add('이 업종 혜택 카드', (c.tokCategory ?? c.topIndustry) && `${c.tokCategory ?? c.topIndustry} 혜택 주는 카드는?`);
        add('언제 제일 붐비는지', '서울 소비가 몰리는 시간대는 언제야?');
        break;
      case 'by_time': case 'by_weekday':
        add('그 시간대 밀 카드', c.tokCategory ? `${c.tokCategory} 혜택 주는 우리 카드는?` : '음식점 혜택 주는 우리 카드는?');
        add('우리 고객 연령 혜택률', '우리 고객은 연령대별 실질 혜택률이 어때?');
        break;
      case 'by_age':
        add('우리 혜택률과 대조', '우리 고객은 연령대별 실질 혜택률이 어때?');
        add('업종별로 보기', '서울에서 소비 큰 업종이 뭐야?');
        break;
      default:
        add('업종별 시장 보기', '서울에서 소비 큰 업종이 뭐야?');
    }
    return out;
  }

  switch (intent) {
    case 'self_metric':
      add('이 숫자의 계산 근거', '그 실질 혜택률 숫자는 어떻게 계산된 거야?');
      add('한도 조정 시뮬레이션', c.worstSegment ? `음식점 한도 줄이면 비용 얼마나 절감돼?` : undefined);
      add('시장에선 누가 쓰나', '서울에서 연령대별 소비 규모 알려줘');
      break;
    case 'eligibility':
      add('이 카드 혜택 전부', '이 카드 혜택 뭐뭐 있는지 다 알려주세요');
      add('한도 바꾸면?', '음식점 한도 줄이면 비용 얼마나 절감돼?');
      add('비슷한 혜택 카드', '혜택 구조 비슷한 카드끼리 묶어줘');
      break;
    case 'what_if':
      add('카니발 점검', '혜택 구조 비슷한 카드끼리 묶어줘');
      add('그 계산 근거', '그 실질 혜택률 숫자는 어떻게 계산된 거야?');
      break;
    case 'portfolio_overlap':
      add('연회비 대비 약한 카드', '연회비 비싼데 혜택은 별로인 카드 골라줘');
      break;
    case 'card_benefit_all': case 'card_benefit_specific':
      add('이 혜택의 시장 규모', c.tokCategory ? `우리 ${c.tokCategory} 혜택이 노리는 서울 시장 얼마나 커?` : '우리 음식점 혜택이 노리는 서울 외식 시장 얼마나 커?');
      add('실적 조건 확인', '이 카드 실적 조건은 어떻게 돼?');
      break;
    case 'merchant_reverse':
      add('비슷한 카테고리 혜택', c.tokCategory ? `${c.tokCategory} 혜택 주는 카드 뭐 있어?` : undefined);
      break;
    case 'ontology_map': {
      // U19 R1: 검색 결과의 추적가능 민원 → 원인 추적 버튼(막힌 곳에서 길 — 여정 연결)
      // U22 A1: executedActions(template_ids 합집합)로 판별 — 도달 불가 수리
      const acts = executedActions(ann);
      const om = (ann.citation as Cit | undefined)?.ontology;
      if (acts.has('complaint_search')) {
        const hits = (om?.hits ?? []) as Array<Record<string, unknown>>;
        const traceable = hits.find((h) => h.related_txn_id);
        if (traceable?.complaint_id) {
          add('이 민원 원인 추적', `민원 ${traceable.complaint_id} 원인이 뭐야?`);
        }
        add('민원 근본원인 분포', '혜택 미적용 민원이 왜 많아?');
      } else if (acts.has('complaint_trace')) {
        add('이 조건유형의 약관', '전월실적 조건 있는 카드가 얼마나 돼?');
        add('비슷한 민원 더 보기', '혜택 미적용 관련 민원 찾아줘');
      }
      break;
    }
  }
  return out;
}
