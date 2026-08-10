'use client';

// U6 Step 15 — ⑤ Metric: named metric + definition_version + lineage_refs
import type { MetricEvidence } from '@/lib/types';
import { EmptyPanel } from './RoutePlanView';

export function MetricPanel({ metrics }: { metrics?: MetricEvidence[] }) {
  if (!metrics || metrics.length === 0) return <EmptyPanel label="이 답변은 시맨틱 지표를 사용하지 않았습니다." />;
  return (
    <div className="space-y-3 text-sm" data-testid="metric-panel">
      {metrics.map((m, i) => (
        <div key={i} className="rounded-[var(--r-md)] border p-3" style={{ borderColor: 'var(--ink-600)', background: 'var(--ink-700)' }}>
          <div className="flex items-baseline justify-between">
            <span className="font-medium" style={{ color: 'var(--pearl)' }}>{m.metric_name}</span>
            <span className="font-mono text-lg" style={{ color: m.synthetic_flag ? 'var(--amber)' : 'var(--jade)' }}>
              {String(m.value ?? '—')}{m.unit ? ` ${m.unit}` : ''}
            </span>
          </div>
          {m.definition && <div className="mt-1 text-[13px]" style={{ color: 'var(--mist)' }}>{m.definition}</div>}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-mono" style={{ color: 'var(--mist)' }}>
            {m.grain && <span>grain: {m.grain}</span>}
            {m.definition_version && <span>def: {m.definition_version}</span>}
            {m.synthetic_flag && <span style={{ color: 'var(--amber)' }}>합성값</span>}
          </div>
          {m.source_tables && m.source_tables.length > 0 && (
            <div className="mt-1 text-[13px] font-mono" style={{ color: 'var(--aqua)' }}>
              tables: {m.source_tables.join(', ')}
            </div>
          )}
          {m.lineage_refs && m.lineage_refs.length > 0 && (
            <div className="mt-0.5 text-[13px] font-mono" style={{ color: 'var(--mist)' }}>
              lineage: {m.lineage_refs.join(' → ')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
