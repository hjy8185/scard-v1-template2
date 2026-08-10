'use client';

// U13 P4: 인라인 과정 서사. 순수 props(useChat 미참조 — v5 마이그레이션 생존성 R1).
// orchestrated 실보유 데이터만: intent·tier·tool 상태·result_summary·passed·disclaimers.
// 4중점수(Source/Grounding/Coverage/Faithfulness)는 orchestrated에 없음 → 표시 안 함(R2/V2).

import { useState } from 'react';
import type { ReasoningTrace as Trace } from '@/lib/types';

export function ReasoningTrace({ trace }: { trace: Trace | undefined }) {
  const [open, setOpen] = useState(false);
  if (!trace || trace.toolSteps.length === 0) return null;

  const n = trace.toolSteps.length;

  // streaming: 진행 뱃지(일괄 도착 — 실시간 아님)
  if (trace.phase === 'streaming') {
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px]" style={{ color: 'var(--mist)' }}>
        <span>과정:</span>
        {trace.toolSteps.map((s, i) => (
          <span key={i} className="rounded-[var(--r-pill)] px-2 py-0.5"
            style={{ background: 'var(--ink-700)', color: 'var(--aqua)' }}>
            {s.tool}
          </span>
        ))}
      </div>
    );
  }

  // complete: 접이식 요약
  return (
    <div className="mt-1.5 text-[13px]">
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-1"
        style={{ color: 'var(--mist)' }} aria-expanded={open}>
        <span>{open ? '▼' : '▶'}</span>
        <span>
          과정 ({trace.intent ?? 'route'} · {n} tool{n > 1 ? 's' : ''}
          {trace.durationMs ? ` · ${(trace.durationMs / 1000).toFixed(1)}s` : ''})
        </span>
        <span aria-label={trace.passed ? '검증 통과' : '확인 필요'}>{trace.passed ? '✓' : '⚠️'}</span>
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 rounded-[var(--r-md)] p-2"
          style={{ background: 'var(--ink-800)', border: '1px solid var(--ink-600)' }}>
          {trace.selectedTier && (
            <div style={{ color: 'var(--slate)' }}>라우팅: {trace.selectedTier}</div>
          )}
          {trace.toolSteps.map((s, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span style={{ color: 'var(--pearl)' }}>
                {s.status === 'error' ? '✗' : '·'} {s.tool}
                {s.templateId ? <span style={{ color: 'var(--slate)' }}> ({s.templateId})</span> : null}
              </span>
              {s.resultSummary && <span style={{ color: 'var(--aqua)' }}>{s.resultSummary}</span>}
            </div>
          ))}
          {trace.disclaimers?.map((d, i) => (
            <div key={`d${i}`} style={{ color: 'var(--amber)' }}>⚠ {d}</div>
          ))}
        </div>
      )}
    </div>
  );
}
