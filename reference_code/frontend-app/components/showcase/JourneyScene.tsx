'use client';

// U39 — 여정 기본 장면: 결론 배너 + 지도(journey 모드) + 여정 레일 + hop 해부 시트.
// 상태기계(P1-5): complete | step — 자동재생 없음(도착=complete), 이동은 발표자 동작만.
// 레일 = 논리 hop의 단일 진실(4-hop 불변), 지도 = 자산 문맥.
import { useCallback, useEffect, useMemo, useReducer } from 'react';
import type { PlatformAnnotation } from '@/lib/types';
import { buildJourney, type MapJourney } from '@/lib/map-journey';
import { AssetMap } from '@/components/graph/AssetMap';
import { IDLE_LIGHTING } from '@/lib/asset-map';
import { HopAnatomySheet } from './HopAnatomySheet';

// U41fix(#185): ReactFlow(controlled)에 매 렌더 새 객체를 주면 내부 store 갱신 루프
// (Maximum update depth) — props 참조를 안정화한다.
const EMPTY_BADGES = new Map();
const NOOP = () => {};

const GRADE_COLOR: Record<string, string> = {
  '공개-실': 'var(--jade)', '집계': 'var(--aqua)', '합성': 'var(--amber)',
  '추정': 'var(--coral)', '미확인': 'var(--slate)',
};

interface UiState {
  activeHop: number | null;          // null = complete(전 경로)
  inspectorHopId: string | null;     // 해부 시트
}
type Action =
  | { type: 'reset' } | { type: 'start' } | { type: 'prev' } | { type: 'next'; max: number }
  | { type: 'jump'; order: number } | { type: 'inspect'; hopId: string | null };

function reducer(s: UiState, a: Action): UiState {
  switch (a.type) {
    case 'reset': return { activeHop: null, inspectorHopId: null };
    case 'start': return { activeHop: 1, inspectorHopId: null };
    case 'prev': return { ...s, activeHop: Math.max(1, (s.activeHop ?? 1) - 1) };
    case 'next': return { ...s, activeHop: Math.min(a.max, (s.activeHop ?? 0) + 1) };
    case 'jump': return { ...s, activeHop: a.order };
    case 'inspect': return { ...s, inspectorHopId: a.hopId };
  }
}

/** U46 — asset-usage 배너 문구.
 *
 * 이전 문구("관계가 확인된 경로가 없어 자산만 강조합니다")는 두 가지를 혼동했다:
 * ① 없는 것은 '온톨로지 연결'이 아니라 **지도에 그릴 검수된 화살표**다.
 *    verifiedLink는 JOURNEY_VISUALS registry에만 있고 그 registry는 chain 5종만
 *    채워져 있으므로, 일반 답변은 연결 유무와 무관하게 항상 화살표가 없다.
 * ② 실측(fixture 108건): 비-chain 97건 중 43건이 crosswalk 쌍·subsumption closure를
 *    실제 근거로 갖는다. 그런데도 "경로가 없다"고 말해 상세 탭(연결 해부·데이터 흐름)이
 *    보여주는 내용과 모순됐다 — 사용자가 지적한 그 불일치.
 *
 * 그래서 근거가 있으면 그것을 말하고(연결 자체는 인정), 지도에 선을 안 그리는 이유만
 * 별도로 밝힌다. 근거가 없을 때만 "자산만 표시"라고 한다(정직 유지 — 관계 조작 금지).
 */
/** 지표 계보 테이블명 → 관람객 언어(내부 컬럼명 노출 금지 — U17 §1 VALUE_KO 원칙). */
function lineageKo(table: string): string {
  const KO: Record<string, string> = {
    d6_reward_ledger: '리워드 원장', d5_statement_monthly: '월 명세',
    d4_transaction: '거래 명세', d0_crosswalk: '어휘 연결', d0_category_node: '카테고리 체계',
  };
  return KO[table] ?? table;
}

export function assetUsageNote(journey: MapJourney): string {
  const n = journey.hops.length;
  const l = journey.ontologyLinks;
  const closure = l?.closurePath ?? [];
  if (closure.length >= 2) {
    return `이 답변이 사용한 데이터 ${n}종 — '${closure[0]}' ⊑ '${closure[closure.length - 1]}' `
      + `분류 관계로 이었습니다. 연결의 상세는 [상세 ▾]의 연결 해부·데이터 흐름에서 볼 수 있어요`;
  }
  if ((l?.crosswalkPairs ?? 0) > 0) {
    return `이 답변이 사용한 데이터 ${n}종 — 약관어↔통계어 crosswalk ${l!.crosswalkPairs}쌍으로 이었습니다. `
      + `연결의 상세는 [상세 ▾]의 연결 해부·데이터 흐름에서 볼 수 있어요`;
  }
  if (l?.note) {
    return `이 답변이 사용한 데이터 ${n}종 — 온톨로지 연결로 이었습니다(${l.note}). `
      + `연결의 상세는 [상세 ▾]의 연결 해부·데이터 흐름에서 볼 수 있어요`;
  }
  if ((l?.metricLineage?.length ?? 0) >= 2) {
    return `이 답변이 사용한 데이터 ${n}종 — 지표 계보(${l!.metricLineage!.slice(0, 2).map(lineageKo).join(' → ')})로 `
      + `이었습니다. 계보의 상세는 [상세 ▾]의 연결 해부에서 볼 수 있어요`;
  }
  // U63c: 자산 1종이면 '연결'이라는 말이 성립하지 않는다(이을 대상이 없다) — 정직하게.
  if (n <= 1) {
    return `이 답변이 사용한 데이터 ${n}종 — 단일 자산 조회로 답했습니다. `
      + `실행한 질의는 [상세 ▾]의 실행 쿼리에서 볼 수 있어요`;
  }
  return `이 답변이 사용한 데이터 ${n}종 — 이 답변에는 지도에 그릴 연결 근거가 없어 사용한 데이터만 표시합니다`;
}

export function JourneyScene({ annotation }: { annotation: PlatformAnnotation | undefined }) {
  const journey: MapJourney | null = useMemo(() => buildJourney(annotation), [annotation]);
  const [ui, dispatch] = useReducer(reducer, { activeHop: null, inspectorHopId: null });

  // 새 답변 → 상태 초기화(complete)
  useEffect(() => { dispatch({ type: 'reset' }); }, [annotation]);

  // 키보드: 이 장면 컨테이너에 focus가 있을 때만(전역 아님 — P1-6)
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (['INPUT', 'TEXTAREA', 'BUTTON'].includes(tag)) return;
    if (!journey) return;
    if (e.key === 'ArrowLeft') { dispatch({ type: 'prev' }); e.preventDefault(); }
    if (e.key === 'ArrowRight') { dispatch({ type: 'next', max: journey.hops.length }); e.preventDefault(); }
  }, [journey]);

  const active = ui.activeHop;
  // #185 fix: journey prop 참조 안정화 — hops·activeHop이 실제로 바뀔 때만 새 객체
  const journeyProp = useMemo(
    () => (journey ? { hops: journey.hops, activeHop: active } : null),
    [journey, active]);
  const onEdgeClick = useCallback((hopId: string) => dispatch({ type: 'inspect', hopId }), []);
  if (!journey) return null;
  const isChain = journey.kind === 'chain';
  const cur = active != null ? journey.hops.find((h) => h.order === active) : null;
  const inspectorHop = ui.inspectorHopId
    ? journey.hops.find((h) => h.hopId === ui.inspectorHopId) ?? null : null;

  return (
    <div className="relative flex h-full min-h-0 flex-col" data-testid="journey-scene"
      tabIndex={0} onKeyDown={onKeyDown} aria-label="데이터 여정">
      {/* ── 결론 배너 (U40: highlight 우선 — 수치1·라벨1·qualifier1 + 전체 결론 disclosure) ── */}
      {journey.conclusion && (() => {
        const con = journey.conclusion;
        const h = con.highlight;
        const firstSentence = con.text.split(/(?<=다\.)\s/)[0] ?? con.text;
        return (
          <div className="shrink-0 border-b px-4 py-2.5"
            style={{ borderColor: 'var(--ink-600)', background: 'var(--ink-800)' }}
            data-testid="journey-conclusion">
            <div className="flex items-center gap-3">
              <span className="shrink-0 rounded-[var(--r-pill)] px-2 py-0.5 font-medium"
                style={{ background: con.finding_kind === 'observation' ? 'var(--jade)' : 'var(--amber)',
                         color: '#06121a', fontSize: 'var(--fs-fine)' }}>
                {con.finding_kind === 'observation' ? '관측' : '가설'}
              </span>
              {h ? (
                <span className="min-w-0 flex-1 truncate" style={{ fontSize: 'var(--fs-meta)' }}>
                  {h.label}{' '}
                  <strong className="tabular-nums" style={{ fontSize: 'var(--fs-metric)', color: 'var(--jade)' }}
                    data-testid="journey-highlight-value">
                    {h.value}{h.unit ? ` ${h.unit}` : ''}
                  </strong>
                </span>
              ) : (
                /* P0-6: highlight 부재 — 첫 문장만(bounded), 전문 기본 노출 금지 */
                <span className="min-w-0 flex-1 truncate" style={{ fontSize: 'var(--fs-meta)' }}>
                  {firstSentence}
                </span>
              )}
            </div>
            {h?.qualifier && (
              <div className="mt-1" style={{ fontSize: 'var(--fs-fine)', color: 'var(--mist)' }}>
                {h.qualifier}
              </div>
            )}
            <details className="mt-1">
              <summary className="cursor-pointer list-none" role="button" aria-expanded={undefined}
                style={{ fontSize: 'var(--fs-fine)', color: 'var(--aqua)' }}
                data-testid="journey-conclusion-full-toggle">
                전체 결론 ▾
              </summary>
              <p className="mt-1 leading-snug" style={{ fontSize: 'var(--fs-meta)' }}
                data-testid="journey-conclusion-full">
                {con.text}
              </p>
            </details>
          </div>
        );
      })()}
      {!journey.conclusion && !isChain && (
        <div className="shrink-0 border-b px-4 py-2" style={{ borderColor: 'var(--ink-600)' }}>
          <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--mist)' }}
            data-testid="journey-asset-usage-note">
            {assetUsageNote(journey)}
          </span>
        </div>
      )}

      {/* ── 지도 (journey 모드) ── */}
      <div className="min-h-0 flex-1">
        <AssetMap
          lighting={IDLE_LIGHTING} badges={EMPTY_BADGES} selectedBridge={null}
          journey={journeyProp}
          onJourneyEdgeClick={onEdgeClick}
          onNodeClick={NOOP} onBridgeClick={NOOP}
        />
      </div>

      {/* ── 여정 레일 — 논리 hop의 단일 진실(병합·생략 없음) ── */}
      {isChain && (
        <div className="relative z-20 shrink-0 border-t px-3 py-2" style={{ borderColor: 'var(--ink-600)', background: 'var(--ink-800)' }}
          data-testid="journey-rail">
          <div className="flex items-center gap-1 overflow-x-auto pb-1" role="list" aria-label="여정 단계">
            {journey.hops.map((h) => {
              const isActive = active === h.order;
              const color = GRADE_COLOR[h.evidence.grade] ?? 'var(--slate)';
              return (
                <button key={h.hopId} role="listitem"
                  onClick={() => dispatch({ type: 'jump', order: h.order })}
                  className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-[var(--r-md)] border px-2.5 py-1 text-left"
                  style={{ borderColor: isActive ? 'var(--flow-solid)' : 'var(--ink-600)',
                           background: isActive ? 'var(--ink-700)' : 'transparent' }}
                  data-testid={`journey-hop-${h.hopId}`}
                  aria-current={isActive ? 'step' : undefined}>
                  <span style={{ color: 'var(--flow-solid)', fontWeight: 700, fontSize: 'var(--fs-meta)' }}>
                    {'①②③④⑤'[h.order - 1] ?? h.order}
                  </span>
                  <span className="max-w-40 truncate" style={{ fontSize: 'var(--fs-fine)' }}>
                    {h.traversal.from} → {h.traversal.to}
                  </span>
                  {h.presentation.headline && (
                    <span className="shrink-0 font-semibold tabular-nums" style={{ color, fontSize: 'var(--fs-fine)' }}>
                      {h.presentation.headline}
                    </span>
                  )}
                  {h.map.status !== 'mapped' && (
                    <span title={h.evidence.offMapAssets.join(', ')}
                      style={{ fontSize: '11px', color: 'var(--mist)' }}>
                      {h.map.status === 'partial' ? `+지도밖 ${h.evidence.offMapAssets.join('·')}` : '지도 앵커 없음'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 현재 hop 상세 줄 + 컨트롤 */}
          <div className="mt-1 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1 truncate" aria-live="polite"
              style={{ fontSize: 'var(--fs-meta)', color: 'var(--pearl)' }}>
              {cur ? (
                <>
                  <span style={{ color: 'var(--flow-solid)' }}>hop {cur.order}/{journey.hops.length}</span>
                  {' · '}{cur.presentation.edgeLabel}
                  {cur.presentation.edgeSubtitle && (
                    <span style={{ color: 'var(--mist)' }}> — {cur.presentation.edgeSubtitle}</span>
                  )}
                  {' · '}<span style={{ color: 'var(--mist)' }}>{cur.presentation.summary.slice(0, 60)}</span>
                </>
              ) : (
                <span style={{ color: 'var(--mist)' }}>
                  전체 경로 표시 중 — {journey.hops.length}단계를 온톨로지 연결로 이어 답변을 만들었습니다
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {active == null ? (
                <button onClick={() => dispatch({ type: 'start' })}
                  className="min-h-11 rounded-[var(--r-pill)] px-3 font-medium"
                  style={{ background: 'var(--flow)', color: '#06121a', fontSize: 'var(--fs-meta)' }}
                  data-testid="journey-start">
                  처음부터 보기
                </button>
              ) : (
                <>
                  <button onClick={() => dispatch({ type: 'prev' })} disabled={active <= 1}
                    className="min-h-11 min-w-11 rounded-[var(--r-md)]" aria-label="이전 단계"
                    style={{ background: 'var(--ink-700)', opacity: active <= 1 ? 0.4 : 1 }}>◀</button>
                  <button onClick={() => dispatch({ type: 'next', max: journey.hops.length })}
                    disabled={active >= journey.hops.length}
                    className="min-h-11 min-w-11 rounded-[var(--r-md)]" aria-label="다음 단계"
                    style={{ background: 'var(--ink-700)', opacity: active >= journey.hops.length ? 0.4 : 1 }}
                    data-testid="journey-next">▶</button>
                  <button onClick={() => dispatch({ type: 'reset' })}
                    className="min-h-11 rounded-[var(--r-pill)] px-2.5" aria-label="전체 경로로 복귀"
                    style={{ background: 'var(--ink-700)', color: 'var(--mist)', fontSize: 'var(--fs-fine)' }}>
                    전체
                  </button>
                </>
              )}
              {cur?.anatomyAvailable && (
                <button onClick={() => dispatch({ type: 'inspect', hopId: cur.hopId })}
                  className="min-h-11 rounded-[var(--r-pill)] px-3"
                  style={{ background: 'var(--ink-700)', border: '1px solid var(--aqua)', color: 'var(--aqua)', fontSize: 'var(--fs-meta)' }}
                  data-testid="journey-anatomy-button">
                  이 연결의 근거
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── hop 해부 시트 ── */}
      {inspectorHop && (
        <HopAnatomySheet hop={inspectorHop} annotation={annotation}
          onClose={() => dispatch({ type: 'inspect', hopId: null })} />
      )}
    </div>
  );
}
