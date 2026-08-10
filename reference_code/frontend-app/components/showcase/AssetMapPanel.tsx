'use client';

// U13 우측 패널 루트 — 자산 지도(허브) + 답변별 데이터 연결 시연.
// P8: 답변 오면 '대표 개념 매핑 카드'(왜 이렇게 데이터를 준비해야 하나)를 기본으로,
//     원하면 '전체 그래프'(세밀) / '자산 지도'(전체)로 전환.
import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useAppContext } from '@/lib/context';
import { AssetMap } from '@/components/graph/AssetMap';
import { RealNodeGraph } from '@/components/graph/RealNodeGraph';
import { AnatomyView } from './AnatomyView';
import { EmptyDetail } from '@/components/showcase/EmptyDetail';
import { FlywheelPanel } from './FlywheelPanel';
import { ChainView } from './ChainView';
import { DataFlowView } from './DataFlowView';
import { JourneyScene } from './JourneyScene';
import { QueryView } from './QueryView';
import { buildJourney } from '@/lib/map-journey';
import { buildAssetEvidence } from '@/lib/asset-evidence';
import { buildAnatomy, fetchAnatomyData, fetchLiveAnatomy, anatomyEntities, type LiveAnatomy } from '@/lib/anatomy';
import { KpiStrip } from './KpiStrip';
import { DrilldownPanel } from './DrilldownPanel';
import { highlightedKpis } from '@/lib/kpi';
import { fetchCatalog } from '@/lib/catalog-client';
import { mapTablesToNodes, graphPathsToRealGraph, extractProvenance } from '@/lib/asset-map';

type View = 'journey' | 'flow' | 'chain' | 'concept' | 'detail' | 'query' | 'overview' | 'flywheel';

export function AssetMapPanel() {
  const {
    annotation, lighting, badges, setBadges,
    drilldownSelection, setDrilldownSelection,
    citeFocus, setCiteFocus,
  } = useAppContext();
  const [view, setView] = useState<View>('overview');

  const [anatomyData, setAnatomyData] = useState<Awaited<ReturnType<typeof fetchAnatomyData>>>(null);
  useEffect(() => { fetchAnatomyData().then(setAnatomyData); }, []);
  // U19: 이 답변의 엔티티로 실데이터 행·검산 조회(/api/anatomy) — 전 카테고리 커버
  const [liveAnatomy, setLiveAnatomy] = useState<LiveAnatomy | null>(null);
  useEffect(() => {
    const { category, merchant } = anatomyEntities(annotation);
    if (!category && !merchant) { setLiveAnatomy(null); return; }
    let alive = true;
    fetchLiveAnatomy(category, merchant).then((d) => { if (alive) setLiveAnatomy(d); });
    return () => { alive = false; };
  }, [annotation]);
  const anatomy = useMemo(() => buildAnatomy(annotation, anatomyData, liveAnatomy), [annotation, anatomyData, liveAnatomy]);
  const kpiHighlight = useMemo(() => {
    const toolNames = ((annotation?.tool_calls ?? []) as Array<{ tool?: string }>).map((t) => String(t.tool ?? ''));
    return highlightedKpis(annotation, toolNames);
  }, [annotation]);

  // U37: evidence chain 결과 — 전용 타임라인 뷰 대상
  const chain = (annotation?.citation as { chain?: import('@/lib/types').ChainResult | null } | undefined)?.chain;
  const hasChain = chain?.status === 'ok' && (chain.hops?.length ?? 0) > 0;
  // U38b: 데이터 흐름 탭 — chain이거나 사용 자산 2개 이상이면 성립
  const hasFlow = useMemo(() => hasChain || buildAssetEvidence(annotation).length >= 2,
    [annotation, hasChain]);
  // U39: 여정 기본 장면 — buildJourney 성립 시(chain 또는 asset-usage)
  const hasJourney = useMemo(() => buildJourney(annotation) !== null, [annotation]);
  // U47: 실행 쿼리 탭 — 이 답변이 Gremlin/SQL/지표 질의를 실제로 돌렸을 때만(정적 인덱스 답변은 없음)
  const hasQuery = useMemo(() => (
    ((annotation?.citation as { queries?: unknown[] } | undefined)?.queries?.length ?? 0) > 0
  ), [annotation]);

  // 이 답변이 렌더할 데이터가 있나(그래프/시장/metric/coverage/portfolio)
  const hasAnswerData = useMemo(() => {
    const g = graphPathsToRealGraph(annotation);
    const { marketRows } = extractProvenance(annotation);
    const c = annotation?.citation as {
      metrics?: Array<{ value?: unknown }>;
      portfolio?: { pairs?: unknown[]; card_count?: number };
      coverage?: { strong?: unknown[]; weak?: unknown[] };
    } | undefined;
    const hasMetric = (c?.metrics ?? []).some((m) => m.value != null);
    const hasCoverage = !!((c?.coverage?.strong?.length) || (c?.coverage?.weak?.length));
    const hasPortfolio = !!(c?.portfolio && ((c.portfolio.pairs?.length) || c.portfolio.card_count));
    return g.nodes.length > 0 || marketRows.length > 0 || hasMetric || hasCoverage || hasPortfolio;
  }, [annotation]);

  // U17 FR-3a: 답변 도착 시퀀스 — overview 점등(순차 애니메이션) 2.5초 → concept/detail 자동 전환.
  // 사용자가 그 사이 탭을 조작하면 전환 취소. reduced-motion이면 1초 정지 후 전환.
  // annotation이 바뀔 때만(새 답변) 발동 — view 변경이 재발동시키지 않게 의존성은 annotation만.
  const userNavRef = useRef(false);
  // U41fix(#185 방어): ReactFlow로 가는 핸들러 참조 안정화
  const handleNodeSelect = useCallback((id: string) => setDrilldownSelection({ kind: 'node', id }), [setDrilldownSelection]);
  const handleBridgeSelect = useCallback((id: string) => setDrilldownSelection({ kind: 'bridge', id }), [setDrilldownSelection]);
  useEffect(() => {
    if (citeFocus) return;   // cite pill 포커스 활성이면 overview 유지
    if (!annotation) { setView('overview'); return; }
    userNavRef.current = false;
    // U38 P1-6: 자동 지연 전환 제거 — 답변 도착 시점에 한 번만 target 설정, 이후 불변
    // (2.5초 뒤 화면이 멋대로 바뀌어 발표 대상이 바뀌던 문제). 점등은 overview 탭에서 여전히 확인 가능.
    const target: View = hasJourney ? 'journey' : hasFlow ? 'flow' : hasChain ? 'chain' : anatomy ? 'concept' : hasAnswerData ? 'detail' : 'overview';
    setView(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotation]);

  // U16 2번: 본문 cite pill 클릭 신호(citeFocus) → overview 뷰 전환(로컬 state만; context setState를
  // 안 건드려 ChatPanel messages effect 재발동/무한 루프를 원천 차단). nonce로만 발동(재클릭 반영).
  const citeNonce = citeFocus?.nonce ?? 0;
  useEffect(() => {
    if (citeFocus) setView('overview');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citeNonce]);

  // 점등/드릴다운은 citeFocus를 '파생'으로 우선 반영(context setState 연쇄 없음).
  // citeFocus가 활성이면 그 다리/노드를 점등, 아니면 답변 기반 lighting.
  const effectiveLighting = useMemo(() => (
    citeFocus
      ? { litNodes: new Set(citeFocus.nodeIds), litBridges: new Set([citeFocus.bridgeId]), phase: 'lit' as const, unmappedTools: [] }
      : lighting
  ), [citeFocus, lighting]);
  // U22 A3: nodeIds-only citeFocus(bridgeId='')는 드릴다운 미표시 — 라벨 없는 빈 패널 수리
  const effectiveBridge = citeFocus
    ? (citeFocus.bridgeId ? { kind: 'bridge' as const, id: citeFocus.bridgeId } : null)
    : drilldownSelection;

  // U17 FR-3c: ESC → cite 포커스/드릴다운 해제 (U13 §6.2 ESC 복귀)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setCiteFocus(null); setDrilldownSelection(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setCiteFocus, setDrilldownSelection]);

  useEffect(() => {
    let alive = true;
    fetchCatalog().then((cat) => {
      if (!alive || !cat) return;
      setBadges(mapTablesToNodes(cat.assets, cat.snapshotDate));
    });
    return () => { alive = false; };
  }, [setBadges]);

  // 사용 가능한 탭 구성
  // U42: 모든 답변에서 [기본 장면 탭 1개] + [상세 ▾] 구조 통일(멀티홉 UI와 동일 —
  // 사용자 지정). 여정 성립 시 기본=여정, 아니면 도착 target 뷰를 기본 탭으로 승격.
  // U63c: 상세 메뉴는 **항상 같은 6항목**을 보여준다(사용자 지정: 데이터 흐름·연결 경로·
  // 연결 해부·접근 가능한 데이터 범위·실행 쿼리·자가개선). 근거가 없는 항목은 목록에서
  // 사라지는 대신 열었을 때 '왜 없는지'를 말한다 — 탭 구성이 답변마다 달라지면 발표 중
  // "있던 탭이 없어졌다"가 되고, 없는 이유도 알 수 없다.
  const detailViews: Array<{ id: View; label: string; empty?: boolean }> = [
    { id: 'flow', label: '데이터 흐름', empty: !hasFlow },
    { id: 'chain', label: '연결 경로', empty: !hasChain },
    { id: 'concept', label: '연결 해부', empty: !anatomy },
    { id: 'detail', label: '상세 그래프', empty: !hasAnswerData },
    { id: 'query', label: '실행 쿼리', empty: !hasQuery },
    { id: 'overview', label: '접근 가능한 데이터 범위' },
    { id: 'flywheel', label: '자가개선' },
  ];

  const tabs: Array<{ id: View; label: string }> = [];
  if (hasJourney) {
    tabs.push({ id: 'journey', label: '여정' });
  } else {
    // 기본 장면 = 이 답변의 대표 뷰(해부 > 데이터 흐름 > 상세 그래프 > 데이터 범위)
    const primary = detailViews.find((d) =>
      d.id === (anatomy ? 'concept' : hasFlow ? 'flow' : hasAnswerData ? 'detail' : 'overview'));
    if (primary) tabs.push(primary);
  }

  // U18 잔상 버그 수정: 현재 view가 유효 탭에 없으면(예: 이전 답변은 anatomy 있어 concept였는데
  // 새 답변은 anatomy=null이라 concept 탭이 사라짐) → 유효한 첫 탭으로 폴백. 이전 답변의 anatomy가
  // 화면에 남는 것을 원천 차단(렌더는 effectiveView로만 분기).
  const allViews = [...tabs, ...detailViews];
  const effectiveView: View = allViews.some((t) => t.id === view) ? view : (allViews[0]?.id ?? 'overview');

  return (
    <div className="flex h-full flex-col">
      {/* U14 P1-3: KPI 스트립 상시(우측 지도 상단) */}
      <KpiStrip highlighted={kpiHighlight} />
      {(tabs.length > 0) && (
        <div className="flex items-center gap-1 px-2 pt-2">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => { userNavRef.current = true; setView(t.id); }}
              className="rounded-[var(--r-pill)] px-3 py-1 text-[13px] font-medium transition-all"
              style={{
                background: effectiveView === t.id ? 'var(--flow)' : 'var(--ink-700)',
                color: effectiveView === t.id ? '#06121a' : 'var(--mist)',
              }}>
              {t.label}
            </button>
          ))}
          {(
            <details className="relative" data-testid="detail-menu">
              <summary className="cursor-pointer list-none rounded-[var(--r-pill)] px-3 py-1 text-[13px] font-medium"
                style={{ background: detailViews.some((d) => d.id === effectiveView) ? 'var(--flow)' : 'var(--ink-700)',
                         color: detailViews.some((d) => d.id === effectiveView) ? '#06121a' : 'var(--mist)' }}>
                상세 ▾
              </summary>
              <div className="absolute left-0 top-full z-40 mt-1 flex min-w-44 flex-col rounded-[var(--r-md)] border p-1"
                style={{ borderColor: 'var(--ink-600)', background: 'var(--ink-800)' }}>
                {detailViews.filter((d) => !tabs.some((tb) => tb.id === d.id)).map((d) => (
                  <button key={d.id}
                    onClick={(e) => { userNavRef.current = true; setView(d.id);
                      (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}
                    className="flex items-center justify-between gap-3 rounded-[var(--r-md)] px-3 py-2 text-left text-[13px]"
                    style={{ color: effectiveView === d.id ? 'var(--flow-solid)'
                      : d.empty ? 'var(--mist)' : 'var(--pearl)' }}
                    data-testid={`detail-menu-${d.id}`}>
                    <span>{d.label}</span>
                    {/* U63c: 항목은 항상 있고, 근거 없음은 뱃지로 미리 알린다(클릭 전에 판단 가능) */}
                    {d.empty && (
                      <span className="rounded-[var(--r-pill)] px-1.5 text-[11px]"
                        style={{ border: '1px solid var(--ink-600)', color: 'var(--mist)' }}>
                        없음
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0">
        {effectiveView === 'journey' && hasJourney && <JourneyScene annotation={annotation} />}
        {/* U63c: annotation 미도착이면 "없음"이 아니라 대기 — 질문 직후 오해 방지 */}
        {effectiveView === 'flow' && (hasFlow
          ? <DataFlowView annotation={annotation} />
          : <EmptyDetail pending={!annotation} label="데이터 흐름" reason="이 답변은 자산 1종만 조회해 흐를 구간이 없습니다." />)}
        {effectiveView === 'chain' && (hasChain
          ? <ChainView chain={chain!} />
          : <EmptyDetail pending={!annotation} label="연결 경로" reason="이 답변은 멀티홉 경로를 타지 않았습니다(단일 조회)." />)}
        {effectiveView === 'concept' && (anatomy
          ? <AnatomyView anatomy={anatomy} />
          : <EmptyDetail pending={!annotation} label="연결 해부" reason="이 답변에는 해부할 어휘 연결(카테고리·가맹점 매핑)이 없습니다." />)}
        {effectiveView === 'query' && (hasQuery
          ? <QueryView annotation={annotation} />
          : <EmptyDetail pending={!annotation} label="실행 쿼리" reason="이 답변은 엔진 질의 없이 처리됐습니다(안내·기권 등)." />)}
        {effectiveView === 'flywheel' && <FlywheelPanel />}
        {effectiveView === 'detail' && (hasAnswerData
          ? <RealNodeGraph annotation={annotation} />
          : <EmptyDetail pending={!annotation} label="상세 그래프" reason="이 답변에는 그릴 노드·수치 데이터가 없습니다." />)}
        {effectiveView === 'overview' && (
          <AssetMap
            lighting={effectiveLighting}
            badges={badges}
            crosswalkCount={annotation?.ontology?.crosswalk?.length}
            selectedBridge={effectiveBridge?.kind === 'bridge' ? effectiveBridge.id : null}
            onNodeClick={handleNodeSelect}
            onBridgeClick={handleBridgeSelect}
          />
        )}
      </div>

      {effectiveBridge && effectiveView === 'overview' && (
        <div className="h-[45%] min-h-0">
          <DrilldownPanel
            selection={effectiveBridge}
            annotation={annotation}
            onClose={() => { setDrilldownSelection(null); setCiteFocus(null); }}
          />
        </div>
      )}
    </div>
  );
}
