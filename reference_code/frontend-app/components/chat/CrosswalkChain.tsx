'use client';

// U14 P1-4: 답변 하단 미니 crosswalk 사슬. ontology.crosswalk(from_label→to_label).
// (rows.crosswalk_path는 action별 불균일 → 균일한 ontology.crosswalk 채택)
import type { OntologyContext } from '@/lib/types';

const SCHEME_SHORT: Record<string, string> = {
  'seoul-industry': '서울', 'mcc': 'MCC', 'shinhan-benefit': '신한', 'seoul-market': '시장',
};

export function CrosswalkChain({ ontology, coveredPct }: { ontology?: OntologyContext | null; coveredPct?: number }) {
  const pairs = ontology?.crosswalk ?? [];
  if (pairs.length === 0) return null;
  // from_label별 첫 매핑만(간결) — 대표 연결
  const seen = new Set<string>();
  const chain: Array<{ from: string; to: string; scheme: string }> = [];
  for (const p of pairs) {
    const from = p.from_label ?? p.from;
    const key = `${from}→${p.to_label ?? p.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    chain.push({ from, to: p.to_label ?? p.to, scheme: SCHEME_SHORT[p.to_scheme] ?? p.to_scheme });
    if (chain.length >= 4) break;
  }

  return (
    <div className="mt-1.5 text-[13px]">
      <span style={{ color: 'var(--mist)', fontSize: 12 }}>
        데이터 연결{coveredPct ? ` (서울 커버 ${coveredPct}%)` : ''}:
      </span>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {chain.map((c, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-[var(--r-md)] px-1.5 py-0.5"
            style={{ background: 'var(--ink-800)', border: '1px solid var(--ink-600)' }}>
            <span style={{ color: 'var(--jade)' }}>{c.from}</span>
            <span style={{ color: 'var(--slate)' }}>→</span>
            <span style={{ color: 'var(--aqua)' }}>{c.to}</span>
            <span style={{ color: 'var(--slate)', fontSize: 12 }}>{c.scheme}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
