// U39 Stage 0 — chain 표현 공용 helper: DataFlowView·Map Journey·tests가 같은 값 사용.
// (리뷰 §7: private 함수 추출 — hopHeadline/edgeShort/grade 정규화)

import type { ChainHop } from './types';

/** hop key_values에서 데모 가치 최대 수치 1개 결정론 추출(12패턴). */
export function hopHeadline(h: ChainHop): { headline?: string; detail?: string } {
  const kv = (h.key_values ?? {}) as Record<string, unknown>;
  if (kv.gap != null) return { headline: `gap ${kv.gap}`, detail: `인구 ${kv.pop_rank}위 vs 매출 ${kv.sales_rank}위` };
  if (Array.isArray(kv.top_industries) && kv.top_industries.length) {
    const t = kv.top_industries[0] as { industry?: string; krw?: number };
    return { headline: `${t.industry}`, detail: `${((t.krw ?? 0) / 1e8).toFixed(0)}억 외 ${kv.top_industries.length - 1}업종` };
  }
  if (kv.yoy_pct != null) return { headline: `${Number(kv.yoy_pct) > 0 ? '+' : ''}${kv.yoy_pct}%`, detail: `${kv.group ?? ''} YoY` };
  if (kv.n_cards != null) return { headline: `${kv.n_cards}장`, detail: '커버 카드' };
  if (kv.coexist != null) return { headline: `${kv.coexist}장 (${kv.pct}%)`, detail: '제외 문구 공존' };
  if (kv.count != null) return { headline: `${kv.count}건`, detail: '전사 분포' };
  if (kv.n_clauses != null) return { headline: `${Number(kv.n_clauses).toLocaleString()}건`, detail: '약관 조항' };
  if (kv.tristate) {
    const tri = kv.tristate as { detected?: number; observed?: number; not_detected?: number };
    return { headline: `${tri.detected}/${tri.observed}`, detail: `검출/관측 · 미검출 ${tri.not_detected}` };
  }
  if (kv.avg_txn_krw != null) return { headline: `${Number(kv.avg_txn_krw).toLocaleString()}원`, detail: '객단가' };
  if (kv.seoul_krw != null) return { headline: `${(Number(kv.seoul_krw) / 1e12).toFixed(2)}조`, detail: '서울 시장' };
  if (kv.category != null) return { headline: String(kv.category), detail: kv.krw ? `내부 ${(Number(kv.krw) / 1e8).toFixed(1)}억` : undefined };
  if (Array.isArray(kv.coverage) && kv.coverage.length) {
    const covered = (kv.coverage as Array<{ category?: string; cards?: number }>).filter((c) => c.category);
    return { headline: `${covered.length}개 카테고리`, detail: covered.slice(0, 2).map((c) => `${c.category} ${c.cards}장`).join(' · ') };
  }
  if (Array.isArray(kv.mapped)) {
    const n = (kv.mapped as Array<{ category?: string | null }>).filter((m) => m.category).length;
    return { headline: `${n}개 매핑`, detail: 'crosswalk 연결' };
  }
  return {};
}

/** 연결 라벨 축약(화살표 위 1줄) + 한글 부제. */
export function edgeShort(edge: string): string {
  if (edge.includes('AreaMapping')) return 'AreaMapping (실조인 25/25)';
  if (edge.includes('vocab')) return 'D0 crosswalk + vocab SOT';
  if (edge.includes('curated')) return 'curated crosswalk (20/25)';
  if (edge.includes('crosswalk')) return 'D0 crosswalk';
  if (edge.includes('HAS_CATEGORY')) return 'HAS_CATEGORY';
  if (edge.includes('HAS_EXCLUSION')) return 'HAS_EXCLUSION';
  if (edge.includes('denial_to')) return 'denial→condition 연결';
  if (edge.includes('gap_ranking')) return 'gap_ranking (U27)';
  if (edge.includes('root_cause')) return 'root_cause 링크';
  if (edge.includes('txn_rollup')) return 'txn_rollup 집계';
  if (edge.includes('card_conditions')) return 'card_conditions';
  if (edge.includes('not_detected')) return 'not_detected 필터';
  return edge.length > 28 ? edge.slice(0, 26) + '…' : edge;
}

/** 연결 한글 부제 — 용어 장벽 해소(관람객용). */
export function edgeSubtitle(edge: string): string | undefined {
  if (edge.includes('AreaMapping')) return '지역 기준을 맞춘 연결';
  if (edge.includes('vocab')) return '서로 다른 말을 맞춘 연결';
  if (edge.includes('crosswalk')) return '분류 체계를 맞춘 연결';
  if (edge.includes('HAS_CATEGORY')) return '카드↔카테고리 연결';
  if (edge.includes('HAS_EXCLUSION')) return '약관 제외 조항 연결';
  if (edge.includes('denial_to')) return '거절 사유↔약관 조건';
  if (edge.includes('gap_ranking')) return '인구·매출 대조';
  if (edge.includes('root_cause')) return '민원↔원인 연결';
  if (edge.includes('txn_rollup')) return '내부 거래 집계';
  if (edge.includes('not_detected')) return '조건 미검출 필터(≠없음)';
  return undefined;
}

/** chain hop grade → 표준 등급(지도 노드 색과 별개 — P1-4: 노드 색 덮어쓰기 금지). */
export function normalizeGrade(grade: string): '공개-실' | '집계' | '합성' | '추정' | '미확인' {
  if (grade.startsWith('공개-실')) return '공개-실';
  if (grade.includes('집계')) return '집계';
  if (grade.startsWith('합성')) return '합성';
  if (grade.startsWith('추정')) return '추정';
  return '미확인';
}
