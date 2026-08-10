'use client';

// U14 P1-3: KPI 타일 스트립(우측 지도 상단 상시). 데이터 규모 항상 노출 + 답변 관련 타일 하이라이트.
import { KPI_TILES } from '@/lib/kpi';
import type { AssetGrade } from '@/lib/types';

const GRADE_COLOR: Record<AssetGrade, string> = {
  '공개-실': 'var(--jade)', '집계': 'var(--aqua)', '합성': 'var(--amber)', '추정': 'var(--coral)',
};
const GRADE_SHORT: Record<AssetGrade, string> = {
  '공개-실': '실', '집계': '집계', '합성': '합성', '추정': '추정',
};

export function KpiStrip({ highlighted }: { highlighted: Set<string> }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto px-2 py-2" style={{ borderBottom: '1px solid var(--ink-600)' }}>
      {KPI_TILES.map((t) => {
        const lit = highlighted.has(t.id);
        const color = GRADE_COLOR[t.grade];
        return (
          <div key={t.id} className="flex-shrink-0 rounded-[var(--r-md)] px-2.5 py-1.5 transition-all"
            style={{
              background: 'var(--ink-800)',
              border: `1px solid ${lit ? color : 'var(--ink-600)'}`,
              boxShadow: lit ? `0 0 10px ${color}` : 'none',
              minWidth: 78,
            }}
            title={`${t.label} · ${GRADE_SHORT[t.grade]}`}>
            <div className="flex items-baseline gap-1">
              <span style={{ color, fontSize: 15, fontWeight: 600 }}>{t.value}</span>
            </div>
            <div className="flex items-center gap-1" style={{ marginTop: 1 }}>
              <span style={{ width: 5, height: 5, borderRadius: 1, background: color }} />
              <span style={{ color: 'var(--mist)', fontSize: 12 }}>{t.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
