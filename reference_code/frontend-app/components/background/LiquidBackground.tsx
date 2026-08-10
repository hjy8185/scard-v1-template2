'use client';

// U6 Step 10 — Provenance-reactive liquid blob field (design-system 시그니처)
// 배경 전용 연출. dominantGrade 색으로 morph. reduced-motion 대응.
import { useAppContext } from '@/lib/context';
import { GRADE_COLOR } from '@/lib/provenance';

export function LiquidBackground({ paused = false }: { paused?: boolean } = {}) {
  const { dominant } = useAppContext();
  const color = GRADE_COLOR[dominant];

  return (
    <div
      aria-hidden
      data-testid="liquid-background"
      data-dominant={dominant}
      data-paused={paused || undefined}
      className={`pointer-events-none fixed inset-0 -z-10 overflow-hidden ${paused ? "bg-paused" : ""}`}
      style={{ background: 'var(--ink-900)' }}
    >
      {/* provenance-reactive blob (dominant 색으로 2s morph) */}
      <div
        className="blob absolute"
        style={{
          top: '-10%', left: '-5%', width: '55vw', height: '55vw',
          background: `radial-gradient(circle at 40% 40%, ${color}, transparent 68%)`,
          filter: 'blur(70px)', opacity: 0.42, mixBlendMode: 'screen',
          animation: 'blob-morph 18s var(--ease-flow) infinite, blob-drift 24s ease-in-out infinite',
          transition: 'background 2s var(--ease-flow)',
        }}
      />
      {/* 정적 보조 blob (아이덴티티 flow 그라디언트) */}
      <div
        className="blob absolute"
        style={{
          bottom: '-15%', right: '-8%', width: '50vw', height: '50vw',
          background: 'var(--flow)',
          filter: 'blur(90px)', opacity: 0.18, mixBlendMode: 'screen',
          animation: 'blob-morph 22s var(--ease-flow) infinite reverse, blob-drift 30s ease-in-out infinite',
        }}
      />
      {/* grain overlay */}
      <div
        className="absolute inset-0"
        style={{
          opacity: 0.04,
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
