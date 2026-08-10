'use client';

// U38 — 근거 인스펙터: "어떻게 답했나"의 수직 narrative(계획 v2 §3.3).
// ① 라우팅 결정 ② 데이터 연결 ③ 변환/규칙 ④ 검증 — 각 단계 한 줄 요약 기본,
// 선택한 단계만 상세 펼침(한 번에 하나 — 정보 예산 L1).
// 기존 뷰(ChainView·AnatomyView·RealNodeGraph·RoutePlanView·CitationPanel·MetricPanel)는
// 이 narrative의 렌더러 — 제거 0(inventory 도달성).
import { useMemo, useState } from 'react';
import type { PlatformAnnotation, ChainResult } from '@/lib/types';
import { ChainView } from '@/components/showcase/ChainView';
import { AnatomyView } from '@/components/showcase/AnatomyView';
import { RealNodeGraph } from '@/components/graph/RealNodeGraph';
import { RoutePlanView } from '@/components/showcase/RoutePlanView';
import { CitationPanel } from '@/components/showcase/CitationPanel';
import { MetricPanel } from '@/components/showcase/MetricPanel';
import { buildAnatomy, fetchAnatomyData, type AnatomyData } from '@/lib/anatomy';
import { useEffect } from 'react';

const TIER_LABEL: Record<string, { label: string; desc: string; color: string }> = {
  tier1_rule: { label: 'T1 규칙', desc: '결정론 — LLM이 경로를 정하지 않았습니다', color: 'var(--jade)' },
  tier2_semantic: { label: 'T2 시맨틱', desc: '결정론 — 사전 승인된 예문 유사도로 라우팅', color: 'var(--aqua)' },
  tier3_llm: { label: 'T3 LLM', desc: 'LLM 분류 — 단, 실행은 승인 템플릿만', color: 'var(--amber)' },
};

type StepId = 'routing' | 'connection' | 'transform' | 'validation';

export function EvidenceInspector({ annotation }: { annotation: PlatformAnnotation | undefined }) {
  const [openStep, setOpenStep] = useState<StepId | null>(null);
  const [anatomyData, setAnatomyData] = useState<AnatomyData | null>(null);
  useEffect(() => { fetchAnatomyData().then(setAnatomyData); }, []);

  const cit = annotation?.citation as Record<string, unknown> | undefined;
  const chain = cit?.chain as ChainResult | null | undefined;
  const anatomy = useMemo(() => buildAnatomy(annotation, anatomyData), [annotation, anatomyData]);

  if (!annotation) {
    return (
      <div className="p-6 text-center" style={{ color: 'var(--mist)', fontSize: 'var(--fs-meta)' }}
        data-testid="v2-evidence-empty">
        질문하면 이 답이 <strong style={{ color: 'var(--pearl)' }}>어떻게 만들어졌는지</strong> 단계별로 표시됩니다.
      </div>
    );
  }

  const tierId = (annotation.route_plan as { selected_tier?: string } | undefined)?.selected_tier ?? '';
  const tier = TIER_LABEL[tierId];
  const templateIds = (annotation.route_plan?.template_ids ?? []).filter(Boolean);
  const hasGraph = !!(cit?.graph_paths as unknown[] | undefined)?.length;
  const conclusion = chain?.conclusion;

  // 단계별 (요약, 상세 렌더러, 존재 여부)
  const steps: Array<{ id: StepId; n: string; title: string; summary: string; body: React.ReactNode; present: boolean }> = [
    {
      id: 'routing', n: '①', title: '라우팅 결정',
      summary: tier ? `${tier.label} — ${tier.desc}` : '라우팅 정보 미제공',
      present: true,
      body: (
        <div className="space-y-3">
          {tier && (
            <div className="rounded-[var(--r-md)] border p-3" style={{ borderColor: tier.color }}>
              <span className="rounded-[var(--r-pill)] px-3 py-1 font-semibold"
                style={{ background: tier.color, color: '#06121a', fontSize: 'var(--fs-meta)' }}>
                {tier.label}
              </span>
              <p className="mt-2" style={{ fontSize: 'var(--fs-meta)' }}>{tier.desc}</p>
            </div>
          )}
          <p style={{ fontSize: 'var(--fs-fine)', color: 'var(--mist)' }}>
            raw SQL/Gremlin 없음 — 실행은 사전 승인된 템플릿만: {templateIds.join(', ') || '(없음)'}
          </p>
          <RoutePlanView plan={annotation.route_plan} audit={annotation.audit} />
        </div>
      ),
    },
    {
      id: 'connection', n: '②', title: '데이터 연결',
      summary: chain?.status === 'ok'
        ? `${chain.n_datasets}개 데이터셋 · ${chain.n_hops}-hop 관통`
        : anatomy ? anatomy.mismatchCaption.slice(0, 60) : hasGraph ? '카드 그래프 경로 조회' : '단일 자산 조회',
      present: !!(chain?.status === 'ok' || anatomy || hasGraph),
      body: chain?.status === 'ok'
        ? <ChainView chain={chain} />
        : anatomy ? <AnatomyView anatomy={anatomy} />
        : hasGraph ? <RealNodeGraph annotation={annotation} /> : null,
    },
    {
      id: 'transform', n: '③', title: '변환·규칙',
      summary: cit?.rule_trace ? '약관 규칙엔진 판정(실약관 조항 근거)'
        : (cit?.metrics as unknown[] | undefined)?.length ? '시맨틱 지표(정의·버전 거버넌스)'
        : (cit?.doc_chunks as unknown[] | undefined)?.length ? '약관 원문 검색 근거'
        : '이 답변에는 규칙/지표 변환 없음',
      present: !!(cit?.rule_trace || (cit?.metrics as unknown[] | undefined)?.length
                  || (cit?.doc_chunks as unknown[] | undefined)?.length),
      body: (
        <div className="space-y-3">
          {(cit?.rule_trace || (cit?.doc_chunks as unknown[] | undefined)?.length) ?
            <CitationPanel citation={annotation.citation} /> : null}
          {(cit?.metrics as unknown[] | undefined)?.length ?
            <MetricPanel metrics={annotation.citation?.metrics} /> : null}
        </div>
      ),
    },
    {
      id: 'validation', n: '④', title: '검증',
      summary: conclusion
        ? `결론 성격: ${conclusion.finding_kind === 'observation' ? '관측(데이터가 직접 보여줌)' : '가설(개연성 — 단정 아님)'}`
        : annotation.unsupported ? '근거 부족 — 정직하게 답변 보류(fail-closed)'
        : (annotation.disclaimers?.length ? `고지 ${annotation.disclaimers.length}건 동반` : '인용 도달성 검증 통과'),
      present: true,
      body: (
        <div className="space-y-2">
          {conclusion && (
            <div className="rounded-[var(--r-md)] border-2 p-3"
              style={{ borderColor: conclusion.finding_kind === 'observation' ? 'var(--jade)' : 'var(--amber)' }}>
              <span style={{ fontSize: 'var(--fs-fine)', color: 'var(--mist)' }}>
                {conclusion.finding_kind === 'observation' ? '관측' : '가설'}
              </span>
              <p style={{ fontSize: 'var(--fs-meta)' }}>{conclusion.text}</p>
            </div>
          )}
          {(annotation.disclaimers ?? []).map((d) => (
            <p key={d} style={{ fontSize: 'var(--fs-meta)', color: 'var(--amber)' }}>⚠️ {d}</p>
          ))}
          {(chain?.caveats ?? []).map((c) => (
            <p key={c} style={{ fontSize: 'var(--fs-meta)', color: 'var(--mist)' }}>· {c}</p>
          ))}
          {!conclusion && !annotation.disclaimers?.length && !chain?.caveats?.length && (
            <p style={{ fontSize: 'var(--fs-meta)', color: 'var(--mist)' }}>
              모든 인용이 실제 조회 결과에 도달 가능함을 확인했습니다(fail-closed 정책).
            </p>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3" data-testid="v2-evidence">
      {steps.map((s) => {
        const open = openStep === s.id;
        return (
          <div key={s.id} className="rounded-[var(--r-md)] border"
            style={{ borderColor: open ? 'var(--flow-solid)' : 'var(--ink-600)', background: 'var(--ink-800)' }}>
            <button onClick={() => setOpenStep(open ? null : s.id)}
              disabled={!s.present}
              className="flex min-h-12 w-full items-center gap-3 px-3 text-left"
              aria-expanded={open} data-testid={`v2-ev-step-${s.id}`}>
              <span className="shrink-0 font-semibold" style={{ color: 'var(--flow-solid)', fontSize: 'var(--fs-title)' }}>{s.n}</span>
              <span className="shrink-0 font-medium" style={{ fontSize: 'var(--fs-body)' }}>{s.title}</span>
              <span className="min-w-0 flex-1 truncate"
                style={{ fontSize: 'var(--fs-meta)', color: s.present ? 'var(--mist)' : 'var(--slate)' }}>
                {s.summary}
              </span>
              {s.present && <span style={{ color: 'var(--mist)' }}>{open ? '▲' : '▼'}</span>}
            </button>
            {open && s.present && (
              <div className="max-h-[55vh] overflow-y-auto border-t p-2" style={{ borderColor: 'var(--ink-600)' }}>
                {s.body}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
