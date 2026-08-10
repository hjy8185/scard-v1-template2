'use client';

// U36 — 플라이휠 관찰 패널: "질문할수록 결정론 경로가 넓어진다"의 실측.
// ① 이번 세션 tier 분포(결정론 비율) ② tier3 반복 패턴 → exemplar 승격 후보
// ③ 실제 승격 이력(u8_exemplars unit 태그 — 연출 아닌 커밋 기록).
// 데이터: GET /api/routing/insights (답변마다 재조회 — annotation 변경 트리거).
import { useEffect, useState } from 'react';
import { useAppContext } from '@/lib/context';

interface Candidate {
  pattern: string; count: number; intent?: string | null;
  stage: 'candidate' | 'observing'; suggestion: string;
}
interface Insights {
  session: { n_queries: number; tier_counts: Record<string, number>;
    deterministic_pct: number | null; note: string };
  promotion_candidates: Candidate[];
  promotion_history: Array<{ unit: string; n_exemplars: number }>;
  principle: string;
}

const TIER_LABEL: Record<string, { label: string; color: string }> = {
  tier1_rule: { label: 'Tier1 규칙', color: 'var(--jade)' },
  tier2_semantic: { label: 'Tier2 시맨틱', color: 'var(--aqua)' },
  tier3_llm: { label: 'Tier3 LLM 폴백', color: 'var(--amber)' },
  fallback: { label: 'fallback', color: 'var(--coral)' },
  unknown: { label: '(미기록)', color: 'var(--slate)' },
};

export function FlywheelPanel() {
  const { annotation } = useAppContext();
  const [data, setData] = useState<Insights | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/routing/insights')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setData(null); });
    return () => { alive = false; };
  }, [annotation]);   // 답변마다 최신 관찰 반영

  if (!data) {
    return (
      <div className="p-4 text-[13px]" style={{ color: 'var(--mist)' }} data-testid="flywheel-empty">
        라우팅 관찰 데이터를 불러오는 중이거나, 아직 질문이 없습니다.
      </div>
    );
  }
  const s = data.session;
  const total = s.n_queries;

  return (
    <div className="space-y-4 overflow-y-auto p-4 text-sm" data-testid="flywheel-panel">
      {/* ① 세션 tier 분포 */}
      <section>
        <div className="mb-1 text-[13px] font-medium" style={{ color: 'var(--mist)' }}>
          이번 세션 라우팅 관찰 — 질의 {total}건
          {s.deterministic_pct != null && (
            <span style={{ color: 'var(--jade)' }}> · 결정론 경로 {s.deterministic_pct}%</span>
          )}
        </div>
        {total === 0 ? (
          <div className="text-[13px]" style={{ color: 'var(--mist)' }}>{s.note}</div>
        ) : (
          <div className="space-y-1">
            {Object.entries(s.tier_counts).map(([tier, n]) => {
              const t = TIER_LABEL[tier] ?? TIER_LABEL.unknown;
              return (
                <div key={tier} className="flex items-center gap-2 text-[13px]">
                  <span className="w-28 shrink-0" style={{ color: t.color }}>{t.label}</span>
                  <div className="h-2 flex-1 rounded-full" style={{ background: 'var(--ink-700)' }}>
                    <div className="h-2 rounded-full"
                      style={{ width: `${(n / total) * 100}%`, background: t.color }} />
                  </div>
                  <span className="w-8 text-right font-mono" style={{ color: 'var(--pearl)' }}>{n}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ② 승격 후보 — tier3 반복 패턴 */}
      <section>
        <div className="mb-1 text-[13px] font-medium" style={{ color: 'var(--mist)' }}>
          exemplar 승격 후보 (LLM 폴백 반복 패턴)
        </div>
        {data.promotion_candidates.length === 0 ? (
          <div className="text-[13px]" style={{ color: 'var(--jade)' }}>
            이번 세션 LLM 폴백 없음 — 전 질의가 결정론 경로로 라우팅됨
          </div>
        ) : (
          <ul className="space-y-2">
            {data.promotion_candidates.map((c) => (
              <li key={c.pattern} className="rounded-[var(--r-md)] border p-2"
                style={{ borderColor: 'var(--ink-600)', background: 'var(--ink-700)' }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[13px]" style={{ color: 'var(--pearl)' }}>
                    {c.pattern}
                  </span>
                  <span className="shrink-0 rounded-[var(--r-pill)] px-2 py-0.5 text-[13px]"
                    style={{
                      background: c.stage === 'candidate' ? 'var(--amber)' : 'var(--ink-600)',
                      color: c.stage === 'candidate' ? '#1a1206' : 'var(--mist)',
                    }}>
                    {c.stage === 'candidate' ? `승격 후보 ×${c.count}` : '관찰 중'}
                  </span>
                </div>
                <div className="mt-1 text-[13px]" style={{ color: 'var(--mist)' }}>{c.suggestion}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ③ 실제 승격 이력 */}
      <section>
        <div className="mb-1 text-[13px] font-medium" style={{ color: 'var(--mist)' }}>
          승격 이력 (커밋된 exemplar — 실기록)
        </div>
        <div className="flex flex-wrap gap-1">
          {data.promotion_history.map((h) => (
            <span key={h.unit} className="rounded-[var(--r-pill)] px-2 py-0.5 font-mono text-[13px]"
              style={{ background: 'var(--ink-700)', color: 'var(--aqua)' }}>
              {h.unit}: +{h.n_exemplars}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--mist)' }}>
          {data.principle}
        </p>
      </section>
    </div>
  );
}
