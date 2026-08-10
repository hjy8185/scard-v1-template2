'use client';

// U13 자산 지도 — React Flow 캔버스. 3진영 고정배치 + 점등 + SMUS 뱃지 + 다리.
// 접근성: A3(색+라벨 병행), A4(키보드 포커스/클릭), L5/A1(reduced-motion 시 즉시 점등).

import { useMemo, useCallback, useEffect } from 'react';
import {
  ReactFlow, Background, type Node, type Edge, type NodeProps, Handle, Position,
  useReactFlow, ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { AssetNode, Bridge, LightingState, GovernanceBadge, Camp } from '@/lib/types';
import { ASSET_NODES, BRIDGES } from '@/lib/asset-map';
import type { JourneyHop } from '@/lib/map-journey';

const GRADE_COLOR: Record<string, string> = {
  '공개-실': 'var(--jade)', '집계': 'var(--aqua)', '합성': 'var(--amber)',
  '추정': 'var(--coral)', 'unsupported': 'var(--slate)',
};

// U48: SVG 색은 **리터럴만** — React Flow는 style/labelStyle의 stroke·fill을 SVG 속성으로
// 내려주고, SVG는 `var(--x)`를 해석하지 못해 검정으로 폴백한다(여정 엣지 라벨이 '검정 박스'로
// 보인 원인). 특히 `--flow`는 linear-gradient라 stroke/fill에 넣으면 애초에 무효다.
// globals.css 토큰과 값이 같아야 하므로 여기서만 정의하고 CSS 쪽 변경 시 함께 갱신한다.
const SVG = {
  jade: '#2BE8A5',      // --jade   공개-실
  aqua: '#38C7E0',      // --aqua   집계
  mist: '#AFC4CD',      // --mist   보조 텍스트
  ink600: '#1B2A33',    // --ink-600 미점등 선
  ink900: '#070B0E',    // --ink-900 라벨 배경
  flow: '#38C7E0',      // --flow는 그라디언트 → 여정 강조는 aqua 단색으로 대체
} as const;
const CAMP_X: Record<Camp, number> = { terms: 40, market: 340, synthetic: 640 };
const GRADE_LABEL: Record<string, string> = {
  '공개-실': '공개·실', '집계': '집계', '합성': '합성', '추정': '추정', 'unsupported': '근거없음',
};

interface NodeData {
  asset: AssetNode; lit: boolean; dimmed: boolean; badge?: GovernanceBadge;
  reducedMotion: boolean;
  // U39: 여정 순서 배지(같은 노드 재방문 시 ①③처럼 복수) + 현재 hop 여부
  orderBadges?: number[]; isCurrent?: boolean;
  [key: string]: unknown;
}

function AssetNodeView({ data }: NodeProps) {
  const { asset, lit, dimmed, badge, reducedMotion, orderBadges, isCurrent } = data as NodeData;
  const color = GRADE_COLOR[asset.grade] ?? 'var(--slate)';   // 노드 색 = 자산 등급(hop 등급으로 덮지 않음)
  const locked = !asset.connected;
  return (
    <div
      tabIndex={0}
      aria-label={`${asset.label}, ${asset.scaleText}, 등급 ${GRADE_LABEL[asset.grade]}${lit ? ', 이 답변에 사용됨' : ''}${locked ? ', 런타임 미연동' : ''}`}
      style={{
        width: 190, padding: '10px 12px', borderRadius: 'var(--r-md)',
        background: 'var(--ink-800)',
        // U48: --flow는 linear-gradient — border/boxShadow/color에 넣으면 브라우저가 무시한다.
        // 현재 hop 강조는 단색(aqua)으로.
        border: isCurrent ? `2.5px solid ${SVG.flow}` : `1.5px solid ${lit ? color : 'var(--ink-600)'}`,
        boxShadow: isCurrent ? `0 0 22px ${SVG.flow}` : lit ? `0 0 16px ${color}` : 'none',
        opacity: locked ? 0.5 : dimmed ? 0.25 : 1,
        transition: reducedMotion ? 'none' : 'opacity .4s, box-shadow .4s, border-color .4s',
        color: 'var(--pearl)', outline: 'none',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <div className="flex items-center justify-between gap-1">
        <span className="text-sm font-medium">
          {/* U39: 여정 순서 배지 — 같은 노드 재방문은 ①③처럼 나열(병합 아님을 시각화) */}
          {orderBadges?.length ? (
            <span style={{ color: SVG.flow, fontWeight: 700, marginRight: 4 }}>
              {orderBadges.map((o) => '①②③④⑤'[o - 1] ?? o).join('')}
            </span>
          ) : null}
          {locked ? '🔒 ' : ''}{asset.label}
        </span>
        {/* A3: 색 단독 의존 금지 — 등급 텍스트 뱃지 병행 */}
        <span style={{ fontSize: 12, padding: '1px 5px', borderRadius: 'var(--r-pill)', background: color, color: 'var(--ink-900)' }}>
          {GRADE_LABEL[asset.grade]}
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--mist)', marginTop: 3 }}>{asset.scaleText}</div>
      {badge && badge.status !== 'none' && (
        <div title={badge.snapshotLabel}
          style={{ fontSize: 12, marginTop: 4, color: 'var(--aqua)', opacity: badge.status === 'partial' ? 0.6 : 1 }}>
          {badge.status === 'full'
            ? '✓ SMUS 등록'
            : `◐ SMUS ${badge.registeredTables.length} of ${asset.backingTables.length} 등록`}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { asset: AssetNodeView };

interface AssetMapProps {
  lighting: LightingState;
  badges: Map<string, GovernanceBadge>;
  onNodeClick?: (id: string) => void;
  onBridgeClick?: (id: string) => void;
  crosswalkCount?: number;               // P6: 이번 답변의 구체 연결 쌍 수(다리 라벨 동적화)
  selectedBridge?: string | null;        // P3-5: 선택된 다리 → fitView 줌
  // U39 journey 모드: 여정 hop과 활성 커서 — 없으면 기존 동작 100% 불변
  journey?: { hops: JourneyHop[]; activeHop: number | null } | null;
  onJourneyEdgeClick?: (hopId: string) => void;
}

// P3-5: 선택된 다리 구간으로 fitView 줌인 (ReactFlowProvider 내부에서만 useReactFlow 사용)
function BridgeZoom({ selectedBridge }: { selectedBridge?: string | null }) {
  const rf = useReactFlow();
  useEffect(() => {
    if (!selectedBridge) { rf.fitView({ duration: 400 }); return; }
    const b = BRIDGES.find((x) => x.id === selectedBridge);
    if (!b) return;
    const ids = [
      b.from === 'terms' ? 'benefit' : b.from === 'market' ? 'seoul_sales' : 'reward_ledger',
      b.to === 'terms' ? 'benefit' : b.to === 'market' ? 'seoul_sales' : 'transaction',
    ];
    rf.fitView({ nodes: ids.map((id) => ({ id })), duration: 500, padding: 0.35 });
  }, [selectedBridge, rf]);
  return null;
}

export function AssetMap(props: AssetMapProps) {
  // ReactFlowProvider로 감싸 useReactFlow(BridgeZoom) 사용 가능하게
  return (
    <ReactFlowProvider>
      <AssetMapInner {...props} />
    </ReactFlowProvider>
  );
}

function AssetMapInner({ lighting, badges, onNodeClick, onBridgeClick, crosswalkCount, selectedBridge, journey, onJourneyEdgeClick }: AssetMapProps) {
  const reducedMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const anyLit = lighting.litNodes.size > 0 || lighting.litBridges.size > 0;

  // U39 journey 파생: 노드별 순서 배지 / 현재 hop 노드 / 방문 노드
  const jState = useMemo(() => {
    if (!journey?.hops.length) return null;
    const orderBadges = new Map<string, number[]>();
    const visited = new Set<string>();
    let currentNodes = new Set<string>();
    for (const h of journey.hops) {
      const inScope = journey.activeHop == null || h.order <= journey.activeHop;
      for (const nid of h.evidence.assetNodeIds) {
        if (!orderBadges.has(nid)) orderBadges.set(nid, []);
        orderBadges.get(nid)!.push(h.order);
        if (inScope) visited.add(nid);
      }
      if (journey.activeHop != null && h.order === journey.activeHop)
        currentNodes = new Set(h.evidence.assetNodeIds);
    }
    return { orderBadges, visited, currentNodes };
  }, [journey]);

  const nodes: Node[] = useMemo(() => {
    // 진영별 세로 스택 배치
    const perCamp: Record<Camp, number> = { terms: 0, market: 0, synthetic: 0 };
    return ASSET_NODES.map((a: AssetNode) => {
      const y = 20 + perCamp[a.camp] * 92;
      perCamp[a.camp] += 1;
      const lit = jState ? jState.visited.has(a.id) : lighting.litNodes.has(a.id);
      const dimmed = jState ? !jState.visited.has(a.id) : (anyLit && !lit);
      return {
        id: a.id, type: 'asset',
        position: { x: CAMP_X[a.camp], y },
        data: { asset: a, lit, dimmed, badge: badges.get(a.id), reducedMotion,
                orderBadges: jState?.orderBadges.get(a.id),
                isCurrent: jState?.currentNodes.has(a.id) ?? false },
        draggable: false,
      };
    });
  }, [lighting, badges, anyLit, reducedMotion, jState]);

  const edges: Edge[] = useMemo(() => BRIDGES.map((b: Bridge) => {
    const lit = lighting.litBridges.has(b.id);
    // P6: crosswalk 다리가 점등되면 이번 답변의 실제 연결 쌍 수를 라벨에(정적 "32매핑" 대신)
    const dynLabel = (lit && b.id === 'crosswalk' && crosswalkCount)
      ? `이 답변: ${crosswalkCount}개 연결 →` : b.label;
    return {
      id: b.id,
      source: b.endpoints?.source
        ?? (b.from === 'terms' ? 'benefit' : b.from === 'market' ? 'seoul_sales' : 'reward_ledger'),
      target: b.endpoints?.target
        ?? (b.to === 'terms' ? 'benefit' : b.to === 'market' ? 'seoul_sales' : 'transaction'),
      label: dynLabel,
      animated: lit && !reducedMotion,
      style: { stroke: lit ? SVG.jade : SVG.ink600, strokeWidth: lit ? 2 : 1, opacity: anyLit && !lit ? 0.3 : 1 },
      labelStyle: { fill: lit ? SVG.jade : SVG.mist, fontSize: 12 },
      labelBgStyle: { fill: SVG.ink900, fillOpacity: 0.85 },
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 4,
      ...(jState ? { style: { stroke: SVG.ink600, strokeWidth: 1, opacity: 0.15 },
                     label: undefined, animated: false } : {}),
    };
  }), [lighting, anyLit, reducedMotion, crosswalkCount, jState]);

  // U39: 검수된 verifiedLink만 동적 엣지(id 'jrn:' namespace — 정적 bridge와 분리)
  const journeyEdges: Edge[] = useMemo(() => {
    if (!journey?.hops.length) return [];
    return journey.hops
      .filter((h) => h.map.verifiedLink
        && (journey.activeHop == null || h.order <= journey.activeHop))
      .map((h) => ({
        id: `jrn:${h.hopId}`,
        source: h.map.verifiedLink!.sourceNodeId,
        target: h.map.verifiedLink!.targetNodeId,
        label: `${'①②③④⑤'[h.order - 1] ?? h.order} ${h.map.verifiedLink!.label}`,
        animated: !reducedMotion && journey.activeHop === h.order,
        style: { stroke: SVG.flow, strokeWidth: journey.activeHop === h.order ? 3 : 2 },
        labelStyle: { fill: SVG.flow, fontSize: 12, fontWeight: 600 },
        // 라벨 배경: 선 위 글자 가독성용. 불투명 검정 박스로 보이지 않게 살짝 투명 + 여백·라운드.
        labelBgStyle: { fill: SVG.ink900, fillOpacity: 0.85, stroke: SVG.flow, strokeWidth: 0.5 },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 4,
        zIndex: 10,
      }));
  }, [journey, reducedMotion]);

  // U41fix(#185): 결합 배열도 memo — controlled ReactFlow에 매 렌더 새 배열 금지
  const allEdges: Edge[] = useMemo(() => [...edges, ...journeyEdges], [edges, journeyEdges]);

  const handleNodeClick = useCallback((_: unknown, node: Node) => onNodeClick?.(node.id), [onNodeClick]);
  const handleEdgeClick = useCallback((_: unknown, edge: Edge) => {
    if (edge.id.startsWith('jrn:')) { onJourneyEdgeClick?.(edge.id.slice(4)); return; }
    onBridgeClick?.(edge.id);
  }, [onBridgeClick, onJourneyEdgeClick]);

  return (
    <div style={{ width: '100%', height: '100%', minHeight: journey ? 240 : 420 }}>
      <ReactFlow
        nodes={nodes} edges={allEdges} nodeTypes={nodeTypes}
        colorMode="dark" fitView
        nodesDraggable={false} nodesConnectable={false} elementsSelectable
        onNodeClick={handleNodeClick} onEdgeClick={handleEdgeClick}
        proOptions={{ hideAttribution: true }}
      >
        <BridgeZoom selectedBridge={selectedBridge} />
        <Background color="var(--ink-600)" gap={20} />
      </ReactFlow>
    </div>
  );
}
