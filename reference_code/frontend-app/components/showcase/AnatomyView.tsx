'use client';

// U18 — 연결 해부 뷰: 3박 연출(①불일치 → ②온톨로지가 잇는다 → ③검산).
// 원리1: 불일치 먼저. 원리2: 검산 블록. 원리3: 답변 속 그 값 하이라이트. ⛶ 시연 모드(풀스크린 1.4×).

import { useState, useEffect, useCallback } from 'react';
import type { Anatomy, AnatomyTable, AnatomyRef } from '@/lib/anatomy';

const GRADE_COLOR: Record<string, string> = {
  '공개-실': 'var(--jade)', '집계': 'var(--aqua)', '합성': 'var(--amber)', '추정': 'var(--coral)',
};

function SourceTableCard({ t, lit }: { t: AnatomyTable; lit: boolean }) {
  const color = GRADE_COLOR[t.grade] ?? 'var(--mist)';
  return (
    <div className="rounded-[var(--r-md)] p-2.5 flex-1 min-w-0 transition-all duration-500"
      style={{ background: 'var(--ink-800)', border: `1px solid ${lit ? color : 'var(--ink-600)'}` }}>
      <div className="flex items-center justify-between">
        <span style={{ color: 'var(--pearl)', fontWeight: 600 }}>▦ {t.title}</span>
        <span style={{ color, fontSize: 'var(--fs-fine)' }}>{t.grade}</span>
      </div>
      <div style={{ color: 'var(--slate)', fontSize: 'var(--fs-fine)' }}>{t.org} · {t.rows_total}</div>
      {/* 스키마 칩 */}
      <div className="mt-1.5 flex flex-wrap gap-1">
        {t.schema.map((c) => (
          <span key={c.col} title={c.desc} className="rounded-[var(--r-pill)] px-1.5 py-0.5"
            style={{ background: 'var(--ink-700)', color: 'var(--mist)', fontSize: 'var(--fs-fine)' }}>
            {c.col}
          </span>
        ))}
      </div>
      {/* 샘플 행(답변 속 그 값 — 원리3) */}
      <table className="mt-2 w-full" style={{ fontSize: 'var(--fs-fine)' }}>
        <tbody>
          {t.rows.map((r, i) => (
            <tr key={i} style={{ background: lit ? 'color-mix(in srgb, ' + color + ' 12%, transparent)' : 'transparent' }}>
              {Object.entries(r).map(([k, v]) => (
                <td key={k} className="px-1.5 py-1 align-top" style={{ color: 'var(--pearl)', borderTop: '1px solid var(--ink-600)' }}>
                  <div style={{ color: 'var(--slate)', fontSize: 'var(--fs-fine)' }}>{k}</div>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OntologyRefCard({ r }: { r: AnatomyRef }) {
  return (
    <div className="rounded-[var(--r-md)] p-2.5 anatomy-slide-in"
      style={{ background: 'color-mix(in srgb, var(--jade) 8%, var(--ink-800))', border: '1px solid var(--jade)' }}>
      <div style={{ color: 'var(--jade)', fontSize: 'var(--fs-fine)', fontWeight: 600 }}>
        ◇ 온톨로지 근거 — {r.source}
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5" style={{ color: 'var(--pearl)' }}>
        {r.display.map((d, i) => (
          <span key={i} style={i === 1 && r.kind === 'crosswalk' ? { color: 'var(--aqua)', fontSize: 'var(--fs-fine)' } : {}}>
            {d}
          </span>
        ))}
      </div>
      {r.honesty && <div className="mt-1" style={{ color: 'var(--amber)', fontSize: 'var(--fs-fine)' }}>⚠ {r.honesty}</div>}
    </div>
  );
}

export function AnatomyView({ anatomy }: { anatomy: Anatomy | null }) {
  const [beat, setBeat] = useState(0);
  const [paused, setPaused] = useState(false);
  const [full, setFull] = useState(false);

  const reduced = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // U38 P1-6: 자동 재생 제거 — 기본 3박 동시 표시(발표 중 화면 자동 진행 금지).
  // 순차 연출이 필요하면 '재생' 버튼(paused 해제)으로만 — 클릭 즉시 중단 가능.
  useEffect(() => {
    setBeat(2);
  }, [anatomy]);
  useEffect(() => {
    if (reduced || paused || beat >= 2) return;
    const t = setTimeout(() => setBeat((b) => Math.min(b + 1, 2)), 1200);
    return () => clearTimeout(t);
  }, [beat, paused, reduced, anatomy]);

  // ⛶ 풀스크린 ESC 복귀
  const onKey = useCallback((e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); }, []);
  useEffect(() => {
    if (!full) return;
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full, onKey]);

  if (!anatomy) {
    return (
      <div className="flex h-full items-center justify-center text-[13px]" style={{ color: 'var(--slate)' }}>
        이 답변은 단일 원천 조회 — 연결 해부 없음
      </div>
    );
  }

  const body = (
    <div className="flex h-full flex-col gap-2.5 overflow-y-auto p-3 text-[13px]"
      style={full ? { fontSize: '1.4em' } : undefined}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      data-testid="anatomy-view">
      <div className="flex items-center justify-between">
        <span style={{ color: 'var(--mist)' }}>이 답변을 가능하게 한 연결 — 해부</span>
        <div className="flex items-center gap-2">
          {/* 박자 도트 */}
          {[0, 1, 2].map((b) => (
            <button key={b} onClick={() => setBeat(b)} aria-label={`${b + 1}박`}
              style={{ width: 8, height: 8, borderRadius: 999, background: beat >= b ? 'var(--jade)' : 'var(--ink-600)' }} />
          ))}
          <button onClick={() => setFull(!full)} title="시연 모드(전체 화면)"
            style={{ color: 'var(--mist)' }}>{full ? '✕' : '⛶'}</button>
        </div>
      </div>

      {/* 1박: 두 원천 + 불일치 */}
      <div className="flex items-stretch gap-2">
        <SourceTableCard t={anatomy.left} lit={beat >= 1} />
        <div className="flex flex-col items-center justify-center px-1" style={{ minWidth: 72 }}>
          {beat === 0 ? (
            <>
              <span style={{ color: 'var(--coral)', fontSize: '1.3em' }}>✗</span>
              <span style={{ color: 'var(--coral)', fontSize: 'var(--fs-fine)', textAlign: 'center' }}>직접 join<br />불가</span>
            </>
          ) : (
            <span style={{ color: 'var(--jade)', fontSize: '1.1em' }}>⟵⟶</span>
          )}
        </div>
        <SourceTableCard t={anatomy.right} lit={beat >= 1} />
      </div>
      {beat === 0 && (
        <div className="text-center" style={{ color: 'var(--mist)', fontSize: 'var(--fs-fine)' }}>
          {anatomy.mismatchCaption}
        </div>
      )}

      {/* 2박: 온톨로지 근거 행 */}
      {beat >= 1 && <OntologyRefCard r={anatomy.ref} />}

      {/* 3박: 검산 블록(원리2) */}
      {beat >= 2 && anatomy.arithmetic && (
        <div className="rounded-[var(--r-md)] p-2.5 anatomy-slide-in"
          style={{ background: 'var(--ink-900)', border: '1px solid var(--aqua)' }} data-testid="arithmetic-block">
          <div style={{ color: 'var(--aqua)', fontSize: 'var(--fs-fine)', fontWeight: 600 }}>검산 — 이 숫자는 이렇게 만들어졌습니다</div>
          <div className="mt-1 flex flex-wrap items-center gap-1" style={{ color: 'var(--pearl)' }}>
            {anatomy.arithmetic.parts.map((p, i) => (
              <span key={p.label}>
                {i > 0 && <span style={{ color: 'var(--slate)' }}> + </span>}
                <span title={p.label} style={{ borderBottom: '1px dotted var(--slate)' }}>{p.value}</span>
                <span style={{ color: 'var(--slate)', fontSize: 'var(--fs-fine)' }}>({p.label})</span>
              </span>
            ))}
            <span style={{ color: 'var(--jade)', fontWeight: 700 }}>
              {' '}= {anatomy.arithmetic.total}{anatomy.arithmetic.unit}
            </span>
            <span style={{ color: 'var(--jade)' }}> ✓ 답변의 &quot;{anatomy.arithmetic.claim}&quot;</span>
          </div>
        </div>
      )}

      {/* 부 연결 칩(원리4) */}
      {beat >= 2 && anatomy.subRefs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {anatomy.subRefs.map((r, i) => (
            <details key={i} className="rounded-[var(--r-pill)]" style={{ border: '1px solid var(--ink-600)' }}>
              <summary className="cursor-pointer px-2.5 py-1" style={{ color: 'var(--mist)', fontSize: 'var(--fs-fine)' }}>
                이 답은 {r.kind === 'subsumption' ? '⊑ 분류 규칙' : '보조 연결'}도 사용 — 보기
              </summary>
              <div className="px-2.5 pb-2"><OntologyRefCard r={r} /></div>
            </details>
          ))}
        </div>
      )}
    </div>
  );

  if (full) {
    return (
      <div className="fixed inset-0 z-50" style={{ background: 'var(--ink-900)' }}>
        {body}
      </div>
    );
  }
  return body;
}
