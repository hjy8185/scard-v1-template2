// U6 Step 7 — provenance: dominantGrade tie-break + 색 매핑 (US-10, #1/#2)
import type { ProvenanceItem, SourceGrade, ProcessingGrade } from './types';

// #2 보수 우선순위: 숫자 하나라도 합성이면 합성이 시각적으로 묻히지 않음.
const PRIORITY: SourceGrade[] = ['unsupported', '추정', '합성', '공개-실'];

// design-system.md §1 bioluminescent accent
export const GRADE_COLOR: Record<SourceGrade, string> = {
  '공개-실': 'var(--jade)',
  '합성': 'var(--amber)',
  '추정': 'var(--coral)',
  'unsupported': 'var(--slate)',
};

export const GRADE_LABEL: Record<SourceGrade, string> = {
  '공개-실': '공개·실데이터',
  '합성': '합성 데이터',
  '추정': '추정치',
  'unsupported': '근거 불충분',
};

// 집계 뱃지(processing)는 별도 — source를 가리지 않음(#1)
export const PROCESSING_COLOR: Record<ProcessingGrade, string> = {
  '원천': 'transparent',
  '집계': 'var(--aqua)',
};

/** provenance 목록에서 지배 source_grade 산출 (보수 우선 tie-break, #2). */
export function dominantGrade(provenance: ProvenanceItem[] | undefined): SourceGrade {
  if (!provenance || provenance.length === 0) return 'unsupported';
  const present = new Set(provenance.map((p) => p.source));
  for (const g of PRIORITY) {
    if (present.has(g)) return g;
  }
  return '공개-실';
}

/** 배경 blob이 morph할 색 (dominantGrade 기준). */
export function dominantColor(provenance: ProvenanceItem[] | undefined): string {
  return GRADE_COLOR[dominantGrade(provenance)];
}

/** 고유 (source[+processing]) 뱃지 목록 — multi-badge (#1). */
export function badgeList(
  provenance: ProvenanceItem[] | undefined,
): Array<{ source: SourceGrade; processing?: ProcessingGrade }> {
  if (!provenance) return [];
  const seen = new Set<string>();
  const out: Array<{ source: SourceGrade; processing?: ProcessingGrade }> = [];
  for (const p of provenance) {
    const key = `${p.source}|${p.processing ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ source: p.source, processing: p.processing });
    }
  }
  return out;
}
