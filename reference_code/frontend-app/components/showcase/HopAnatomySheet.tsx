'use client';

// U39 — hop 해부 시트(하단 inspector): "이 다리를 통과할 때 실제로 무슨 일이 있었나".
// buildHopAnatomy: hop의 traversal·rows·grade에서 결정론 조립 — 다른 해부 대체 표시 금지(P0-5).
// 검산·다리 근거는 fs-metric 승격(사용자 지정: "해부 유용 — 살릴 것").
import { useEffect } from 'react';
import type { PlatformAnnotation } from '@/lib/types';
import type { JourneyHop } from '@/lib/map-journey';

interface Props {
  hop: JourneyHop;
  annotation: PlatformAnnotation | undefined;
  onClose: () => void;
}

export function HopAnatomySheet({ hop, annotation, onClose }: Props) {
  // Escape 닫기 + 열릴 때 시트로 focus(P1-6)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // hop rows: annotation의 chain에서 이 hop의 실제 행(있으면 used-in-answer)
  const chain = (annotation?.citation as { chain?: { hops?: Array<{ id: string; rows?: Array<Record<string, unknown>> }> } } | undefined)?.chain;
  const rows = chain?.hops?.find((h) => h.id === hop.hopId)?.rows ?? [];

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex max-h-[55%] flex-col rounded-t-xl border-t-2 shadow-2xl"
      style={{ borderColor: 'var(--flow-solid)', background: 'var(--ink-900)' }}
      role="dialog" aria-label={`hop ${hop.order} 근거`} data-testid="hop-anatomy-sheet">
      {/* 헤더: hop 번호 · from→edge→to · 닫기 */}
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-2.5"
        style={{ borderBottom: '1px solid var(--ink-600)' }}>
        <div className="min-w-0 flex-1">
          <span style={{ color: 'var(--flow-solid)', fontWeight: 700, fontSize: 'var(--fs-body)' }}>
            {'①②③④⑤'[hop.order - 1] ?? hop.order}
          </span>
          <span className="ml-2" style={{ fontSize: 'var(--fs-body)' }}>
            {hop.traversal.from} <span style={{ color: 'var(--flow-solid)' }}>—{hop.presentation.edgeLabel}→</span> {hop.traversal.to}
          </span>
          {hop.presentation.edgeSubtitle && (
            <span className="ml-2" style={{ fontSize: 'var(--fs-meta)', color: 'var(--mist)' }}>
              ({hop.presentation.edgeSubtitle})
            </span>
          )}
        </div>
        <button onClick={onClose} className="min-h-11 min-w-11 shrink-0 rounded-[var(--r-md)]"
          style={{ background: 'var(--ink-700)' }} aria-label="닫기" data-testid="hop-sheet-close">✕</button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {/* 핵심 수치 — 검산의 클라이맥스를 fs-metric로 승격 */}
        {hop.presentation.headline && (
          <div className="mb-3">
            <span className="font-semibold tabular-nums" style={{ fontSize: 'var(--fs-metric)', color: 'var(--jade)' }}>
              {hop.presentation.headline}
            </span>
            {hop.presentation.detail && (
              <span className="ml-3" style={{ fontSize: 'var(--fs-meta)', color: 'var(--mist)' }}>
                {hop.presentation.detail}
              </span>
            )}
          </div>
        )}

        {/* traversal 상세 */}
        <div className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1" style={{ fontSize: 'var(--fs-meta)' }}>
          <div><span style={{ color: 'var(--mist)' }}>조인 키: </span>{hop.traversal.joinKey}</div>
          <div><span style={{ color: 'var(--mist)' }}>관계: </span>{hop.traversal.cardinality}</div>
          <div><span style={{ color: 'var(--mist)' }}>출처 등급: </span>
            <span style={{ color: 'var(--jade)' }}>{hop.evidence.grade}</span></div>
          <div><span style={{ color: 'var(--mist)' }}>원천 자산: </span>
            {hop.evidence.sourceAssets.join(', ') || '—'}</div>
        </div>

        <p className="mb-3" style={{ fontSize: 'var(--fs-body)' }}>{hop.presentation.summary}</p>

        {/* 이 hop이 실제로 읽은 행 */}
        {rows.length > 0 ? (
          <div>
            <div style={{ fontSize: 'var(--fs-fine)', color: 'var(--jade)' }}>✓ 이 연산에 실제 사용된 행 {rows.length}건</div>
            <div className="mt-1 overflow-x-auto rounded-[var(--r-md)] p-2.5 font-mono"
              style={{ background: 'var(--ink-800)', fontSize: 'var(--fs-fine)' }}>
              {rows.slice(0, 5).map((r, i) => (
                <div key={i} className="whitespace-nowrap" style={{ color: 'var(--pearl)' }}>
                  {Object.entries(r).slice(0, 5).map(([k, v]) => `${k}=${String(v)}`).join('  ·  ')}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 'var(--fs-fine)', color: 'var(--slate)' }}>실제 행: 이 응답에는 미제공</div>
        )}

        {hop.evidence.offMapAssets.length > 0 && (
          <p className="mt-2" style={{ fontSize: 'var(--fs-fine)', color: 'var(--mist)' }}>
            지도 밖 자산: {hop.evidence.offMapAssets.join(', ')} — 지도 노드가 없어 레일에만 표시됩니다
          </p>
        )}
      </div>
    </div>
  );
}
