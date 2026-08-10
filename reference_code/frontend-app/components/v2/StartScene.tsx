'use client';

// U38 — 첫 진입 단일 시작 장면(P1-4): 한 문장 + 규모 수치 3개 + 추천 질문 1개 +
// `시연 시작` 단일 primary action. 전체 비교·전체 KPI는 secondary.
import { useEffect, useState } from 'react';
import { fetchScenarioCategories } from '@/lib/scenarios';
import { OpeningComparison } from '@/components/controls/OpeningComparison';

interface Props {
  onSelect: (query: string, narration: { title: string; text: string }, presetCardId?: string) => void;
}

const HERO_STATS = [
  { value: '694', label: '카드 상품' },
  { value: '5,647', label: '혜택' },
  { value: '23종', label: '연결된 데이터 자산' },
];

export function StartScene({ onSelect }: Props) {
  const [rec, setRec] = useState<{ query: string; title: string; catTitle: string; narration: string; preset?: string } | null>(null);
  const [showCompare, setShowCompare] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchScenarioCategories().then((cs) => {
      if (!alive || !cs.length) return;
      // 추천 = 멀티홉 그룹 첫 질문(있으면), 없으면 첫 그룹 첫 질문
      const chain = cs.find((c) => c.scenario_id === 'L-chain') ?? cs[0];
      const q = chain.questions[0];
      if (q) setRec({ query: q.query, title: q.title, catTitle: chain.category_title,
                      narration: chain.narration ?? '', preset: q.preset_card_id ?? undefined });
    });
    return () => { alive = false; };
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto p-8"
      data-testid="v2-start-scene">
      <p className="max-w-lg text-center leading-relaxed" style={{ fontSize: 'var(--fs-title)' }}>
        일반 RAG는 약관어·통계어·지표어, <span style={{ color: 'var(--coral)' }}>세 언어를 잇지 못합니다</span>.
        <br />온톨로지가 그 셋을 연결합니다.
      </p>

      <div className="flex gap-6">
        {HERO_STATS.map((s) => (
          <div key={s.label} className="text-center">
            <div className="font-semibold tabular-nums" style={{ fontSize: 'var(--fs-hero)', color: 'var(--jade)' }}>
              {s.value}
            </div>
            <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--mist)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {rec && (
        <div className="w-full max-w-lg rounded-[var(--r-md)] border p-4"
          style={{ borderColor: 'var(--ink-600)', background: 'var(--ink-800)' }}>
          <div style={{ fontSize: 'var(--fs-fine)', color: 'var(--aqua)' }}>추천 시나리오 · {rec.catTitle}</div>
          <div className="mt-1" style={{ fontSize: 'var(--fs-body)' }}>{rec.title}</div>
          <button
            onClick={() => onSelect(rec.query, { title: rec.catTitle, text: rec.narration }, rec.preset)}
            className="mt-3 min-h-12 w-full rounded-[var(--r-md)] font-semibold"
            style={{ background: 'var(--flow)', color: '#06121a', fontSize: 'var(--fs-body)' }}
            data-testid="v2-start-demo">
            ▶ 시연 시작
          </button>
        </div>
      )}

      <button onClick={() => setShowCompare(!showCompare)}
        className="min-h-11 px-3" style={{ fontSize: 'var(--fs-meta)', color: 'var(--mist)' }}>
        {showCompare ? '접기 ▲' : '기존 방식과 뭐가 다른가요? ▼'}
      </button>
      {showCompare && <div className="w-full max-w-2xl"><OpeningComparison /></div>}
    </div>
  );
}
