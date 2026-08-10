'use client';

// v3-anatomy — 연결 해부 유형별 선별 질문(정확도 만점 + S등급 20문항).
// 여정 모드 폐지, 유형 그룹으로 재편(데이터 매핑 다양성 = 데모 가치).
import { useEffect, useState } from 'react';
import { useAppContext } from '@/lib/context';
import { fetchScenarioCategories } from '@/lib/scenarios';
import type { ScenarioCategory } from '@/lib/types';

interface Props {
  onSelect: (query: string, narration: { title: string; text: string }, presetCardId?: string) => void;
}

export function ScenarioPicker({ onSelect }: Props) {
  const { setScenarioId, setJourney } = useAppContext();
  const [cats, setCats] = useState<ScenarioCategory[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);   // v3: 시연 편의 — 기본 펼침

  useEffect(() => {
    fetchScenarioCategories().then((cs) => {
      setCats(cs);
      if (cs.length) setOpenId(cs[0].scenario_id);   // 첫 유형 자동 펼침
    });
  }, []);

  const total = cats.reduce((n, c) => n + c.questions.length, 0);

  return (
    <div className="space-y-2" data-testid="scenario-picker">
      <button
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1.5 rounded-[var(--r-pill)] px-3 py-1 text-[13px] font-medium"
        style={{ background: 'var(--ink-700)', color: 'var(--mist)', border: '1px solid var(--ink-600)' }}
      >
        <span>{expanded ? '▾' : '▸'}</span>
        <span>연결 해부 예시 {expanded ? '접기' : `보기 (${total})`}</span>
      </button>

      {expanded && (
        <div className="space-y-1.5">
          {/* 유형 pill 행 — 각 유형이 보여주는 연결 매핑 */}
          <div className="flex flex-wrap gap-1.5">
            {cats.map((c) => {
              const isOpen = openId === c.scenario_id;
              // U48: border에도 쓰이므로 gradient(--flow) 금지 — 단색 토큰
              const accent = c.accent ?? 'var(--flow-solid)';
              return (
                <button
                  key={c.scenario_id}
                  data-testid={`scenario-cat-${c.scenario_id}`}
                  onClick={() => setOpenId(isOpen ? null : c.scenario_id)}
                  className="rounded-[var(--r-pill)] px-3 py-1 text-[13px] font-medium transition-all duration-150"
                  style={{
                    background: isOpen ? accent : 'var(--ink-700)',
                    color: isOpen ? '#06121a' : 'var(--pearl)',
                    border: `1px solid ${isOpen ? accent : 'var(--ink-600)'}`,
                  }}
                >
                  {c.category_title}
                  <span className="ml-1 opacity-70">{c.questions.length}</span>
                </button>
              );
            })}
          </div>

          {/* 선택 유형의 질문 그리드 + 이 유형이 보여주는 연결 설명 */}
          {cats.filter((c) => c.scenario_id === openId).map((c) => (
            <div key={c.scenario_id} className="space-y-1.5">
              {c.anatomy_desc && (
                <div className="text-[13px]" style={{ color: c.accent ?? 'var(--mist)' }}>
                  🔗 {c.anatomy_desc}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {c.questions.map((q) => (
                  <button
                    key={q.id}
                    data-testid={`scenario-q-${q.id}`}
                    onClick={() => {
                      setScenarioId(q.id);
                      setJourney(undefined);   // v3: 여정 모드 폐지
                      onSelect(q.query, { title: c.category_title, text: c.narration }, q.preset_card_id);
                    }}
                    className="rounded-[var(--r-md)] px-2.5 py-1.5 text-[13px] text-left transition-colors"
                    style={{ background: 'var(--ink-700)', border: '1px solid var(--ink-600)', color: 'var(--pearl)' }}
                  >
                    {q.title}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
