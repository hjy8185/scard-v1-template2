'use client';

// U38b — 데이터 흐름 탭: "이 답이 어떤 데이터를 어떻게 걸어서 나왔나"의 가로 흐름도.
// 멀티홉(chain)이면 hop 순서 그대로 자산 카드 → 다리 화살표 → 자산 카드,
// 일반 답변이면 사용 자산(DataAssetEvidence)을 연결 순서로 배치.
// 각 카드: 자산명 + 등급 뱃지 + 이 hop의 핵심 실측값(크게) + 실제 행(펼침).
// 세로 타임라인(ChainView)과 달리 "데이터가 왼→오로 흐른다"가 한눈에 보이는 것이 목적.
import { useMemo, useState } from 'react';
import type { PlatformAnnotation, ChainResult, ChainHop } from '@/lib/types';
import { buildAssetEvidence } from '@/lib/asset-evidence';
import { hopHeadline, edgeShort } from '@/lib/chain-presentation';

const GRADE_COLOR: Record<string, string> = {
  '공개-실': 'var(--jade)', '공개-집계': 'var(--aqua)', '집계': 'var(--aqua)',
  '합성': 'var(--amber)', '합성-근거': 'var(--amber)', '추정': 'var(--coral)',
};
const KIND_TO_GRADE: Record<string, string> = {
  'public-real': '공개-실', aggregate: '집계', synthetic: '합성', estimated: '추정', unknown: '미확인',
};

interface FlowNode {
  id: string;
  title: string;          // 자산/단계 이름
  grade: string;
  headline?: string;      // 핵심 실측값 1개(크게)
  detail?: string;        // 부가 1줄
  rows?: Array<Record<string, unknown>>;
  rowsKind?: 'used' | 'representative';
}
interface FlowEdge { label: string }   // 다리(조인) 라벨

function buildFlow(ann: PlatformAnnotation | undefined): { nodes: FlowNode[]; edges: FlowEdge[]; conclusion?: ChainResult['conclusion']; caveats?: string[] } {
  const chain = (ann?.citation as { chain?: ChainResult | null } | undefined)?.chain;
  if (chain?.status === 'ok' && chain.hops?.length) {
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    for (const [i, h] of chain.hops.entries()) {
      const { headline, detail } = hopHeadline(h);
      nodes.push({
        id: h.id, title: h.to_entity, grade: h.grade, headline, detail,
        rows: (h.rows ?? []) as Array<Record<string, unknown>>,
        rowsKind: 'used',
      });
      if (i < chain.hops.length - 1) edges.push({ label: edgeShort(chain.hops[i + 1].edge_type) });
    }
    // 출발 노드(첫 hop의 from) 프리펜드
    nodes.unshift({ id: '_from', title: chain.hops[0].from_entity, grade: chain.hops[0].grade });
    edges.unshift({ label: edgeShort(chain.hops[0].edge_type) });
    return { nodes, edges, conclusion: chain.conclusion, caveats: chain.caveats };
  }
  // 일반 답변: 자산 증거를 흐름으로(2개 이상일 때만 의미)
  const evs = buildAssetEvidence(ann);
  const nodes: FlowNode[] = evs.map((e) => ({
    id: e.assetId, title: e.displayName, grade: KIND_TO_GRADE[e.source.sourceKind] ?? '미확인',
    headline: e.scale?.displayText?.split(' · ')[0], detail: e.roleInAnswer,
    rows: e.sampleRows, rowsKind: e.sampleKind === 'used-in-answer' ? 'used' : 'representative',
  }));
  // U39 P0-4: 목록 순서는 관계가 아님 — 일반 답변엔 화살표를 만들지 않는다(빈 라벨 = 미표시)
  const edges: FlowEdge[] = nodes.slice(1).map(() => ({ label: '' }));
  return { nodes, edges };
}

export function DataFlowView({ annotation }: { annotation: PlatformAnnotation | undefined }) {
  const { nodes, edges, conclusion, caveats } = useMemo(() => buildFlow(annotation), [annotation]);
  const [openRows, setOpenRows] = useState<string | null>(null);

  if (nodes.length < 2) return null;

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4" data-testid="dataflow-view">
      <div className="mb-3" style={{ fontSize: 'var(--fs-meta)', color: 'var(--mist)' }}>
        이 답을 만든 데이터의 흐름 — <strong style={{ color: 'var(--pearl)' }}>{nodes.length}개 데이터</strong>를
        온톨로지 연결로 이어 답변을 만들었습니다 (왼쪽 → 오른쪽)
      </div>

      {/* 가로 흐름도 — 카드와 화살표가 한 줄로 흐름(넘치면 가로 스크롤: 의도된 캔버스) */}
      <div className="flex items-stretch gap-0 overflow-x-auto pb-3" data-testid="dataflow-track">
        {nodes.map((n, i) => {
          const color = GRADE_COLOR[n.grade] ?? 'var(--slate)';
          const hasRows = (n.rows?.length ?? 0) > 0;
          const open = openRows === n.id;
          return (
            <div key={n.id} className="flex items-stretch">
              {/* 자산 카드 */}
              <div className="flex w-44 shrink-0 flex-col rounded-[var(--r-md)] border-2 p-3"
                style={{ borderColor: color, background: 'var(--ink-800)' }}
                data-testid={`dataflow-node-${n.id}`}>
                <div className="flex items-start justify-between gap-1">
                  <span className="font-medium leading-tight" style={{ fontSize: 'var(--fs-meta)' }}>{n.title}</span>
                  <span className="shrink-0 rounded-[var(--r-pill)] px-1.5 py-0.5"
                    style={{ background: 'var(--ink-600)', color, fontSize: '11px' }}>
                    {n.grade}
                  </span>
                </div>
                {n.headline && (
                  <div className="mt-2 font-semibold tabular-nums leading-tight"
                    style={{ fontSize: 'var(--fs-metric)', color }}>
                    {n.headline}
                  </div>
                )}
                {n.detail && (
                  <div className="mt-1" style={{ fontSize: 'var(--fs-fine)', color: 'var(--mist)' }}>{n.detail}</div>
                )}
                {hasRows && (
                  <button onClick={() => setOpenRows(open ? null : n.id)}
                    className="mt-auto pt-2 text-left"
                    style={{ fontSize: 'var(--fs-fine)', color: 'var(--aqua)' }}>
                    {open ? '행 접기 ▲' : `실제 행 ${n.rows!.length}건 ▼`}
                  </button>
                )}
              </div>
              {/* 다리 화살표 */}
              {i < nodes.length - 1 && (
                edges[i]?.label ? (
                  <div className="flex w-28 shrink-0 flex-col items-center justify-center px-1">
                    <span className="text-center leading-tight" style={{ fontSize: '11px', color: 'var(--mist)' }}>
                      {edges[i].label}
                    </span>
                    <div className="mt-1 flex w-full items-center">
                      <div className="h-px flex-1" style={{ background: 'var(--flow)' }} />
                      <span style={{ color: 'var(--flow-solid)', fontSize: 'var(--fs-meta)' }}>▶</span>
                    </div>
                  </div>
                ) : (
                  <div className="w-4 shrink-0" />
                )
              )}
            </div>
          );
        })}
      </div>

      {/* 펼친 행(선택 노드의 실데이터) */}
      {openRows && (() => {
        const n = nodes.find((x) => x.id === openRows);
        if (!n?.rows?.length) return null;
        return (
          <div className="mb-3 rounded-[var(--r-md)] border p-3" style={{ borderColor: 'var(--ink-600)', background: 'var(--ink-900)' }}
            data-testid="dataflow-rows">
            <div style={{ fontSize: 'var(--fs-fine)', color: n.rowsKind === 'used' ? 'var(--jade)' : 'var(--mist)' }}>
              {n.rowsKind === 'used' ? `✓ ${n.title} — 답변에 실제 사용된 행` : `${n.title} — 대표 예시 행`}
            </div>
            <div className="mt-1 overflow-x-auto font-mono" style={{ fontSize: 'var(--fs-fine)' }}>
              {n.rows.slice(0, 5).map((r, i) => (
                <div key={i} className="whitespace-nowrap" style={{ color: 'var(--pearl)' }}>
                  {Object.entries(r).slice(0, 5).map(([k, v]) => `${k}=${String(v)}`).join('  ·  ')}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* 결론(chain일 때) */}
      {conclusion && (
        <div className="rounded-[var(--r-md)] border-2 p-3"
          style={{ borderColor: conclusion.finding_kind === 'observation' ? 'var(--jade)' : 'var(--amber)', background: 'var(--ink-800)' }}>
          <span className="rounded-[var(--r-pill)] px-2 py-0.5 font-medium"
            style={{ background: conclusion.finding_kind === 'observation' ? 'var(--jade)' : 'var(--amber)',
                     color: '#06121a', fontSize: 'var(--fs-fine)' }}>
            {conclusion.finding_kind === 'observation' ? '관측' : '가설'}
          </span>
          <p className="mt-2 leading-relaxed" style={{ fontSize: 'var(--fs-body)' }}>{conclusion.text}</p>
        </div>
      )}
      {(caveats ?? []).map((c) => (
        <p key={c} className="mt-1.5" style={{ fontSize: 'var(--fs-fine)', color: 'var(--mist)' }}>⚠️ {c}</p>
      ))}
    </div>
  );
}
