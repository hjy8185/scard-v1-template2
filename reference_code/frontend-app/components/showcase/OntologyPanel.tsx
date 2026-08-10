'use client';

// U6 Step 14 — ③ Ontology: subClassOf 계층 + closure + crosswalk (절제 #8)
import type { OntologyContext } from '@/lib/types';
import { EmptyPanel } from './RoutePlanView';

export function OntologyPanel({ ontology }: { ontology?: OntologyContext | null }) {
  if (!ontology) return <EmptyPanel label="이 답변은 온톨로지 컨텍스트를 사용하지 않았습니다." />;
  return (
    <div className="space-y-3 text-sm" data-testid="ontology-panel">
      {ontology.closure_path && ontology.closure_path.length > 0 && (
        <div className="rounded-[var(--r-md)] border p-3" style={{ borderColor: 'var(--ink-600)', background: 'var(--ink-700)' }}>
          <div className="mb-1 text-[13px] font-medium" style={{ color: 'var(--mist)' }}>카테고리 포함관계 (subsumption closure)</div>
          <div className="flex items-center gap-2 flex-wrap">
            {ontology.closure_path.map((label, i) => (
              <span key={i} className="flex items-center gap-2">
                <span className="rounded-[var(--r-pill)] px-2.5 py-1 text-[13px]" style={{ background: 'var(--ink-600)', color: 'var(--jade)' }}>{label}</span>
                {i < ontology.closure_path!.length - 1 && <span style={{ color: 'var(--mist)' }}>→</span>}
              </span>
            ))}
          </div>
        </div>
      )}
      {ontology.categories?.length > 0 && (
        <div className="rounded-[var(--r-md)] border p-3" style={{ borderColor: 'var(--ink-600)' }}>
          <div className="mb-1 text-[13px] font-medium" style={{ color: 'var(--mist)' }}>클래스 (rdfs:subClassOf)</div>
          <ul className="space-y-1">
            {ontology.categories.map((c, i) => (
              <li key={i} className="font-mono text-[13px]">
                <span style={{ color: 'var(--pearl)' }}>{c.label}</span>
                {c.subClassOf && <span style={{ color: 'var(--mist)' }}> ⊑ {c.subClassOf}</span>}
                {c.iri && <div style={{ color: 'var(--mist)' }} className="truncate">{c.iri}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {ontology.crosswalk && ontology.crosswalk.length > 0 && (
        <div className="rounded-[var(--r-md)] border p-3" style={{ borderColor: 'var(--ink-600)' }}>
          <div className="mb-1 text-[13px] font-medium" style={{ color: 'var(--mist)' }}>Crosswalk (업종 ↔ 혜택)</div>
          <ul className="space-y-1 text-[13px]">
            {ontology.crosswalk.map((x, i) => (
              <li key={i} className="font-mono">
                <span style={{ color: 'var(--jade)' }}>{x.from_label ?? x.from}</span>
                <span style={{ color: 'var(--mist)' }}> ({x.from_scheme}) ↔ </span>
                <span style={{ color: 'var(--aqua)' }}>{x.to_label ?? x.to}</span>
                <span style={{ color: 'var(--mist)' }}> ({x.to_scheme})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {ontology.source && (
        <div className="text-[13px]" style={{ color: 'var(--mist)' }}>source: {ontology.source}</div>
      )}
    </div>
  );
}
