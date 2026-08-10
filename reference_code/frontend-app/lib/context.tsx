'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type {
  PlatformAnnotation, SourceGrade,
  LightingState, GovernanceBadge, ReasoningTrace,
} from './types';
import { IDLE_LIGHTING } from './asset-map';

interface DrilldownSelection { kind: 'node' | 'bridge'; id: string }

// U22 B2(FR-2c): 여정(마케터 멀티스텝) 진행 상태 — 질문 클릭 시 스텝 인덱스 추적.
export interface JourneyStep { id: string; title: string; query: string; presetCardId?: string }
export interface JourneyState {
  categoryId: string;
  categoryTitle: string;
  stepIndex: number;          // 0-based 현재 스텝
  steps: JourneyStep[];
}

interface AppContextValue {
  scenarioId: string | undefined;
  setScenarioId: (id: string | undefined) => void;

  // U6 platform demo state
  annotation: PlatformAnnotation | undefined;
  setAnnotation: (a: PlatformAnnotation | undefined) => void;
  dominant: SourceGrade;
  setDominant: (g: SourceGrade) => void;
  pendingQuery: string | undefined;
  setPendingQuery: (q: string | undefined) => void;
  pendingCardId: string | undefined;
  setPendingCardId: (c: string | undefined) => void;
  narration: { title: string; text: string } | undefined;
  setNarration: (n: { title: string; text: string } | undefined) => void;

  // U13 자산 지도 상태
  lighting: LightingState;
  setLighting: (l: LightingState) => void;
  badges: Map<string, GovernanceBadge>;
  setBadges: (b: Map<string, GovernanceBadge>) => void;
  drilldownSelection: DrilldownSelection | null;
  setDrilldownSelection: (s: DrilldownSelection | null) => void;
  reasoningTrace: ReasoningTrace | undefined;
  setReasoningTrace: (t: ReasoningTrace | undefined) => void;

  // U16 2번: 본문 cite pill 클릭 → 자산지도 다리 점등 전용 신호(ChatPanel의 messages effect와 분리 —
  // lighting/drilldownSelection을 직접 건드리면 그 effect 재발동으로 무한 루프). AssetMapPanel만 구독.
  citeFocus: { bridgeId: string; nodeIds: string[]; nonce: number } | null;
  setCiteFocus: (f: { bridgeId: string; nodeIds: string[]; nonce: number } | null) => void;

  // U22 B2(FR-2c): 여정 진행표시("①→⑧ 중 ③") — ScenarioPicker가 설정, JourneyProgress가 소비
  journey: JourneyState | undefined;
  setJourney: (j: JourneyState | undefined) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [scenarioId, setScenarioId] = useState<string | undefined>();
  const [annotation, setAnnotation] = useState<PlatformAnnotation | undefined>();
  const [dominant, setDominant] = useState<SourceGrade>('공개-실');
  const [pendingQuery, setPendingQuery] = useState<string | undefined>();
  const [pendingCardId, setPendingCardId] = useState<string | undefined>();
  const [narration, setNarration] = useState<{ title: string; text: string } | undefined>();

  const [lighting, setLighting] = useState<LightingState>(IDLE_LIGHTING);
  const [badges, setBadges] = useState<Map<string, GovernanceBadge>>(new Map());
  const [drilldownSelection, setDrilldownSelection] = useState<DrilldownSelection | null>(null);
  const [reasoningTrace, setReasoningTrace] = useState<ReasoningTrace | undefined>();
  const [citeFocus, setCiteFocus] = useState<{ bridgeId: string; nodeIds: string[]; nonce: number } | null>(null);
  const [journey, setJourney] = useState<JourneyState | undefined>();

  // U43(#185): value를 인라인 객체로 두면 AppProvider가 리렌더될 때마다 새 참조가 되어
  // 전 구독자(ReactFlow 캔버스 포함)가 무조건 리렌더된다. 실제 상태가 바뀔 때만 새 객체.
  const value = useMemo(() => ({
    scenarioId, setScenarioId,
    annotation, setAnnotation,
    dominant, setDominant,
    pendingQuery, setPendingQuery,
    pendingCardId, setPendingCardId,
    narration, setNarration,
    lighting, setLighting,
    badges, setBadges,
    drilldownSelection, setDrilldownSelection,
    reasoningTrace, setReasoningTrace,
    citeFocus, setCiteFocus,
    journey, setJourney,
  }), [
    scenarioId, annotation, dominant, pendingQuery, pendingCardId, narration,
    lighting, badges, drilldownSelection, reasoningTrace, citeFocus, journey,
  ]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
