'use client';

// U22 B2(FR-2c) — 여정 진행표시: "①→⑧ 중 ③" 배지 + 다음 스텝 바로가기.
// ScenarioPicker에서 여정(마케터) 질문 클릭 시 context.journey가 설정되고,
// 이 컴포넌트가 DemoNarration 옆에서 진행 도트·현재 스텝·다음 질문 버튼을 렌더.

import { useAppContext } from '@/lib/context';

interface Props {
  onNext: (query: string, presetCardId?: string) => void;
}

export function JourneyProgress({ onNext }: Props) {
  const { journey, setJourney } = useAppContext();
  if (!journey) return null;
  const { steps, stepIndex, categoryTitle } = journey;
  const cur = steps[stepIndex];
  const next = steps[stepIndex + 1];
  const circled = (i: number) => String.fromCharCode(0x2460 + Math.min(i, 19)); // ①②③…

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-[var(--r-md)] px-3 py-1.5 text-[13px]"
      style={{ background: 'var(--ink-800)', border: '1px solid #fbbf24' }}
      data-testid="journey-progress"
    >
      <span style={{ color: '#fbbf24', fontWeight: 600 }}>★ {categoryTitle}</span>
      {/* 진행 도트: 지나온 스텝은 채움, 현재는 링, 남은 스텝은 흐림 */}
      <span className="inline-flex items-center gap-1">
        {steps.map((s, i) => (
          <span
            key={s.id}
            title={s.title}
            style={{
              width: 7, height: 7, borderRadius: 999,
              background: i < stepIndex ? '#fbbf24' : i === stepIndex ? 'transparent' : 'var(--ink-600)',
              border: i === stepIndex ? '2px solid #fbbf24' : 'none',
            }}
          />
        ))}
      </span>
      <span style={{ color: 'var(--pearl)' }}>
        {steps.length}단계 중 <strong style={{ color: '#fbbf24' }}>{circled(stepIndex)}</strong>
        {cur ? ` · ${cur.title}` : ''}
      </span>
      {next ? (
        <button
          onClick={() => {
            setJourney({ ...journey, stepIndex: stepIndex + 1 });
            onNext(next.query, next.presetCardId);
          }}
          data-testid="journey-next"
          className="rounded-[var(--r-pill)] px-2.5 py-0.5 transition-colors hover:brightness-125"
          style={{ background: 'var(--ink-700)', border: '1px solid #fbbf24', color: '#fbbf24' }}
        >
          다음 {circled(stepIndex + 1)} {next.title} →
        </button>
      ) : (
        <span style={{ color: 'var(--jade)' }}>여정 완료 ✓</span>
      )}
      <button
        onClick={() => setJourney(undefined)}
        aria-label="여정 종료"
        style={{ color: 'var(--slate)' }}
      >
        ✕
      </button>
    </div>
  );
}
