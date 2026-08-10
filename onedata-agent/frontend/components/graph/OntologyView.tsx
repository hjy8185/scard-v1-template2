'use client';

import React, { useMemo } from 'react';
import type { ReasoningStep } from '@/lib/types';

interface OntologyViewProps {
  context?: ReasoningStep[];
}

// Simple node layout for ontology visualization
interface VisNode {
  id: string;
  label: string;
  type: 'table' | 'column' | 'entity';
  x: number;
  y: number;
  color: string;
}

interface VisEdge {
  from: string;
  to: string;
  label: string;
}

export function OntologyView({ context }: OntologyViewProps) {
  // Extract tables and columns from context step data
  const graphData = useMemo(() => {
    const nodes: VisNode[] = [];
    const edges: VisEdge[] = [];

    if (!context) {
      // Default sample ontology
      return getDefaultOntology();
    }

    const contextStep = context.find((s) => s.id === 'context');
    if (!contextStep?.data) {
      return getDefaultOntology();
    }

    const tables = (contextStep.data.tables as string[]) || [];
    const columns = (contextStep.data.columns as string[]) || [];

    // Layout tables in a circle
    const centerX = 400;
    const centerY = 300;
    const radius = 180;

    tables.forEach((table, i) => {
      const angle = (2 * Math.PI * i) / Math.max(tables.length, 1);
      nodes.push({
        id: table,
        label: table,
        type: 'table',
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        color: '#38c7e0',
      });
    });

    // Add columns around their tables
    if (columns.length > 0 && tables.length > 0) {
      const colsPerTable = Math.ceil(columns.length / tables.length);
      columns.forEach((col, i) => {
        const tableIdx = Math.min(Math.floor(i / colsPerTable), tables.length - 1);
        const parentNode = nodes[tableIdx];
        const localIdx = i % colsPerTable;
        const offsetAngle = (2 * Math.PI * localIdx) / colsPerTable;
        const colRadius = 80;

        nodes.push({
          id: `${tables[tableIdx]}.${col}`,
          label: col,
          type: 'column',
          x: parentNode.x + colRadius * Math.cos(offsetAngle),
          y: parentNode.y + colRadius * Math.sin(offsetAngle),
          color: '#3dd68c',
        });

        edges.push({
          from: tables[tableIdx],
          to: `${tables[tableIdx]}.${col}`,
          label: 'has',
        });
      });
    }

    // Add edges between tables
    for (let i = 0; i < tables.length - 1; i++) {
      edges.push({
        from: tables[i],
        to: tables[i + 1],
        label: 'joins',
      });
    }

    return { nodes, edges };
  }, [context]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-pearl">온톨로지 그래프</h3>
        <span className="text-xs text-mist bg-ink-700 px-2.5 py-1 rounded-full border border-ink-600">
          {graphData.nodes.length} 노드 / {graphData.edges.length} 엣지
        </span>
      </div>

      {/* SVG Graph Visualization */}
      <div className="rounded-xl bg-ink-900 border border-ink-600 overflow-hidden">
        <svg
          viewBox="0 0 800 600"
          className="w-full h-[480px]"
          style={{ background: 'radial-gradient(circle at 50% 50%, #0d1f2d, #06121a)' }}
        >
          {/* Grid pattern */}
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e3a4f" strokeWidth="0.5" opacity="0.3" />
            </pattern>
          </defs>
          <rect width="800" height="600" fill="url(#grid)" />

          {/* Edges */}
          {graphData.edges.map((edge, i) => {
            const from = graphData.nodes.find((n) => n.id === edge.from);
            const to = graphData.nodes.find((n) => n.id === edge.to);
            if (!from || !to) return null;
            return (
              <g key={i}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="#1e3a4f"
                  strokeWidth="1.5"
                  strokeDasharray={edge.label === 'joins' ? '4,4' : 'none'}
                />
                <text
                  x={(from.x + to.x) / 2}
                  y={(from.y + to.y) / 2 - 6}
                  textAnchor="middle"
                  fill="#5a7a8a"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  {edge.label}
                </text>
              </g>
            );
          })}

          {/* Nodes */}
          {graphData.nodes.map((node) => (
            <g key={node.id}>
              {/* Glow effect */}
              <circle
                cx={node.x}
                cy={node.y}
                r={node.type === 'table' ? 30 : 18}
                fill={node.color}
                opacity="0.1"
              />
              {/* Node circle */}
              <circle
                cx={node.x}
                cy={node.y}
                r={node.type === 'table' ? 24 : 14}
                fill="#0d1f2d"
                stroke={node.color}
                strokeWidth={node.type === 'table' ? 2 : 1.5}
              />
              {/* Icon */}
              {node.type === 'table' ? (
                <text
                  x={node.x}
                  y={node.y + 4}
                  textAnchor="middle"
                  fill={node.color}
                  fontSize="12"
                >
                  T
                </text>
              ) : (
                <text
                  x={node.x}
                  y={node.y + 3}
                  textAnchor="middle"
                  fill={node.color}
                  fontSize="8"
                >
                  C
                </text>
              )}
              {/* Label */}
              <text
                x={node.x}
                y={node.y + (node.type === 'table' ? 40 : 28)}
                textAnchor="middle"
                fill="#f0f6f4"
                fontSize={node.type === 'table' ? 11 : 9}
                fontFamily="monospace"
              >
                {node.label.length > 15 ? node.label.slice(0, 15) + '...' : node.label}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full border-2 border-aqua bg-ink-800" />
          <span className="text-xs text-mist">테이블</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full border-2 border-jade bg-ink-800" />
          <span className="text-xs text-mist">컬럼</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 border-t border-dashed border-ink-600 w-6" />
          <span className="text-xs text-mist">조인 관계</span>
        </div>
      </div>
    </div>
  );
}

// Default ontology when no context is available
function getDefaultOntology(): { nodes: VisNode[]; edges: VisEdge[] } {
  const nodes: VisNode[] = [
    { id: 'card_master', label: 'CARD_MASTER', type: 'table', x: 400, y: 150, color: '#38c7e0' },
    { id: 'transaction', label: 'TRANSACTION', type: 'table', x: 250, y: 300, color: '#38c7e0' },
    { id: 'customer', label: 'CUSTOMER', type: 'table', x: 550, y: 300, color: '#38c7e0' },
    { id: 'merchant', label: 'MERCHANT', type: 'table', x: 150, y: 450, color: '#38c7e0' },
    { id: 'benefit', label: 'BENEFIT', type: 'table', x: 400, y: 450, color: '#38c7e0' },
    { id: 'payment', label: 'PAYMENT', type: 'table', x: 600, y: 450, color: '#38c7e0' },
  ];

  const edges: VisEdge[] = [
    { from: 'card_master', to: 'transaction', label: '1:N' },
    { from: 'card_master', to: 'customer', label: 'N:1' },
    { from: 'transaction', to: 'merchant', label: 'N:1' },
    { from: 'card_master', to: 'benefit', label: '1:N' },
    { from: 'customer', to: 'payment', label: '1:N' },
  ];

  return { nodes, edges };
}
