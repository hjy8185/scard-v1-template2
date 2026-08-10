'use client';

// U37 — evidence chain 해부: multi-hop 경로의 세로 타임라인.
// 기존 해부(좌표/우표 2박)는 4~5 hop에 부적합 — hop 카드(등급 뱃지 + typed edge +
// 핵심 수치) → 연결선 → conclusion 박스(observation/hypothesis 뱃지 구분).
import type { ChainResult } from '@/lib/types';

const GRADE_COLOR: Record<string, string> = {
  '공개-실': 'var(--jade)', '공개-집계': 'var(--aqua)',
  '합성': 'var(--amber)', '합성-근거': 'var(--amber)', '추정': 'var(--coral)',
};

export function ChainView({ chain }: { chain: ChainResult }) {
  if (chain.status !== 'ok' || !chain.hops?.length) return null;
  const con = chain.conclusion;
  const isObs = con.finding_kind === 'observation';
  return (
    <div className="h-full overflow-y-auto p-4" data-testid="chain-view">
      <div className="mb-3">
        <div className="text-sm font-medium" style={{ color: 'var(--pearl)' }}>{chain.title}</div>
        <div className="mt-1 text-[13px]" style={{ color: 'var(--mist)' }}>
          {chain.n_datasets}개 데이터셋 · {chain.n_hops}-hop — 이 조인 경로는 온톨로지에 자산으로 존재합니다
        </div>
      </div>

      <ol className="space-y-0">
        {chain.hops.map((h, i) => (
          <li key={h.id} data-testid={`chain-hop-${h.id}`}>
            <div className="rounded-[var(--r-md)] border p-3"
              style={{ borderColor: 'var(--ink-600)', background: 'var(--ink-700)' }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[13px]" style={{ color: 'var(--mist)' }}>
                  hop {i + 1} · {h.from_entity} →({h.edge_type})→ {h.to_entity}
                </span>
                <span className="shrink-0 rounded-[var(--r-pill)] px-2 py-0.5 text-[13px]"
                  style={{ background: 'var(--ink-600)', color: GRADE_COLOR[h.grade] ?? 'var(--mist)' }}>
                  {h.grade}
                </span>
              </div>
              <div className="mt-1 text-sm" style={{ color: 'var(--pearl)' }}>{h.summary}</div>
              {h.lineage?.source_asset && (
                <div className="mt-1 font-mono text-[13px]" style={{ color: 'var(--mist)' }}>
                  {h.lineage.source_asset} · join: {h.join_key} ({h.cardinality})
                </div>
              )}
            </div>
            {i < chain.hops.length - 1 && (
              <div className="my-1 ml-6 h-4 w-px" style={{ background: 'var(--flow)' }} />
            )}
          </li>
        ))}
      </ol>

      {/* 결론 — hop이 아님(계약): observation/hypothesis 언어 구분 */}
      <div className="mt-3 rounded-[var(--r-md)] border-2 p-3"
        style={{ borderColor: isObs ? 'var(--jade)' : 'var(--amber)', background: 'var(--ink-800)' }}
        data-testid="chain-conclusion">
        <span className="rounded-[var(--r-pill)] px-2 py-0.5 text-[13px] font-medium"
          style={{ background: isObs ? 'var(--jade)' : 'var(--amber)', color: '#06121a' }}>
          {isObs ? '관측' : '가설'}
        </span>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--pearl)' }}>{con.text}</p>
      </div>

      {(chain.caveats?.length ?? 0) > 0 && (
        <ul className="mt-2 space-y-1">
          {chain.caveats!.map((c) => (
            <li key={c} className="text-[13px]" style={{ color: 'var(--mist)' }}>⚠️ {c}</li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[13px] leading-relaxed" style={{ color: 'var(--mist)' }}>
        RDB라면 이 질문 하나에 {chain.n_datasets}개 시스템의 조인을 사람이 설계해야 합니다 —
        온톨로지가 있으면 그 조인 경로가 이미 자산으로 존재합니다.
      </p>
    </div>
  );
}
