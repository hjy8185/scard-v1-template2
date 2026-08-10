'use client';

import { useCallback, useState } from 'react';
import { DualPanelLayout } from '@/components/layout/DualPanelLayout';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { ScenarioRail } from '@/components/v2/ScenarioRail';
import { AssetMapPanel } from '@/components/showcase/AssetMapPanel';
import { LiquidBackground } from '@/components/background/LiquidBackground';
import { TourController } from '@/components/controls/TourController';
import { CacheWarmButton } from '@/components/controls/CacheWarmButton';
import { ChatDiagLine } from '@/components/controls/ChatDiagLine';
import { useAppContext } from '@/lib/context';
import { useUiV2 } from '@/lib/ui-flag';
import { AppShellV2 } from '@/components/v2/AppShellV2';

export default function Home() {
  const { setPendingQuery, setPendingCardId, narration, setNarration } = useAppContext();
  const uiV2 = useUiV2();   // U38: ?ui=v2 — 새 shell(답변/근거/데이터). v1은 그대로 유지.
  const [tourNonce, setTourNonce] = useState(0);   // U38 P0-1: 투어는 명시 버튼으로만
  const [railOpen, setRailOpen] = useState(false);   // U38b: 시나리오 레일(헤더 버튼식 — v2에서 이식)

  const handleSelect = useCallback(
    (query: string, narr: { title: string; text: string }, presetCardId?: string) => {
      setNarration(narr);
      setPendingCardId(presetCardId);
      setPendingQuery(query);
      setRailOpen(false);
    },
    [setPendingQuery, setPendingCardId, setNarration],
  );

  if (uiV2) return <AppShellV2 />;

  return (
    <>
      <LiquidBackground />
      <TourController trigger={tourNonce} />
      {railOpen && <ScenarioRail onSelect={handleSelect} onClose={() => setRailOpen(false)} />}
      <DualPanelLayout
        header={
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <h1 className="shrink-0 font-display text-lg" style={{ color: 'var(--pearl)' }}>
                AI-Ready Data Platform <span style={{ color: 'var(--jade)' }}>· Card Ontology</span>
              </h1>
              {/* U38b: 선택된 시나리오 컨텍스트 한 줄(픽커가 레일로 빠진 자리) */}
              {narration && (
                <span className="min-w-0 truncate text-[13px]" style={{ color: 'var(--aqua)' }}
                  data-testid="scenario-context">
                  📌 {narration.title}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {/* U53: 데모 시나리오 데이터 캐싱(발표 전 1회 — 응답 지연 제거) */}
              <CacheWarmButton />
              <button onClick={() => setRailOpen(true)}
                className="min-h-11 rounded-[var(--r-pill)] px-4 text-[13px] font-medium"
                style={{ background: 'var(--flow)', color: '#06121a' }}
                data-testid="scenario-rail-button">
                📋 시나리오
              </button>
              <button onClick={() => setTourNonce((n) => n + 1)}
                className="min-h-11 rounded-[var(--r-pill)] px-3 text-[13px]"
                style={{ background: 'var(--ink-700)', color: 'var(--mist)' }}
                data-testid="tour-button">
                ❓ 가이드
              </button>
            </div>
          </div>
        }
        leftPanel={
          <div className="flex h-full flex-col gap-2 p-2" data-tour="chat">
            {/* v3: 카테고리 안내 배너(DemoNarration)·여정 진행표시(JourneyProgress) 숨김 — 채팅 내용 가시성 확보 */}
            {/* U56: 오프닝 대비 장면은 ChatPanel이 소유한다 — messages/isLoading을 아는
                쪽에서 렌더해야 "질문하면 즉시 사라진다". 여기서 `!annotation`으로 걸면
                annotation이 스트림 끝에 오므로 질문 후에도 남아 채팅을 밀어냈다. */}
            <div className="flex-1 min-h-0">
              <ChatPanel />
            </div>
          </div>
        }
        rightPanel={<div data-tour="asset-map" className="h-full"><AssetMapPanel /></div>}
        footer={
          <div className="flex items-center justify-between text-xs" style={{ color: 'var(--mist)' }}>
            <span>
              <span style={{ color: 'var(--aqua)' }}>데이터</span>(자산 지도) ·
              <span style={{ color: 'var(--jade)' }}> 로직</span>(온톨로지·규칙엔진) ·
              <span style={{ color: 'var(--pearl)' }}> 액션</span>(설명가능한 답변)
            </span>
            <span>
              {/* U63 P1: 채팅 소실 진단 표시(원인 확정 후 제거) */}
              <ChatDiagLine />
              {' · '}us-west-2 · orchestrated · build {process.env.NEXT_PUBLIC_BUILD_SHA ?? 'dev'}
            </span>
          </div>
        }
      />
    </>
  );
}
