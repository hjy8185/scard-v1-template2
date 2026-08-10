'use client';

// U6 Step 13 — ② Provenance matrix (component × source_grade), multi-badge (#1)
import type { ProvenanceItem, SourceGrade } from '@/lib/types';
import { GRADE_COLOR, GRADE_LABEL } from '@/lib/provenance';

export function ProvenanceMatrix({ provenance }: { provenance?: ProvenanceItem[] }) {
  if (!provenance || provenance.length === 0) return null;
  return (
    <div className="rounded-[var(--r-md)] border p-3" style={{ borderColor: 'var(--ink-600)' }} data-testid="provenance-matrix">
      <div className="mb-2 text-[13px] font-medium" style={{ color: 'var(--mist)' }}>PROVENANCE (출처 공개)</div>
      <table className="w-full text-[13px]">
        <tbody>
          {provenance.map((p, i) => (
            <tr key={i} data-testid={`prov-row-${p.component}`}>
              <td className="py-1 pr-3 font-mono" style={{ color: 'var(--pearl)' }}>{p.component}</td>
              <td className="py-1">
                <GradeBadge source={p.source as SourceGrade} />
                {p.processing === '집계' && (
                  <span
                    className="ml-1 rounded-[var(--r-pill)] px-2 py-0.5 text-[13px]"
                    style={{ border: '1px solid var(--aqua)', color: 'var(--aqua)' }}
                  >
                    집계
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GradeBadge({ source }: { source: SourceGrade }) {
  return (
    <span
      className="rounded-[var(--r-pill)] px-2 py-0.5 text-[13px] font-medium"
      style={{ background: GRADE_COLOR[source], color: '#06121a' }}
      data-testid={`grade-badge-${source}`}
    >
      {GRADE_LABEL[source]}
    </span>
  );
}
