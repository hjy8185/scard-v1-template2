'use client';

import React, { useMemo } from 'react';

interface DataLineageProps {
  sql?: string;
}

interface LineageNode {
  id: string;
  name: string;
  type: 'source' | 'transform' | 'target';
  x: number;
  y: number;
}

interface LineageLink {
  from: string;
  to: string;
  label?: string;
}

export function DataLineage({ sql }: DataLineageProps) {
  const { nodes, links } = useMemo(() => buildLineage(sql), [sql]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-pearl">데이터 계보</h3>
        <span className="text-xs text-mist bg-ink-700 px-2.5 py-1 rounded-full border border-ink-600">
          Data Lineage
        </span>
      </div>

      {/* Lineage Diagram */}
      <div className="rounded-xl bg-ink-900 border border-ink-600 overflow-hidden">
        <svg
          viewBox="0 0 800 400"
          className="w-full h-[360px]"
          style={{ background: 'radial-gradient(circle at 50% 50%, #0d1f2d, #06121a)' }}
        >
          {/* Background grid */}
          <defs>
            <pattern id="lineage-grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#1e3a4f" strokeWidth="0.3" opacity="0.3" />
            </pattern>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#38c7e0" opacity="0.6" />
            </marker>
          </defs>
          <rect width="800" height="400" fill="url(#lineage-grid)" />

          {/* Stage labels */}
          <text x="130" y="30" textAnchor="middle" fill="#5a7a8a" fontSize="11" fontWeight="600">
            SOURCE
          </text>
          <text x="400" y="30" textAnchor="middle" fill="#5a7a8a" fontSize="11" fontWeight="600">
            TRANSFORM
          </text>
          <text x="670" y="30" textAnchor="middle" fill="#5a7a8a" fontSize="11" fontWeight="600">
            TARGET
          </text>

          {/* Stage dividers */}
          <line x1="260" y1="40" x2="260" y2="380" stroke="#1e3a4f" strokeWidth="1" strokeDasharray="4,4" />
          <line x1="540" y1="40" x2="540" y2="380" stroke="#1e3a4f" strokeWidth="1" strokeDasharray="4,4" />

          {/* Links */}
          {links.map((link, i) => {
            const from = nodes.find((n) => n.id === link.from);
            const to = nodes.find((n) => n.id === link.to);
            if (!from || !to) return null;
            return (
              <g key={i}>
                <line
                  x1={from.x + 60}
                  y1={from.y}
                  x2={to.x - 60}
                  y2={to.y}
                  stroke="#38c7e0"
                  strokeWidth="1.5"
                  opacity="0.4"
                  markerEnd="url(#arrowhead)"
                />
                {link.label && (
                  <text
                    x={(from.x + to.x) / 2}
                    y={(from.y + to.y) / 2 - 8}
                    textAnchor="middle"
                    fill="#5a7a8a"
                    fontSize="9"
                  >
                    {link.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const color = node.type === 'source' ? '#38c7e0' : node.type === 'transform' ? '#f5a623' : '#3dd68c';
            return (
              <g key={node.id}>
                {/* Node box */}
                <rect
                  x={node.x - 55}
                  y={node.y - 20}
                  width="110"
                  height="40"
                  rx="8"
                  fill="#0d1f2d"
                  stroke={color}
                  strokeWidth="1.5"
                />
                {/* Node label */}
                <text
                  x={node.x}
                  y={node.y + 4}
                  textAnchor="middle"
                  fill="#f0f6f4"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  {node.name.length > 14 ? node.name.slice(0, 14) + '..' : node.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="h-3 w-6 rounded border border-aqua bg-ink-800" />
          <span className="text-xs text-mist">원천 테이블</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-6 rounded border border-amber bg-ink-800" />
          <span className="text-xs text-mist">변환</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-6 rounded border border-jade bg-ink-800" />
          <span className="text-xs text-mist">결과</span>
        </div>
      </div>

      {/* Info */}
      <div className="mt-4 p-4 rounded-xl bg-ink-800/50 border border-ink-600">
        <h4 className="text-xs font-semibold text-mist mb-2">계보 정보</h4>
        <ul className="space-y-1.5 text-xs text-slate">
          <li className="flex items-start gap-2">
            <span className="text-aqua shrink-0">&#8226;</span>
            <span>원천 데이터에서 결과까지의 변환 과정을 추적합니다.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-aqua shrink-0">&#8226;</span>
            <span>Neptune 온톨로지 기반으로 테이블 간 관계를 시각화합니다.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-aqua shrink-0">&#8226;</span>
            <span>SQL 생성 시 참조된 테이블의 데이터 흐름을 보여줍니다.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

function buildLineage(sql?: string): { nodes: LineageNode[]; links: LineageLink[] } {
  if (!sql) {
    // Default lineage
    return {
      nodes: [
        { id: 'card_txn', name: 'CARD_TXN', type: 'source', x: 130, y: 120 },
        { id: 'customer', name: 'CUSTOMER', type: 'source', x: 130, y: 200 },
        { id: 'merchant', name: 'MERCHANT', type: 'source', x: 130, y: 280 },
        { id: 'join_1', name: 'JOIN', type: 'transform', x: 400, y: 160 },
        { id: 'aggregate', name: 'AGGREGATE', type: 'transform', x: 400, y: 280 },
        { id: 'result', name: 'RESULT', type: 'target', x: 670, y: 200 },
      ],
      links: [
        { from: 'card_txn', to: 'join_1', label: 'card_no' },
        { from: 'customer', to: 'join_1', label: 'cust_id' },
        { from: 'join_1', to: 'aggregate', label: 'filter' },
        { from: 'merchant', to: 'aggregate', label: 'mcht_id' },
        { from: 'aggregate', to: 'result', label: 'output' },
      ],
    };
  }

  // Parse SQL to extract tables
  const tables: string[] = [];
  const fromMatches = sql.matchAll(/(?:FROM|JOIN)\s+(\w+)/gi);
  for (const match of fromMatches) {
    if (match[1] && !tables.includes(match[1].toUpperCase())) {
      tables.push(match[1].toUpperCase());
    }
  }

  const nodes: LineageNode[] = [];
  const links: LineageLink[] = [];

  // Source nodes (tables)
  tables.forEach((table, i) => {
    const y = 80 + i * 80;
    nodes.push({
      id: table.toLowerCase(),
      name: table,
      type: 'source',
      x: 130,
      y: Math.min(y, 340),
    });
  });

  // Transform nodes
  const hasJoin = tables.length > 1;
  const hasGroupBy = sql.toUpperCase().includes('GROUP BY');
  const hasWhere = sql.toUpperCase().includes('WHERE');

  let transformY = 120;
  if (hasJoin) {
    nodes.push({ id: 'join', name: 'JOIN', type: 'transform', x: 400, y: transformY });
    tables.forEach((t) => links.push({ from: t.toLowerCase(), to: 'join' }));
    transformY += 80;
  }
  if (hasWhere) {
    nodes.push({ id: 'filter', name: 'FILTER', type: 'transform', x: 400, y: transformY });
    if (hasJoin) {
      links.push({ from: 'join', to: 'filter' });
    } else {
      tables.forEach((t) => links.push({ from: t.toLowerCase(), to: 'filter' }));
    }
    transformY += 80;
  }
  if (hasGroupBy) {
    nodes.push({ id: 'agg', name: 'AGGREGATE', type: 'transform', x: 400, y: transformY });
    const lastTransform = hasWhere ? 'filter' : hasJoin ? 'join' : null;
    if (lastTransform) {
      links.push({ from: lastTransform, to: 'agg' });
    } else {
      tables.forEach((t) => links.push({ from: t.toLowerCase(), to: 'agg' }));
    }
    transformY += 80;
  }

  // Target node
  const resultY = Math.max(200, transformY - 40);
  nodes.push({ id: 'result', name: 'RESULT', type: 'target', x: 670, y: resultY });

  const lastNode = hasGroupBy ? 'agg' : hasWhere ? 'filter' : hasJoin ? 'join' : tables[0]?.toLowerCase();
  if (lastNode) {
    links.push({ from: lastNode, to: 'result' });
  }

  return { nodes, links };
}
