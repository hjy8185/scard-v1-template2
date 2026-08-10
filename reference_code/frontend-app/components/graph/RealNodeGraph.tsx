'use client';

// U13 P7b: 답변이 실제 사용한 노드 그래프. 집계 진영 지도가 아니라
// 이 답변의 graph_paths 실노드(신한카드 Deep Dream→DREAM 영역→혜택→…)를 그린다.
import { useMemo } from 'react';
import { ReactFlow, Background, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { PlatformAnnotation } from '@/lib/types';
import { graphPathsToRealGraph, extractProvenance, marketDimTitle, tableOf, type RealNode } from '@/lib/asset-map';

// 노드 label별 색 (진영/타입)
const LABEL_COLOR: Record<string, string> = {
  CARD_Product: 'var(--jade)', CARD_BenefitGroup: 'var(--jade)', CARD_Benefit: 'var(--jade)',
  CARD_Condition: 'var(--amber)', CARD_BenefitLimit: 'var(--amber)', CARD_SpendTier: 'var(--amber)',
  CARD_AnnualFee: 'var(--amber)', CARD_Exclusion: 'var(--coral)', MERCHANT: 'var(--aqua)', CATEGORY: 'var(--aqua)',
};
// tableOf는 lib/asset-map에서 import (label→테이블 매핑 단일 소스)

export function RealNodeGraph({ annotation }: { annotation?: PlatformAnnotation }) {
  const { nodes: realNodes, edges: realEdges } = useMemo(
    () => graphPathsToRealGraph(annotation), [annotation]);
  const { tables, marketRows, marketAction } = useMemo(() => extractProvenance(annotation), [annotation]);
  const cit = annotation?.citation as {
    metrics?: Array<Record<string, unknown>>;
    portfolio?: { pairs?: Array<Record<string, unknown>>; card_count?: number; method?: string };
    coverage?: { strong?: Array<{ category: string; card_count: number }>; weak?: Array<{ category: string; card_count: number }> };
  } | undefined;
  const metrics = useMemo(() => (cit?.metrics ?? []).filter((x) => x && x.metric_name), [cit]);
  const portfolio = cit?.portfolio;
  const coverage = cit?.coverage;
  // value 있는 metric만 카드로(전부 null이면 metric 렌더 스킵 → coverage 등 다른 근거로)
  const shownMetrics = useMemo(() => metrics.filter((m) => m.value != null), [metrics]);
  // 시장 행 정렬(큰 값 우선) — "60대가 제일 많이" 같은 순위가 바로 보이게
  const sortedRows = useMemo(() => {
    const parseKrw = (a: string) => {
      const m = a.match(/([\d.]+)\s*조/); if (m) return parseFloat(m[1]) * 1e12;
      const n = parseFloat(a.replace(/[^\d.]/g, '')); return isNaN(n) ? 0 : n;
    };
    return [...marketRows].sort((x, y) => parseKrw(y.amount) - parseKrw(x.amount));
  }, [marketRows]);

  const { nodes, edges } = useMemo(() => {
    if (!realNodes.length) return { nodes: [] as Node[], edges: [] as Edge[] };
    // 값 흐름 순 컬럼: 가맹점(스타벅스) → 혜택 → 혜택그룹 → 카드 / 조건류는 우측
    const COL: Record<string, number> = {
      MERCHANT: 0, CATEGORY: 0, CARD_Benefit: 1, CARD_BenefitGroup: 2, CARD_Product: 3,
      CARD_Condition: 4, CARD_BenefitLimit: 4, CARD_SpendTier: 4, CARD_AnnualFee: 4, CARD_Exclusion: 4,
    };
    const colCount: Record<number, number> = {};
    const rf: Node[] = realNodes.map((n: RealNode) => {
      const col = COL[n.label] ?? 5;
      const row = (colCount[col] = (colCount[col] ?? 0) + 1) - 1;
      const color = LABEL_COLOR[n.label] ?? 'var(--slate)';
      const name = n.name.length > 22 ? n.name.slice(0, 21) + '…' : n.name;
      return {
        id: n.id,
        position: { x: col * 200, y: row * 70 },
        // 3계층: 테이블명(위 작게) + 값(아래 크게)
        data: { label: (
          <div style={{ lineHeight: 1.25 }} title={`${n.label} · ${n.name}`}>
            <div style={{ fontSize: 8, color, opacity: 0.85 }}>{tableOf(n.label)}</div>
            <div style={{ fontSize: 12, color: 'var(--pearl)' }}>{name}</div>
          </div>
        ) },
        draggable: true,
        style: {
          background: 'var(--ink-800)',
          border: `1.5px solid ${color}`,
          borderRadius: 8, padding: '3px 8px', width: 170, textAlign: 'left' as const,
        },
      };
    });
    const rfE: Edge[] = realEdges.map((e, i) => ({
      id: `e${i}`, source: e.source, target: e.target,
      style: { stroke: 'var(--ink-500, #2a3f4a)' }, animated: false,
    }));
    return { nodes: rf, edges: rfE };
  }, [realNodes, realEdges]);

  // 이 답변이 쓴 테이블 목록(범례) — label→테이블 유니크
  const usedTables = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of realNodes) map.set(tableOf(n.label), n.label);
    return [...map.entries()].map(([table, label]) => ({ table, color: LABEL_COLOR[label] ?? 'var(--slate)' }));
  }, [realNodes]);

  const covRows = [...(coverage?.strong ?? []), ...(coverage?.weak ?? [])];
  const hasAny = nodes.length || marketRows.length || shownMetrics.length
    || (portfolio && (portfolio.pairs?.length || portfolio.card_count)) || covRows.length;
  if (!hasAny) return null;

  return (
    <div className="flex h-full flex-col">
      {/* 테이블 범례 — 이 답변이 실제 쓴 테이블들(그래프 노드에 색으로 매칭) */}
      {nodes.length > 0 && usedTables.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5" style={{ borderBottom: '1px solid var(--ink-600)' }}>
          <span className="text-[13px]" style={{ color: 'var(--slate)' }}>사용 테이블:</span>
          {usedTables.map((t, i) => (
            <span key={i} className="flex items-center gap-1 text-[13px]">
              <span style={{ width: 8, height: 8, borderRadius: 2, background: t.color }} />
              <span style={{ color: 'var(--pearl)' }}>{t.table}</span>
            </span>
          ))}
        </div>
      )}
      {/* 그래프 없는 답변(시장/metric 등)은 provenance 컴포넌트 배지 */}
      {nodes.length === 0 && tables.length > 0 && (
        <div className="flex flex-wrap gap-1 px-2 py-1.5" style={{ borderBottom: '1px solid var(--ink-600)' }}>
          <span className="text-[13px]" style={{ color: 'var(--slate)' }}>소스:</span>
          {tables.map((t, i) => (
            <span key={i} className="text-[13px] rounded-[var(--r-pill)] px-1.5 py-0.5"
              style={{ background: 'var(--ink-700)', color: 'var(--aqua)' }} title={t.source}>
              {t.component}
            </span>
          ))}
        </div>
      )}
      {/* 1순위: 실노드 그래프 — 값 레벨 연결(스타벅스→혜택→카드) + 노드마다 테이블명 */}
      {nodes.length > 0 && (
        <div className="flex-1 min-h-0">
          <ReactFlow nodes={nodes} edges={edges} colorMode="dark" fitView minZoom={0.1}
            nodesConnectable={false} proOptions={{ hideAttribution: true }}>
            <Background color="var(--ink-600)" gap={18} />
          </ReactFlow>
        </div>
      )}

      {/* 2순위: 시장 행 막대(큰 값 순) */}
      {nodes.length === 0 && marketRows.length > 0 && (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
          <div className="text-[13px]" style={{ color: 'var(--pearl)' }}>
            서울 시장 · {marketDimTitle(marketAction)}별 매출 <span style={{ color: 'var(--aqua)' }}>[집계]</span>
          </div>
          {(() => {
            const max = sortedRows.reduce((m, r) => {
              const v = parseFloat(r.amount.replace(/[^\d.]/g, '')) || 0; return Math.max(m, v);
            }, 0) || 1;
            return sortedRows.slice(0, 15).map((r, i) => {
              const v = parseFloat(r.amount.replace(/[^\d.]/g, '')) || 0;
              return (
                <div key={i} className="text-[13px]">
                  <div className="flex items-center justify-between">
                    <span style={{ color: i === 0 ? 'var(--jade)' : 'var(--pearl)' }}>
                      {i === 0 ? '① ' : ''}{r.label}
                    </span>
                    <span style={{ color: 'var(--aqua)' }}>{r.amount}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, marginTop: 2, background: 'var(--ink-700)' }}>
                    <div style={{ height: '100%', borderRadius: 2, width: `${(v / max) * 100}%`, background: i === 0 ? 'var(--jade)' : 'var(--aqua)' }} />
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* 3순위: 시맨틱 metric (실질혜택률 등) — 값 + 정의 + 소스 테이블 */}
      {nodes.length === 0 && marketRows.length === 0 && shownMetrics.length > 0 && (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
          {shownMetrics.map((m, i) => {
            const val = m.value as number | null;
            const unit = String(m.unit ?? '');
            const disp = val == null ? '—'
              : unit === 'ratio' ? `${(val * 100).toFixed(2)}%` : `${val}${unit ? ' ' + unit : ''}`;
            const filters = (m.filters ?? {}) as Record<string, unknown>;
            const filterStr = Object.entries(filters).map(([k, v]) => `${k}=${v}`).join(' · ');
            const srcTables = (m.source_tables ?? []) as string[];
            return (
              <div key={i} className="rounded-[var(--r-md)] p-2.5" style={{ background: 'var(--ink-800)', border: '1px solid var(--ink-600)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-[13px]" style={{ color: 'var(--pearl)' }}>{String(m.metric_name)}</span>
                  <span style={{ fontSize: 12, padding: '1px 5px', borderRadius: 'var(--r-pill)', background: m.synthetic_flag ? 'var(--amber)' : 'var(--jade)', color: 'var(--ink-900)' }}>
                    {m.synthetic_flag ? '합성' : '공개-실'}
                  </span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 600, color: m.synthetic_flag ? 'var(--amber)' : 'var(--jade)', margin: '4px 0' }}>{disp}</div>
                {filterStr && <div className="text-[13px]" style={{ color: 'var(--mist)' }}>{filterStr}</div>}
                {srcTables.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <span className="text-[13px]" style={{ color: 'var(--slate)' }}>소스:</span>
                    {srcTables.map((t, j) => (
                      <span key={j} className="text-[13px] rounded-[var(--r-pill)] px-1.5 py-0.5" style={{ background: 'var(--ink-700)', color: 'var(--aqua)' }}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 4순위: coverage 갭 (카테고리별 카드 수 — 강/약 영역) */}
      {nodes.length === 0 && marketRows.length === 0 && shownMetrics.length === 0 && covRows.length > 0 && (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
          <div className="text-[13px]" style={{ color: 'var(--pearl)' }}>온톨로지 카테고리별 카드 커버리지 <span style={{ color: 'var(--amber)' }}>[합성]</span></div>
          {(() => {
            const max = covRows.reduce((m, r) => Math.max(m, r.card_count), 0) || 1;
            const weakSet = new Set((coverage?.weak ?? []).map((w) => w.category));
            return covRows.slice(0, 15).map((r, i) => (
              <div key={i} className="text-[13px]">
                <div className="flex items-center justify-between">
                  <span style={{ color: weakSet.has(r.category) ? 'var(--coral)' : 'var(--pearl)' }}>
                    {weakSet.has(r.category) ? '⚠ ' : ''}{r.category}
                  </span>
                  <span style={{ color: 'var(--mist)' }}>{r.card_count}장</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, marginTop: 2, background: 'var(--ink-700)' }}>
                  <div style={{ height: '100%', borderRadius: 2, width: `${(r.card_count / max) * 100}%`, background: weakSet.has(r.category) ? 'var(--coral)' : 'var(--aqua)' }} />
                </div>
              </div>
            ));
          })()}
        </div>
      )}

      {/* 5순위: portfolio (카드 겹침 쌍) */}
      {nodes.length === 0 && marketRows.length === 0 && shownMetrics.length === 0 && covRows.length === 0 && portfolio && (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
          <div className="text-[13px]" style={{ color: 'var(--pearl)' }}>
            포트폴리오 겹침 분석 <span style={{ color: 'var(--slate)' }}>({portfolio.method ?? 'jaccard'}, {portfolio.card_count}장 대상)</span>
          </div>
          {(portfolio.pairs && portfolio.pairs.length > 0) ? (
            portfolio.pairs.slice(0, 12).map((p, i) => (
              <div key={i} className="flex items-center justify-between text-[13px] rounded-[var(--r-md)] px-2 py-1"
                style={{ background: 'var(--ink-800)', border: '1px solid var(--ink-600)' }}>
                <span style={{ color: 'var(--pearl)' }}>
                  {String((p.card_a_name ?? p.card_a ?? p.a) as string)} ↔ {String((p.card_b_name ?? p.card_b ?? p.b) as string)}
                </span>
                <span style={{ color: 'var(--amber)' }}>
                  {p.jaccard != null ? `${(Number(p.jaccard) * 100).toFixed(0)}%` : ''}
                </span>
              </div>
            ))
          ) : (
            <div className="text-[13px]" style={{ color: 'var(--mist)' }}>
              겹치는 카드 쌍이 없습니다(특정 카드 지정 시 비교됩니다).
            </div>
          )}
        </div>
      )}
    </div>
  );
}
