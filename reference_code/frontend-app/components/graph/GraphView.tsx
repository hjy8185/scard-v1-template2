'use client';

// U13: GraphVisualizer(cytoscape) → React Flow 이식. 지식 서브그래프 표시(드릴다운 graph 케이스).
// 레이아웃: 간단 원형/격자 배치(fcose 대체 — 소규모 서브그래프라 충분).

import { useMemo } from 'react';
import { ReactFlow, Background, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Subgraph } from '@/lib/types';
import { getNodeStyle, getEdgeStyle } from '@/lib/graph-styles';

interface GraphViewProps {
  subgraph: Subgraph | undefined;
}

export function GraphView({ subgraph }: GraphViewProps) {
  const { nodes, edges } = useMemo(() => {
    if (!subgraph || !subgraph.nodes?.length) return { nodes: [] as Node[], edges: [] as Edge[] };
    const n = subgraph.nodes.length;
    const radius = Math.max(140, n * 22);
    const rfNodes: Node[] = subgraph.nodes.map((node, i) => {
      const style = getNodeStyle(node.label);
      const angle = (2 * Math.PI * i) / n;
      return {
        id: node.id,
        position: { x: radius + radius * Math.cos(angle), y: radius + radius * Math.sin(angle) },
        data: { label: (node.properties?.name as string) ?? node.label },
        draggable: true,
        style: {
          background: style.color, color: '#0b1418', border: 'none',
          borderRadius: style.shape === 'ellipse' ? '50%' : 8,
          fontSize: 12, padding: 6, width: Math.max(60, style.size), textAlign: 'center' as const,
        },
      };
    });
    const rfEdges: Edge[] = subgraph.edges.map((edge) => {
      const style = getEdgeStyle(edge.label);
      return {
        id: `${edge.source}-${edge.label}-${edge.target}`,
        source: edge.source, target: edge.target, label: edge.label,
        style: { stroke: style.color, strokeDasharray: style.lineStyle === 'dashed' ? '5 5' : undefined },
        labelStyle: { fill: 'var(--mist)', fontSize: 12 },
        labelBgStyle: { fill: 'var(--ink-900)' },
      };
    });
    return { nodes: rfNodes, edges: rfEdges };
  }, [subgraph]);

  if (!nodes.length) {
    return (
      <div className="flex h-full items-center justify-center text-sm" style={{ color: 'var(--mist)' }}>
        그래프 근거가 없습니다.
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 360 }}>
      <ReactFlow nodes={nodes} edges={edges} colorMode="dark" fitView
        nodesConnectable={false} proOptions={{ hideAttribution: true }}>
        <Background color="var(--ink-600)" gap={18} />
      </ReactFlow>
    </div>
  );
}
