'use client';

// U6 Step 16 — 프리셋 선택 시 나레이션 배너 ("무엇을 보라")
export function DemoNarration({ title, narration }: { title?: string; narration?: string }) {
  if (!narration) return null;
  return (
    <div
      className="rounded-[var(--r-md)] px-4 py-2.5 text-sm"
      style={{ background: 'var(--ink-700)', borderLeft: '3px solid var(--jade)' }}
      data-testid="demo-narration"
    >
      {title && <span className="font-medium font-display" style={{ color: 'var(--jade)' }}>{title} · </span>}
      <span style={{ color: 'var(--pearl)' }}>{narration}</span>
    </div>
  );
}
