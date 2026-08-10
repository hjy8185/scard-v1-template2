'use client';

// U53 — 데모 시나리오 캐시 워밍 버튼(헤더).
// 사용자 지정: "UI에 데모시나리오에서 사용하는 데이터셋을 캐싱하는 버튼을 만들어줘."
//
// 무엇을 하나: 픽커 전 문항이 실제로 쓰는 Athena 질의를 미리 실행해 Valkey에 채운다.
// 그러면 데모 중 같은 질문이 캐시 히트(실측 2,354ms → 28ms)로 답한다.
// 실행은 BFF 백그라운드(POST /api/cache) — 답변 경로와 분리돼 데모를 막지 않는다.
//
// U67: `endpoint`·`label`을 props로 열어 **/v2에서도 같은 컴포넌트를 쓴다**(v2는
// /api/v2/cache → bff-v2). 데모 기본값은 그대로여서 v1 호출부는 변경이 없다.
import { useCallback, useEffect, useRef, useState } from 'react';

interface CacheState {
  running: boolean;
  total: number;
  done: number;
  ok: number;
  failed?: Array<{ target?: string; template?: string; error?: string }>;
  elapsed_ms?: number | null;
  last_error?: string | null;
  cache?: { keys?: number; bytes?: number; hit?: number; miss?: number;
            hit_rate?: number | null; max_bytes?: number };
}

function fmtBytes(b?: number): string {
  if (!b) return '0KB';
  return b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)}MB` : `${(b / 1024).toFixed(0)}KB`;
}

interface Props {
  /** 프록시 경로. 기본은 데모(v1). v2는 '/api/v2/cache'. */
  endpoint?: string;
  /** 패널 제목. 무엇을 캐싱하는지 화면이 말하게 한다. */
  title?: string;
  /** 패널 설명 — 대상이 다르면 설명도 달라야 한다(v1=템플릿 질의, v2=카탈로그 조회). */
  description?: string;
  testId?: string;
}

export function CacheWarmButton({
  endpoint = '/api/cache',
  title = '데모 데이터 캐시',
  description = '시나리오가 쓰는 분석 질의를 미리 실행해 Valkey에 올립니다 — 같은 질문은 이후 캐시에서 즉시 답합니다.',
  testId = 'cache-warm',
}: Props = {}) {
  const [state, setState] = useState<CacheState | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(endpoint, { cache: 'no-store' });
      setState(await r.json());
    } catch {
      setState(null);
    }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);

  // 실행 중에만 폴링(2s) — 끝나면 멈춘다(불필요한 요청·리렌더 방지)
  useEffect(() => {
    if (state?.running && timer.current == null) {
      timer.current = setInterval(() => { void load(); }, 2000);
    }
    if (!state?.running && timer.current != null) {
      clearInterval(timer.current);
      timer.current = null;
      void load();
    }
    return () => {
      if (timer.current != null) { clearInterval(timer.current); timer.current = null; }
    };
  }, [state?.running, load]);

  const warm = useCallback(async () => {
    setBusy(true);
    setOpen(true);
    try {
      const r = await fetch(endpoint, { method: 'POST' });
      setState(await r.json());
    } catch {
      /* degrade — 상태 조회가 이어서 갱신 */
    } finally {
      setBusy(false);
    }
  }, [endpoint]);

  const running = !!state?.running;
  const pct = running && state.total ? Math.round((state.done / state.total) * 100) : 0;
  const keys = state?.cache?.keys ?? 0;
  const label = running
    ? `캐싱 중 ${state.done}/${state.total}`
    : keys > 0 ? `⚡ 캐시 ${keys}건` : '⚡ 데이터 캐싱';

  return (
    <div className="relative">
      <button
        onClick={running || keys > 0 ? () => setOpen((v) => !v) : warm}
        disabled={busy}
        className="min-h-11 rounded-[var(--r-pill)] px-3 text-[13px]"
        style={{
          background: running ? 'var(--ink-600)' : 'var(--ink-700)',
          color: keys > 0 && !running ? 'var(--jade)' : 'var(--mist)',
          opacity: busy ? 0.6 : 1,
        }}
        title="데모 시나리오가 쓰는 분석 질의를 미리 실행해 캐시에 올립니다(응답 지연 제거)"
        data-testid={`${testId}-button`}
      >
        {label}
      </button>

      {/* 진행 바 — 실행 중에만 */}
      {running && (
        <div className="absolute inset-x-1 bottom-0 h-[2px] overflow-hidden rounded"
          style={{ background: 'var(--ink-800)' }} aria-hidden="true">
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--flow-solid)',
                        transition: 'width .4s' }} />
        </div>
      )}

      {open && state && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-[var(--r-md)] border p-3"
          style={{ borderColor: 'var(--ink-600)', background: 'var(--ink-800)' }}
          data-testid={`${testId}-panel`}>
          <div className="flex items-start justify-between gap-2">
            <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--pearl)' }}>
              {title}
            </span>
            <button onClick={() => setOpen(false)} aria-label="닫기"
              style={{ fontSize: 'var(--fs-fine)', color: 'var(--mist)' }}>✕</button>
          </div>

          <p className="mt-1 leading-relaxed" style={{ fontSize: 'var(--fs-fine)', color: 'var(--mist)' }}>
            {description}
          </p>

          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1"
            style={{ fontSize: 'var(--fs-fine)' }}>
            <dt style={{ color: 'var(--mist)' }}>캐시된 질의</dt>
            <dd className="tabular-nums" style={{ color: 'var(--pearl)' }}>{keys}건</dd>
            <dt style={{ color: 'var(--mist)' }}>사용 용량</dt>
            <dd className="tabular-nums" style={{ color: 'var(--pearl)' }}>
              {fmtBytes(state.cache?.bytes)}
              {state.cache?.max_bytes ? ` / ${fmtBytes(state.cache.max_bytes)}` : ''}
            </dd>
            {state.cache?.hit != null && (
              <>
                <dt style={{ color: 'var(--mist)' }}>적중</dt>
                <dd className="tabular-nums" style={{ color: 'var(--jade)' }}>
                  {state.cache.hit}회
                  {state.cache.hit_rate != null && ` (${Math.round(state.cache.hit_rate * 100)}%)`}
                </dd>
              </>
            )}
            {state.elapsed_ms != null && !running && (
              <>
                <dt style={{ color: 'var(--mist)' }}>최근 소요</dt>
                <dd className="tabular-nums" style={{ color: 'var(--pearl)' }}>
                  {(state.elapsed_ms / 1000).toFixed(1)}초
                </dd>
              </>
            )}
          </dl>

          {running && (
            <div className="mt-2" style={{ fontSize: 'var(--fs-fine)', color: 'var(--aqua)' }}>
              실행 중 — {state.done}/{state.total} (성공 {state.ok})
            </div>
          )}

          {/* 실패는 감추지 않는다(정직) */}
          {!!state.failed?.length && (
            <div className="mt-2" style={{ fontSize: 'var(--fs-fine)', color: 'var(--coral)' }}>
              실패 {state.failed.length}건: {state.failed.slice(0, 2)
                .map((f) => f.template ?? f.target).join(', ')}
              {state.failed.length > 2 ? ' 등' : ''}
            </div>
          )}
          {state.last_error && (
            <div className="mt-1" style={{ fontSize: 'var(--fs-fine)', color: 'var(--coral)' }}>
              오류: {state.last_error}
            </div>
          )}

          {!running && (
            <button onClick={warm} disabled={busy}
              className="mt-3 min-h-11 w-full rounded-[var(--r-pill)] text-[13px] font-medium"
              style={{ background: 'var(--flow)', color: '#06121a', opacity: busy ? 0.6 : 1 }}
              data-testid={`${testId}-run`}>
              {keys > 0 ? '다시 캐싱' : '캐싱 시작'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
