'use client';

// U17 §1 — 답변 3층 조립기: ① 본문 ② 경로 한 줄 🧭 ③ 근거 서랍 + "다음은?" 제안.
// ChatMessage에서 어시스턴트 답변 조립을 이관. 상단 pill(뱃지/토큰)은 제거 —
// 신뢰 신호는 경로 한 줄 접두(✓/◌), 토큰은 서랍 [이해한 질문]으로.

import React, { useState, useCallback, useRef } from 'react';
import { useAppContext } from '@/lib/context';
import { resolveCiteBridge } from '@/lib/asset-map';
import { buildPathLine, splitInsights } from '@/lib/answer-composition';
import { buildNextSuggestions } from '@/lib/next-suggestions';
import { MarkdownContent } from './MarkdownContent';
import { EvidenceDrawer } from './EvidenceDrawer';
import { InsightCardList } from './InsightCardList';
import { DisclaimerBanner } from './ProvenanceBadges';
import type { PlatformAnnotation, ReasoningTrace as Trace } from '@/lib/types';

// annotation → 완료 ReasoningTrace (기존 ChatMessage.buildTrace 이관 — 단일 소스)
export function buildTrace(ann: PlatformAnnotation | undefined): Trace | undefined {
  if (!ann) return undefined;
  const toolCalls = (ann.tool_calls ?? []) as Array<Record<string, unknown>>;
  if (!toolCalls.length) return undefined;
  return {
    phase: 'complete',
    intent: ann.route_plan?.intent,
    selectedTier: (ann.route_plan as { selected_tier?: string } | undefined)?.selected_tier,
    passed: !ann.unsupported,
    disclaimers: ann.disclaimers,
    toolSteps: toolCalls.map((t) => ({
      tool: String(t.tool ?? 'tool'),
      templateId: t.template_id as string | undefined,
      status: String(t.status ?? 'done'),
      resultSummary: (t.result_summary as string | undefined)
        ?? (t.row_count != null || t.result_count != null
          ? `rows=${t.row_count ?? 0} results=${t.result_count ?? 0}` : undefined),
    })),
  };
}

// U16: annotation.ontology → 본문 자동 pill화 라벨 (기존 로직 이관)
type OntoShape = {
  categories?: Array<{ label?: string }>;
  closure_path?: string[];
  crosswalk?: Array<{ from_label?: string; to_label?: string }>;
};
function _collectOnto(onto: unknown, out: Set<string>): void {
  if (!onto || typeof onto !== 'object') return;
  const o = onto as OntoShape;
  for (const c of o.categories ?? []) if (c.label) out.add(c.label);
  for (const c of o.closure_path ?? []) if (c) out.add(c);
  for (const x of o.crosswalk ?? []) {
    if (x.from_label) out.add(x.from_label);
    if (x.to_label) out.add(x.to_label);
  }
}
function ontologyLabelsFrom(ann: PlatformAnnotation | undefined): string[] {
  const out = new Set<string>();
  _collectOnto(ann?.ontology, out);
  _collectOnto((ann?.citation as { ontology?: unknown } | undefined)?.ontology, out);
  return [...out].sort((a, b) => b.length - a.length);
}

interface AnswerShellProps {
  content: string;
  annotation?: PlatformAnnotation;
  onSuggestion?: (query: string) => void;
}

export function AnswerShell({ content, annotation, onSuggestion }: AnswerShellProps) {
  const { setCiteFocus, journey, setJourney } = useAppContext();
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null);
  const [drawerForced, setDrawerForced] = useState(false);
  const nonceRef = useRef(0);

  const ontologyLabels = React.useMemo(() => ontologyLabelsFrom(annotation), [annotation]);
  const pathLine = React.useMemo(() => buildPathLine(annotation), [annotation]);
  const { primary, rest } = React.useMemo(() => splitInsights(annotation?.insights), [annotation]);
  const suggestions = React.useMemo(() => buildNextSuggestions(annotation), [annotation]);
  const trace = React.useMemo(() => buildTrace(annotation), [annotation]);

  const focusBridge = useCallback((bridgeId?: string, nodeIds?: string[]) => {
    if (!bridgeId && !nodeIds?.length) return;
    nonceRef.current += 1;
    setCiteFocus({ bridgeId: bridgeId ?? '', nodeIds: nodeIds ?? [], nonce: nonceRef.current });
  }, [setCiteFocus]);

  const handleCitationClick = useCallback((ref: string) => {
    setHighlightedNode(ref);
    setDrawerForced(true);   // 근거 pill 클릭 → 서랍 열어 근거 노드 노출
    const isOntoLabel = ontologyLabels.includes(ref);
    const bridge = resolveCiteBridge(ref, isOntoLabel);
    if (bridge) focusBridge(bridge.bridgeId, bridge.nodeIds);
  }, [ontologyLabels, focusBridge]);

  // ② 경로 한 줄 클릭 → 서랍 오픈 + 지도 포커스 (§1)
  const handlePathClick = useCallback(() => {
    setDrawerForced((f) => !f);
    if (pathLine) focusBridge(pathLine.bridgeId, pathLine.nodeIds);
  }, [pathLine, focusBridge]);

  // U43(#185): 인라인 화살표를 넘기면 EvidenceDrawer→MessageTrace의 effect 의존성이
  // 매 렌더 churn한다(타이머 재생성 루프). 참조를 고정.
  const handleHighlightClear = useCallback(() => setHighlightedNode(null), []);
  const handleForceClear = useCallback(() => setDrawerForced(false), []);

  return (
    <>
      {/* ① 본문 */}
      <MarkdownContent
        content={content}
        onCitationClick={handleCitationClick}
        ontologyLabels={ontologyLabels}
        className="chat-markdown"
      />

      {/* U38 L0 신뢰 줄 — tier + 출처 등급 상시(서랍 밖). 모든 답변 반복 노출이 곧 서사. */}
      {annotation?.route_plan?.selected_tier && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="trust-line"
          style={{ fontSize: 'var(--fs-meta, 13px)' }}>
          <TierBadge tier={annotation.route_plan.selected_tier} />
          <GradeSummary annotation={annotation} />
        </div>
      )}

      {/* ② 경로 한 줄 */}
      {pathLine && (
        <button
          onClick={handlePathClick}
          data-testid="path-line"
          className="mt-2 flex w-full items-start gap-1.5 rounded-[var(--r-md)] px-2.5 py-1.5 text-left text-[13px] transition-colors"
          style={{ background: 'var(--ink-900)', border: '1px solid var(--ink-600)', color: 'var(--pearl)' }}
        >
          <span style={{ color: pathLine.verified ? 'var(--jade)' : 'var(--slate)' }}>
            {pathLine.verified ? '✓🧭' : '◌🧭'}
          </span>
          <span className="flex-1">
            {pathLine.text}
            {!pathLine.verified && <span style={{ color: 'var(--slate)' }}> (AI 생성)</span>}
            <span style={{ color: 'var(--slate)' }}> — 근거 보기</span>
          </span>
        </button>
      )}

      {/* (조건부) 대표 차트 1개 */}
      {primary && <InsightCardList insights={[primary]} />}

      {/* ③ 근거 서랍 */}
      <EvidenceDrawer
        annotation={annotation}
        trace={trace}
        restInsights={rest}
        subgraph={annotation?.subgraph}
        highlightedNode={highlightedNode}
        onHighlightClear={handleHighlightClear}
        forceOpen={drawerForced}
        onForceClear={handleForceClear}
      />

      {/* U40: chain 답변은 본문 '판단 한계'가 caveat 단일 소스 — 배너 중복 억제 */}
      {!(annotation?.citation as { chain?: { status?: string } } | undefined)?.chain?.status && (
        <DisclaimerBanner disclaimers={annotation?.disclaimers} />
      )}

      {/* 다음은? — capability 확장의 시각화 (§3). U22 B2: 여정 중이면 다음 스텝을 최우선 강조 */}
      {(suggestions.length > 0 || (journey && journey.stepIndex + 1 < journey.steps.length)) && onSuggestion && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5" data-testid="next-suggestions">
          <span className="text-[13px]" style={{ color: 'var(--slate)' }}>다음은?</span>
          {journey && journey.stepIndex + 1 < journey.steps.length && (
            <button
              data-testid="journey-next-suggestion"
              onClick={() => {
                const next = journey.steps[journey.stepIndex + 1];
                setJourney({ ...journey, stepIndex: journey.stepIndex + 1 });
                onSuggestion(next.query);
              }}
              className="rounded-[var(--r-pill)] px-2.5 py-1 text-[13px] font-medium transition-colors hover:brightness-125"
              style={{ background: 'var(--ink-700)', border: '1px solid #fbbf24', color: '#fbbf24' }}>
              ★ 여정 계속: {journey.steps[journey.stepIndex + 1].title} →
            </button>
          )}
          {suggestions.map((s, i) => (
            <button key={i} onClick={() => onSuggestion(s.query)}
              className="rounded-[var(--r-pill)] px-2.5 py-1 text-[13px] transition-colors hover:brightness-125"
              style={{ background: 'var(--ink-700)', border: '1px solid var(--aqua)', color: 'var(--aqua)' }}>
              {s.label} →
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// U38 — L0 신뢰 줄 구성요소
const _TIER = {
  tier1_rule: { label: '⚡ T1 규칙 라우팅', color: 'var(--jade)', title: '결정론 — LLM이 경로를 정하지 않음' },
  tier2_semantic: { label: '🎯 T2 시맨틱 라우팅', color: 'var(--aqua)', title: '결정론 — 승인 예문 유사도' },
  tier3_llm: { label: '🤖 T3 LLM 분류', color: 'var(--amber)', title: 'LLM 분류 — 실행은 승인 템플릿만' },
} as const;

function TierBadge({ tier }: { tier: string }) {
  const t = _TIER[tier as keyof typeof _TIER];
  if (!t) return null;
  return (
    <span className="rounded-[var(--r-pill)] px-2.5 py-1 font-medium" title={t.title}
      style={{ background: 'var(--ink-700)', border: `1px solid ${t.color}`, color: t.color }}>
      {t.label}
    </span>
  );
}

const _GRADE_COLOR: Record<string, string> = {
  '공개-실': 'var(--jade)', '집계': 'var(--aqua)', '합성': 'var(--amber)', '추정': 'var(--coral)',
};

function GradeSummary({ annotation }: { annotation?: PlatformAnnotation }) {
  const prov = annotation?.citation?.provenance ?? [];
  if (!prov.length) return null;
  const counts = new Map<string, number>();
  for (const p of prov) {
    // source가 등급 문자열이 아니면(기관 설명 등) '집계'로 정규화하지 않고 스킵 — 추측 금지
    const g = Object.keys(_GRADE_COLOR).find((k) => (p.source ?? '').includes(k));
    if (g) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  if (!counts.size) return null;
  return (
    <span className="flex items-center gap-1.5">
      {[...counts.entries()].map(([g, n]) => (
        <span key={g} className="rounded-[var(--r-pill)] px-2 py-1"
          style={{ background: 'var(--ink-700)', color: _GRADE_COLOR[g] }}>
          {g} {n}
        </span>
      ))}
    </span>
  );
}
