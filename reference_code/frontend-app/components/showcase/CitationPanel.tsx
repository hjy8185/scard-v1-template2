'use client';

// U6 Step 13 — ② Evidence: Citation + ProvenanceMatrix
import type { Citation } from '@/lib/types';
import { EmptyPanel } from './RoutePlanView';
import { ProvenanceMatrix } from './ProvenanceMatrix';

export function CitationPanel({ citation }: { citation?: Citation }) {
  if (!citation) return <EmptyPanel label="이 답변은 근거(citation) 정보가 없습니다." />;
  const { graph_paths, sql, rule_trace, doc_chunks, metrics, provenance } = citation;
  return (
    <div className="space-y-3 text-sm" data-testid="citation-panel">
      <ProvenanceMatrix provenance={provenance} />

      {graph_paths && graph_paths.length > 0 && (
        <Section title={`그래프 경로 ${graph_paths.length}건`}>
          <span className="text-[13px]" style={{ color: 'var(--mist)' }}>Neptune Gremlin path evidence</span>
        </Section>
      )}
      {sql && (
        <Section title={`SQL · ${sql.row_count} rows`}>
          <pre className="font-mono text-[13px] overflow-x-auto" style={{ color: 'var(--aqua)' }}>{sql.query}</pre>
        </Section>
      )}
      {rule_trace && (
        <Section title="규칙 판정 trace">
          <pre className="font-mono text-[13px] overflow-x-auto" style={{ color: 'var(--pearl)' }}>
            {JSON.stringify(rule_trace, null, 2)}
          </pre>
        </Section>
      )}
      {metrics && metrics.length > 0 && (
        <Section title={`지표 ${metrics.length}건`}>
          <ul className="space-y-1">
            {metrics.map((m, i) => (
              <li key={i} className="font-mono text-[13px]">
                {m.metric_name} = {String(m.value ?? '—')} {m.unit ?? ''}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {doc_chunks && doc_chunks.length > 0 && (
        <Section title={`약관 근거 ${doc_chunks.length}건`}>
          {/* U19 R4: 스니펫(dict) 있으면 원문 발췌 표시, 문자열(id)은 기존대로 */}
          <div className="space-y-1 text-[13px]">
            {doc_chunks.map((d, i) => {
              const chunk = d as unknown as { id?: string; snippet?: string } | string;
              if (typeof chunk === 'object' && chunk?.snippet) {
                return (
                  <div key={i} style={{ color: 'var(--pearl)' }}>
                    <span className="font-mono" style={{ color: 'var(--slate)' }}>[{chunk.id}]</span> &quot;{chunk.snippet}&quot;
                  </div>
                );
              }
              return <span key={i} className="font-mono" style={{ color: 'var(--mist)' }}>{String(chunk)}{i < doc_chunks.length - 1 ? ', ' : ''}</span>;
            })}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--r-md)] border p-3" style={{ borderColor: 'var(--ink-600)', background: 'var(--ink-700)' }}>
      <div className="mb-1 text-[13px] font-medium" style={{ color: 'var(--mist)' }}>{title}</div>
      {children}
    </div>
  );
}
