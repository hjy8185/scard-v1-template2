'use client';

// U6 Step 14 — ④ Catalog: SMUS glossary term + lineage (fallback 표기 #7)
import type { CatalogContext } from '@/lib/types';
import { EmptyPanel } from './RoutePlanView';

export function CatalogPanel({ catalog }: { catalog?: CatalogContext | null }) {
  if (!catalog) return <EmptyPanel label="이 답변은 카탈로그 자산을 참조하지 않았습니다." />;
  const isFallback = catalog.source?.startsWith('fallback');
  return (
    <div className="space-y-3 text-sm" data-testid="catalog-panel">
      {isFallback && (
        <div className="rounded-[var(--r-md)] px-3 py-2 text-[13px]" style={{ border: '1px solid var(--amber)', color: 'var(--amber)' }}>
          SMUS 카탈로그 미연결 → U4 registry/U2a fallback 사용
        </div>
      )}
      {catalog.terms?.length > 0 && (
        <div className="rounded-[var(--r-md)] border p-3" style={{ borderColor: 'var(--ink-600)', background: 'var(--ink-700)' }}>
          <div className="mb-1 text-[13px] font-medium" style={{ color: 'var(--mist)' }}>비즈니스 용어 (glossary)</div>
          <ul className="space-y-2">
            {catalog.terms.map((t, i) => (
              <li key={i}>
                <div className="font-medium" style={{ color: 'var(--pearl)' }}>{t.name}</div>
                <div className="text-[13px]" style={{ color: 'var(--mist)' }}>{t.definition}</div>
                <div className="text-[13px]" style={{ color: 'var(--aqua)' }}>owner: {t.owning_project}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {catalog.lineage && catalog.lineage.length > 0 && (
        <div className="rounded-[var(--r-md)] border p-3" style={{ borderColor: 'var(--ink-600)' }}>
          <div className="mb-1 text-[13px] font-medium" style={{ color: 'var(--mist)' }}>Lineage</div>
          <div className="flex items-center gap-2 flex-wrap font-mono text-[13px]">
            {catalog.lineage.map((l, i) => (
              <span key={i} className="flex items-center gap-2">
                <span style={{ color: 'var(--pearl)' }}>{l.from}</span>
                <span style={{ color: 'var(--mist)' }}>→{l.kind}→</span>
                {i === catalog.lineage!.length - 1 && <span style={{ color: 'var(--jade)' }}>{l.to}</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
