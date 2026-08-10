'use client';

// U6 Step 16 — 답변 하단 provenance 뱃지 + disclaimer 배너
import type { ProvenanceItem } from '@/lib/types';
import { badgeList } from '@/lib/provenance';
import { GradeBadge } from '@/components/showcase/ProvenanceMatrix';

export function ProvenanceBadges({ provenance }: { provenance?: ProvenanceItem[] }) {
  const badges = badgeList(provenance);
  if (badges.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="provenance-badges">
      <span className="text-[13px]" style={{ color: 'var(--mist)' }}>출처</span>
      {badges.map((b, i) => (
        <span key={i} className="flex items-center gap-0.5">
          <GradeBadge source={b.source} />
          {b.processing === '집계' && (
            <span
              className="rounded-[var(--r-pill)] px-2 py-0.5 text-[13px]"
              style={{ border: '1px solid var(--aqua)', color: 'var(--aqua)' }}
            >
              집계
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

export function DisclaimerBanner({ disclaimers }: { disclaimers?: string[] }) {
  if (!disclaimers || disclaimers.length === 0) return null;
  return (
    <div
      className="mt-2 rounded-[var(--r-md)] px-3 py-2 text-[13px]"
      style={{ border: '1px solid var(--amber)', color: 'var(--amber)', background: 'rgba(245,181,68,0.06)' }}
      data-testid="disclaimer-banner"
    >
      {disclaimers.map((d, i) => (
        <div key={i}>⚠ {d}</div>
      ))}
    </div>
  );
}
