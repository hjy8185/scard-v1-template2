'use client';

// U38 — 시나리오 레일: 픽커를 전역 헤더에서 분리(P1-1). 좌측 오버레이 레일 —
// 그룹 아코디언 + 질문 목록 + v1_failure("왜 어려운 질문인가") 표시. 선택 즉시 닫힘.
import { useEffect, useState } from 'react';
import { fetchScenarioCategories } from '@/lib/scenarios';
import type { ScenarioCategory } from '@/lib/types';

interface Props {
  onSelect: (query: string, narration: { title: string; text: string }, presetCardId?: string) => void;
  onClose: () => void;
}

export function ScenarioRail({ onSelect, onClose }: Props) {
  const [cats, setCats] = useState<ScenarioCategory[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchScenarioCategories().then((cs) => {
      if (!alive) return;
      setCats(cs);
      if (cs.length) setOpenId(cs[0].scenario_id);
    });
    return () => { alive = false; };
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex" data-testid="v2-scenario-rail">
      {/* 딤 배경 — 클릭 시 닫힘(focus trap 대용 + 명확한 닫기) */}
      <div className="flex-1" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose} aria-hidden />
      <div className="flex h-full w-full max-w-md flex-col overflow-hidden"
        style={{ background: 'var(--ink-800)', borderLeft: '1px solid var(--ink-600)' }}
        role="dialog" aria-label="데모 시나리오">
        <div className="flex shrink-0 items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--ink-600)' }}>
          <span className="font-medium" style={{ fontSize: 'var(--fs-title)' }}>데모 시나리오</span>
          <button onClick={onClose} className="min-h-11 min-w-11 rounded-[var(--r-md)]"
            style={{ background: 'var(--ink-700)', fontSize: 'var(--fs-meta)' }} aria-label="닫기">✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {cats.map((c) => {
            const open = openId === c.scenario_id;
            return (
              <div key={c.scenario_id} className="mb-2">
                <button onClick={() => setOpenId(open ? null : c.scenario_id)}
                  className="flex min-h-11 w-full items-center justify-between rounded-[var(--r-md)] px-3"
                  style={{ background: open ? 'var(--ink-700)' : 'transparent',
                           border: '1px solid var(--ink-600)', fontSize: 'var(--fs-meta)' }}
                  aria-expanded={open}>
                  <span style={{ color: open ? 'var(--pearl)' : 'var(--mist)' }}>{c.category_title}</span>
                  <span style={{ color: 'var(--mist)' }}>{c.questions.length}</span>
                </button>
                {open && (
                  <ul className="mt-1 space-y-1 pl-1">
                    {c.questions.map((q) => (
                      <li key={q.id}>
                        <button
                          onClick={() => onSelect(q.query, { title: c.category_title, text: c.narration ?? '' }, q.preset_card_id ?? undefined)}
                          className="w-full rounded-[var(--r-md)] px-3 py-2.5 text-left"
                          style={{ background: 'var(--ink-900)', border: '1px solid var(--ink-600)' }}
                          data-testid={`v2-scenario-q-${q.id}`}>
                          <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--pearl)' }}>{q.title}</div>
                          {q.v1_failure && (
                            <div className="mt-1" style={{ fontSize: 'var(--fs-fine)', color: 'var(--mist)' }}>
                              ⚡ {q.v1_failure}
                            </div>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
