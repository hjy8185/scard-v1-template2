'use client';

// U38 — v2 shell: 고정 데모 서사(답변 → 근거 → 데이터).
// - compact 앱바(≤64px) + 시나리오 컨텍스트 줄(픽커는 접이식 레일로 분리 — P1-1)
// - 답변 캔버스 58% / 인스펙터 42%(근거|데이터 고정 2탭 — P0-2)
// - 자동 투어·자동 전환 없음(P0-1·P1-6). 가이드는 앱바 버튼으로만.
// - 1024px 이하: 분할 제거, 하단 고정 답변/근거/데이터 탐색(P1-7).
import { useCallback, useEffect, useState } from 'react';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { LiquidBackground } from '@/components/background/LiquidBackground';
import { useAppContext } from '@/lib/context';
import { ScenarioRail } from './ScenarioRail';
import { EvidenceInspector } from './EvidenceInspector';
import { DataInspector } from './DataInspector';
import { StartScene } from './StartScene';

type Workspace = 'answer' | 'evidence' | 'data';

export function AppShellV2() {
  const { annotation, narration, setNarration, setPendingQuery, setPendingCardId } = useAppContext();
  const [railOpen, setRailOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<'evidence' | 'data'>('evidence');
  const [mobileWs, setMobileWs] = useState<Workspace>('answer');
  const [booth, setBooth] = useState(false);

  // booth density preset — body 클래스로 토큰 전환(Stage 5에서 토큰 정의)
  useEffect(() => {
    document.body.classList.toggle('density-booth', booth);
    if (typeof window !== 'undefined') localStorage.setItem('cg-density', booth ? 'booth' : 'standard');
  }, [booth]);
  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('cg-density') === 'booth') setBooth(true);
  }, []);

  const handleSelect = useCallback(
    (query: string, narr: { title: string; text: string }, presetCardId?: string) => {
      setNarration(narr);
      setPendingCardId(presetCardId);
      setPendingQuery(query);
      setRailOpen(false);
      setMobileWs('answer');
    },
    [setNarration, setPendingCardId, setPendingQuery],
  );

  const started = !!annotation || !!narration;

  return (
    <>
      <LiquidBackground paused={booth} />
      <div className="flex h-screen flex-col" style={{ color: 'var(--pearl)' }}>
        {/* ── compact 앱바 (≤64px) ── */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 px-4"
          style={{ borderBottom: '1px solid var(--ink-600)', background: 'rgba(10,16,21,0.8)', backdropFilter: 'blur(8px)' }}
          data-testid="v2-appbar">
          <h1 className="truncate font-display" style={{ fontSize: 'var(--fs-title)' }}>
            AI-Ready Data Platform <span style={{ color: 'var(--jade)' }}>· Card Ontology</span>
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => setRailOpen(!railOpen)}
              className="min-h-11 rounded-[var(--r-pill)] px-4"
              style={{ background: railOpen ? 'var(--flow)' : 'var(--ink-700)',
                       color: railOpen ? '#06121a' : 'var(--pearl)', fontSize: 'var(--fs-meta)' }}
              data-testid="v2-scenario-toggle">
              📋 시나리오
            </button>
            <button onClick={() => setBooth(!booth)}
              className="min-h-11 rounded-[var(--r-pill)] px-4"
              style={{ background: booth ? 'var(--amber)' : 'var(--ink-700)',
                       color: booth ? '#1a1206' : 'var(--pearl)', fontSize: 'var(--fs-meta)' }}
              data-testid="v2-booth-toggle">
              👁 부스
            </button>
          </div>
        </header>

        {/* ── 시나리오 컨텍스트 줄(선택 후) ── */}
        {narration && (
          <div className="flex shrink-0 items-center gap-2 px-4 py-2"
            style={{ borderBottom: '1px solid var(--ink-600)', background: 'var(--ink-800)' }}
            data-testid="v2-scenario-context">
            <span className="shrink-0 rounded-[var(--r-pill)] px-2 py-0.5"
              style={{ background: 'var(--ink-600)', color: 'var(--aqua)', fontSize: 'var(--fs-fine)' }}>
              시나리오
            </span>
            <span className="truncate" style={{ fontSize: 'var(--fs-meta)' }}>{narration.title}</span>
          </div>
        )}

        {/* ── 시나리오 레일(접이식 — 헤더 밖) ── */}
        {railOpen && <ScenarioRail onSelect={handleSelect} onClose={() => setRailOpen(false)} />}

        {/* ── 본문: 답변 캔버스 + 인스펙터 ── */}
        <main className="flex min-h-0 flex-1 overflow-hidden">
          {/* 답변 캔버스 — 데스크톱 58% */}
          <section
            className={`flex min-h-0 flex-col max-lg:w-full lg:w-[58%] ${mobileWs !== 'answer' ? 'max-lg:hidden' : ''}`}
            style={{ borderRight: '1px solid var(--ink-600)' }}
            data-testid="v2-answer-canvas">
            {!started ? (
              <StartScene onSelect={handleSelect} />
            ) : (
              <div className="min-h-0 flex-1 p-2"><ChatPanel /></div>
            )}
          </section>

          {/* 인스펙터 — 데스크톱 42%, 모바일은 workspace 전환 */}
          <aside
            className={`flex min-h-0 flex-col max-lg:w-full lg:w-[42%] ${mobileWs === 'answer' ? 'max-lg:hidden' : ''}`}
            style={{ background: 'rgba(12,19,25,0.55)', backdropFilter: 'blur(6px)' }}
            data-testid="v2-inspector">
            {/* 고정 2탭: 근거 | 데이터 (골격 불변 — 조건부 탭 없음) */}
            <div className="flex shrink-0 gap-1 px-3 pt-2" role="tablist" aria-label="근거와 데이터">
              {([['evidence', '근거 — 어떻게 답했나'], ['data', '데이터 — 무엇을 썼나']] as const).map(([id, label]) => {
                const active = (mobileWs === 'answer' ? inspectorTab : mobileWs === 'evidence' ? 'evidence' : 'data') === id;
                return (
                  <button key={id} role="tab" aria-selected={active}
                    onClick={() => { setInspectorTab(id); setMobileWs(id); }}
                    className="min-h-11 rounded-t-[var(--r-md)] px-4 font-medium"
                    style={{ background: active ? 'var(--ink-700)' : 'transparent',
                             color: active ? 'var(--pearl)' : 'var(--mist)',
                             borderBottom: active ? '2px solid var(--flow-solid)' : '2px solid transparent',
                             fontSize: 'var(--fs-meta)' }}
                    data-testid={`v2-tab-${id}`}>
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden" role="tabpanel">
              {inspectorTab === 'evidence'
                ? <EvidenceInspector annotation={annotation} />
                : <DataInspector annotation={annotation} />}
            </div>
          </aside>
        </main>

        {/* ── 모바일 하단 고정 탐색 ── */}
        <nav className="hidden shrink-0 max-lg:flex" aria-label="작업 영역"
          style={{ borderTop: '1px solid var(--ink-600)', background: 'var(--ink-800)',
                   paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {([['answer', '답변'], ['evidence', '근거'], ['data', '데이터']] as const).map(([id, label]) => (
            <button key={id} onClick={() => { setMobileWs(id); if (id !== 'answer') setInspectorTab(id); }}
              className="min-h-12 flex-1 font-medium"
              style={{ color: mobileWs === id ? 'var(--flow-solid)' : 'var(--mist)', fontSize: 'var(--fs-meta)' }}
              data-testid={`v2-nav-${id}`}>
              {label}
            </button>
          ))}
        </nav>
      </div>
    </>
  );
}
