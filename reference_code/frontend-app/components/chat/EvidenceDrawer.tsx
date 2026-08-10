'use client';

// U17 §5 — 근거 서랍: 기존 5위젯(토큰/출처/과정/사슬/차트 잔여)을 접힌 서랍 1개로 통폐합.
// 기본 접힘. 열면 섹션 4+α: 이해한 질문 / 사용 데이터·출처 / 과정 / 연결 상세 / 차트 더 보기.

import { useState } from 'react';
import type { PlatformAnnotation, InsightCard, Subgraph } from '@/lib/types';
import { translateToken } from '@/lib/answer-composition';
import { ReasoningTrace as ReasoningTraceView } from './ReasoningTrace';
import { CrosswalkChain } from './CrosswalkChain';
import { ProvenanceBadges } from './ProvenanceBadges';
import { InsightCardList } from './InsightCardList';
import { MessageTrace } from './MessageTrace';
import type { ReasoningTrace } from '@/lib/types';

interface EvidenceDrawerProps {
  annotation?: PlatformAnnotation;
  trace?: ReasoningTrace;
  restInsights: InsightCard[];
  subgraph?: Subgraph;
  highlightedNode?: string | null;
  onHighlightClear?: () => void;
  forceOpen?: boolean;   // 경로 한 줄 클릭 시 외부에서 오픈
  onForceClear?: () => void;   // U22 A2: 서랍 버튼으로 닫을 때 상위 forced 해제(닫힘 고착 수리)
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-2 first:pt-0">
      <div className="text-[13px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--slate)' }}>{title}</div>
      {children}
    </div>
  );
}

export function EvidenceDrawer({
  annotation, trace, restInsights, subgraph, highlightedNode, onHighlightClear, forceOpen, onForceClear,
}: EvidenceDrawerProps) {
  const [open, setOpen] = useState(false);
  const isOpen = open || !!forceOpen;
  // U22 A2: forced 상태에서 버튼으로 닫기 — 상위 forced 해제 + 로컬 close(닫힘 고착 수리)
  const toggle = () => {
    if (isOpen && forceOpen) onForceClear?.();
    setOpen(!isOpen);
  };

  const tokens = (annotation?.route_plan?.understood_tokens ?? []).map(translateToken);
  const provenance = annotation?.citation?.provenance;
  const crosswalk = annotation?.ontology;
  const coveredPct = (annotation?.citation as { market?: { meta?: { crosswalk_covered_pct?: number } } } | undefined)
    ?.market?.meta?.crosswalk_covered_pct;
  const hasNodes = !!(subgraph && subgraph.nodes.length > 0);

  // 섹션 수(뱃지에 표기) — 있는 것만 카운트
  const n = [tokens.length > 0, !!provenance?.length, !!trace?.toolSteps?.length,
    !!(crosswalk?.crosswalk?.length || hasNodes), restInsights.length > 0].filter(Boolean).length;
  if (n === 0) return null;

  return (
    <div className="mt-2 text-[13px]" data-testid="evidence-drawer">
      <button
        onClick={toggle}
        aria-expanded={isOpen}
        className="inline-flex items-center gap-1 rounded-[var(--r-pill)] px-2.5 py-1"
        style={{ background: 'var(--ink-700)', color: 'var(--mist)', border: '1px solid var(--ink-600)' }}
      >
        <span>{isOpen ? '▾' : '▸'}</span>
        <span>근거 및 과정 ({n})</span>
      </button>
      {isOpen && (
        <div className="mt-1.5 rounded-[var(--r-md)] px-3 py-2 space-y-1"
          style={{ background: 'var(--ink-900)', border: '1px solid var(--ink-600)' }}>
          {tokens.length > 0 && (
            <Section title="이해한 질문">
              <div className="flex flex-wrap gap-1">
                {tokens.map((t, i) => {
                  const missing = t.label === '미결정';
                  return (
                    <span key={i} className="rounded-[var(--r-pill)] px-2 py-0.5"
                      style={{
                        background: 'var(--ink-700)',
                        color: missing ? 'var(--amber)' : 'var(--pearl)',
                        border: `1px solid ${missing ? 'var(--amber)' : 'var(--ink-600)'}`,
                      }}>
                      {missing ? `질문에서 못 정한 부분: ${t.value}` : `${t.label} · ${t.value}`}
                    </span>
                  );
                })}
              </div>
            </Section>
          )}
          {!!provenance?.length && (
            <Section title="사용 데이터 · 출처">
              <ProvenanceBadges provenance={provenance} />
              {/* U19 R3: SMUS 카탈로그 실시간 정의(있으면) — P-원칙1 화면 도달 */}
              {(annotation?.catalog?.terms ?? []).length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {annotation!.catalog!.terms.map((t, i) => (
                    <div key={i} className="rounded-[var(--r-md)] px-2 py-1"
                      style={{ background: 'var(--ink-800)', border: '1px solid var(--ink-600)' }}>
                      <span style={{ color: 'var(--jade)', fontSize: 'var(--fs-fine)' }}>📖 {t.name}</span>
                      <span style={{ color: 'var(--pearl)', marginLeft: 6 }}>{t.definition}</span>
                      <span style={{ color: 'var(--slate)', fontSize: 'var(--fs-fine)', marginLeft: 6 }}>
                        {annotation!.catalog!.source?.includes('smus') ? 'SMUS 카탈로그(실시간)' : '카탈로그 캐시'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}
          {!!trace?.toolSteps?.length && (
            <Section title="과정">
              <ReasoningTraceView trace={trace} />
            </Section>
          )}
          {!!(crosswalk?.crosswalk?.length || hasNodes) && (
            <Section title="연결 상세">
              <CrosswalkChain ontology={crosswalk} coveredPct={coveredPct} />
              {hasNodes && (
                <MessageTrace subgraph={subgraph!} highlightedNode={highlightedNode} onHighlightClear={onHighlightClear} />
              )}
            </Section>
          )}
          {restInsights.length > 0 && (
            <Section title={`차트 더 보기 (${restInsights.length})`}>
              <InsightCardList insights={restInsights} />
            </Section>
          )}
        </div>
      )}
    </div>
  );
}
