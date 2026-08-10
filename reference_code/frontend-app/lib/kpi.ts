// U14 P1-3: KPI 타일 상수 (dataset-catalog-detail 실측). 우측 지도 상단 상시.
// lightKeys: 답변 annotation 신호(extractSignals)와 대조해 하이라이트.
import type { KpiTile, PlatformAnnotation } from './types';
import { extractSignals } from './asset-map';

export const KPI_TILES: KpiTile[] = [
  { id: 'card', label: '카드 상품', value: '694', grade: '공개-실',
    lightKeys: ['CARD_Product', 'card_product', 'r0_card_product'] },
  { id: 'benefit', label: '혜택', value: '5,647', grade: '공개-실',
    lightKeys: ['Benefit', 'benefit', 'r1_benefit'] },
  { id: 'condition', label: '약관 조건', value: '11,533', grade: '공개-실',
    lightKeys: ['Condition', 'benefit_condition', 'r2_benefit_condition'] },
  { id: 'tier', label: '전월실적 구간', value: '758', grade: '공개-실',
    lightKeys: ['SpendTier', 'spend_tier', 'r3_spend_tier'] },
  { id: 'merchant', label: '가맹점', value: '809', grade: '공개-실',
    lightKeys: ['MERCHANT', 'merchant', 'r4_merchant_reference'] },
  { id: 'seoul', label: '서울 시장', value: '92.7조', grade: '집계',
    lightKeys: ['market', 'seoul', 'by_industry', 'by_age', 'by_category'] },
  // U27: 생활인구 — S1 오프닝 수치(여의도 점심 15.8만/일)
  { id: 'living_pop', label: '생활인구 최다(점심)', value: '15.8만', grade: '집계',
    lightKeys: ['pop_vs_sales', 'penetration', 'pop_by_age', 'living_pop'] },
  // U28: 시장 시계열 — S3 수치(월 승인 112.5조)
  { id: 'market_trend', label: '시장 월 승인액', value: '112.5조', grade: '공개-실',
    lightKeys: ['trend', 'market_total', 'market_trend'] },
  { id: 'crosswalk', label: 'crosswalk 커버', value: '90.2%', grade: '집계',
    lightKeys: ['crosswalk', 'closure_path', 'categories'] },
  { id: 'txn', label: '거래', value: '125,891', grade: '합성',
    lightKeys: ['transaction', 'txn', 'metric', 'reward', 'd4_transaction'] },
];

// 답변 신호로 하이라이트할 타일 id 집합
export function highlightedKpis(ann: PlatformAnnotation | undefined, toolNames: string[] = []): Set<string> {
  const signals = extractSignals(ann);
  for (const t of toolNames) signals.add(t);
  const out = new Set<string>();
  for (const tile of KPI_TILES) {
    if (tile.lightKeys.some((k) => {
      for (const s of signals) if (s === k || s.includes(k) || k.includes(s)) return true;
      return false;
    })) out.add(tile.id);
  }
  return out;
}
