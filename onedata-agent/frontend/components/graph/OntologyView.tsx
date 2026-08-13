'use client';

import React, { useMemo } from 'react';
import type { ReasoningStep, ChatMessage } from '@/lib/types';

interface OntologyViewProps {
  context?: ReasoningStep[];
  tablesUsed?: string[];
  allMessages?: ChatMessage[];
}

interface ConceptDef {
  label: string;
  color: string;
  keywords: string[];
  children?: string[];
}

const CONCEPTS: ConceptDef[] = [
  // 계열사 (large nodes)
  { label: '신한은행', color: '#3b82f6', keywords: ['은행', '수신', '예금', '여신', '대출', '평잔', '이체', '신한은행'] },
  { label: '신한카드', color: '#f59e0b', keywords: ['카드', '카드회원', '카드사', '신한카드'] },
  { label: '신한투자증권', color: '#8b5cf6', keywords: ['증권', '투자', '주식', '종목', '신한투자증권'] },
  { label: '신한라이프', color: '#10b981', keywords: ['보험', '생명', '라이프', '계약', '신한라이프'] },
  { label: '슈퍼솔(앱)', color: '#06b6d4', keywords: ['슈퍼솔', '앱', 'MAU', '방문', '미가입'] },
  // 카드 이용금액 구조: 이용금액 > (신용신판, 체크) / 신용신판 > (신용할부, 신용일시불) / 업종은 이용금액 내 세부 분류 차원
  {
    label: '이용금액',
    color: '#f59e0b',
    keywords: ['이용금액', '사용액', '결제금액'],
    children: ['신용신판', '체크'],
  },
  {
    label: '신용신판',
    color: '#f59e0b',
    keywords: ['신용신판', '신판', '할부', '일시불', '신용카드'],
    children: ['신용할부', '신용일시불'],
  },
  {
    label: '업종',
    color: '#d946ef',
    keywords: ['업종', '업종별', '가맹점', '가맹점별'],
    children: ['음식/배달', '종합쇼핑', '식품/마트', '교통/주유', '의료/교육', '여행/숙박', '온라인쇼핑'],
  },
  { label: '지역', color: '#6366f1', keywords: ['지역', '거주', '지역별'] },
  { label: '연령대', color: '#0064FF', keywords: ['연령', '나이', '대별'] },
  { label: '성별', color: '#0064FF', keywords: ['성별'] },
  // 지표 — 그룹사별 실적 지표 (색상 = 해당 그룹사와 동일 → 자동 edge 연결)
  { label: '수신평잔', color: '#3b82f6', keywords: ['수신평잔', '수신 평잔', '예금잔액'] },
  { label: '대출잔액', color: '#3b82f6', keywords: ['대출잔액', '대출 잔액', '여신잔액'] },
  { label: '이용건수', color: '#f59e0b', keywords: ['이용건수', '결제건수', '건수'] },
  { label: '월평균거래액', color: '#8b5cf6', keywords: ['거래액', '거래금액', '월평균거래'] },
  { label: '예수금', color: '#8b5cf6', keywords: ['예수금', '예수금현황'] },
  { label: '수입보험료', color: '#10b981', keywords: ['수입보험료', '보험료', '납입'] },
  // 공통 지표
  { label: '회원수', color: '#0064FF', keywords: ['회원', '인원', '고객수'] },
  { label: 'MAU', color: '#06b6d4', keywords: ['MAU', 'mau', '월방문'] },
  { label: '미가입', color: '#ef4444', keywords: ['미가입', '비가입'] },
  { label: '가입여부', color: '#06b6d4', keywords: ['가입'] },
  { label: '교차고객', color: '#0064FF', keywords: ['교차', '공통'] },
  { label: '비율', color: '#ec4899', keywords: ['비율', '비중'] },
];

interface VisNode {
  id: string;
  label: string;
  color: string;
  x: number;
  y: number;
  size: 'large' | 'small' | 'child';
}

interface VisEdge {
  from: string;
  to: string;
  color: string;
  isHierarchy?: boolean;
}

export function OntologyView({ context, tablesUsed, allMessages }: OntologyViewProps) {
  const graphData = useMemo(() => {
    const allUserQueries: string[] = [];
    if (allMessages) {
      for (const msg of allMessages) {
        if (msg.role === 'user') allUserQueries.push(msg.content);
      }
    }
    if (allUserQueries.length === 0) return null;

    const combinedText = allUserQueries.join(' ');

    const groupMentioned = ['각사', '그룹사', '계열사'].some(kw => combinedText.includes(kw));
    const performanceMentioned = ['실적', '성과', '현황', '요약'].some(kw => combinedText.includes(kw));

    // 1. Find all activated concepts
    const activeLabels = new Set<string>();
    const conceptMap = new Map<string, ConceptDef>();

    for (const c of CONCEPTS) {
      const activated = c.keywords.some(kw => combinedText.includes(kw));
      if (activated && !activeLabels.has(c.label)) {
        activeLabels.add(c.label);
        conceptMap.set(c.label, c);
      }
    }

    // "각사/그룹사/계열사" → activate all subsidiaries
    if (groupMentioned) {
      const subsidiaries = ['신한은행', '신한카드', '신한투자증권', '신한라이프', '슈퍼솔(앱)'];
      for (const s of subsidiaries) {
        if (!activeLabels.has(s)) {
          const def = CONCEPTS.find(c => c.label === s);
          if (def) { activeLabels.add(s); conceptMap.set(s, def); }
        }
      }
    }

    // "실적/현황/요약" → activate all subsidiaries + 각사 대표 지표
    if (performanceMentioned) {
      const kpiMap: Record<string, string[]> = {
        '신한은행': ['수신평잔', '대출잔액'],
        '신한카드': ['이용금액', '이용건수'],
        '신한투자증권': ['월평균거래액', '예수금'],
        '신한라이프': ['수입보험료'],
        '슈퍼솔(앱)': ['MAU'],
      };
      // Activate all subsidiaries
      for (const sub of Object.keys(kpiMap)) {
        if (!activeLabels.has(sub)) {
          const def = CONCEPTS.find(c => c.label === sub);
          if (def) { activeLabels.add(sub); conceptMap.set(sub, def); }
        }
      }
      // Activate each subsidiary's KPI indicators
      for (const kpis of Object.values(kpiMap)) {
        for (const kpi of kpis) {
          if (!activeLabels.has(kpi)) {
            const def = CONCEPTS.find(c => c.label === kpi);
            if (def) { activeLabels.add(kpi); conceptMap.set(kpi, def); }
          }
        }
      }
    }

    if (activeLabels.size === 0) return null;

    // Track which concepts have children to display
    // A concept is a "top-level hierarchy parent" only if no other active parent lists it as a child
    const hierarchyParents = new Set<string>();
    const nestedUnder = new Set<string>();
    for (const label of activeLabels) {
      const def = conceptMap.get(label)!;
      if (def.children && def.children.length > 0) {
        hierarchyParents.add(label);
      }
    }
    // Find concepts that are children of another active hierarchy parent
    for (const label of hierarchyParents) {
      const def = conceptMap.get(label)!;
      for (const child of def.children || []) {
        if (hierarchyParents.has(child)) nestedUnder.add(child);
      }
    }
    // Top-level hierarchy parents = those not nested under another
    const topHierarchyParents = new Set([...hierarchyParents].filter(l => !nestedUnder.has(l)));

    // 2. Build edges
    const edgeSet = new Set<string>();
    const edges: VisEdge[] = [];

    const addEdge = (a: string, b: string, isHierarchy = false) => {
      if (a === b) return;
      const key = [a, b].sort().join('↔');
      if (edgeSet.has(key)) return;
      edgeSet.add(key);
      const cA = conceptMap.get(a);
      const cB = conceptMap.get(b);
      const colorA = cA?.color || '#d946ef';
      const colorB = cB?.color || '#d946ef';
      edges.push({
        from: a, to: b,
        color: colorA === colorB ? colorA : '#9ca3af',
        isHierarchy,
      });
    };

    // Rule 1: co-occurring concepts in same query
    for (const query of allUserQueries) {
      const queryActivated: string[] = [];
      for (const c of CONCEPTS) {
        if (c.keywords.some(kw => query.includes(kw)) && activeLabels.has(c.label)) {
          if (!queryActivated.includes(c.label)) queryActivated.push(c.label);
        }
      }
      if (['각사', '그룹사', '계열사'].some(kw => query.includes(kw))) {
        for (const s of ['신한은행', '신한카드', '신한투자증권', '신한라이프', '슈퍼솔(앱)']) {
          if (activeLabels.has(s) && !queryActivated.includes(s)) queryActivated.push(s);
        }
      }
      for (let i = 0; i < queryActivated.length; i++) {
        for (let j = i + 1; j < queryActivated.length; j++) {
          addEdge(queryActivated[i], queryActivated[j]);
        }
      }
    }

    // Rule 2: common dimensions connect to ALL active subsidiaries
    const COMMON_DIMENSIONS = new Set(['성별', '연령대', '지역']);
    const activeSubs = ['신한은행', '신한카드', '신한투자증권', '신한라이프', '슈퍼솔(앱)']
      .filter(s => activeLabels.has(s));

    for (const dim of COMMON_DIMENSIONS) {
      if (!activeLabels.has(dim)) continue;
      for (const sub of activeSubs) {
        addEdge(dim, sub);
      }
    }

    // Rule 3: remaining orphan nodes connect to related nodes
    const connectedNodes = new Set<string>();
    for (const e of edges) { connectedNodes.add(e.from); connectedNodes.add(e.to); }
    for (const label of activeLabels) {
      if (connectedNodes.has(label)) continue;
      const self = conceptMap.get(label)!;
      // Try same-color node
      let bestMatch: string | null = null;
      for (const other of activeLabels) {
        if (other === label) continue;
        const otherDef = conceptMap.get(other)!;
        if (otherDef.color === self.color) { bestMatch = other; break; }
      }
      // Fallback: any active subsidiary
      if (!bestMatch) {
        bestMatch = activeSubs.find(s => s !== label) || null;
      }
      // Last resort: any other node
      if (!bestMatch) {
        for (const other of activeLabels) { if (other !== label) { bestMatch = other; break; } }
      }
      if (bestMatch) {
        addEdge(label, bestMatch);
        connectedNodes.add(label); connectedNodes.add(bestMatch);
      }
    }

    // 3. Layout
    const subsidiaries = new Set(['신한은행', '신한카드', '신한투자증권', '신한라이프', '슈퍼솔(앱)']);
    const WIDTH = 520;
    const nodeList = Array.from(activeLabels);
    const largeNodeLabels = nodeList.filter(n => subsidiaries.has(n));
    const smallNodeLabels = nodeList.filter(n => !subsidiaries.has(n) && !hierarchyParents.has(n));
    const topHierarchyList = nodeList.filter(n => topHierarchyParents.has(n));

    const nodes: VisNode[] = [];

    // Row 1: Large (subsidiary) nodes
    const largeY = 55;
    const largeGap = Math.max(110, WIDTH / (largeNodeLabels.length + 1));
    const largeStartX = (WIDTH - (largeNodeLabels.length - 1) * largeGap) / 2;
    largeNodeLabels.forEach((label, i) => {
      nodes.push({
        id: label, label,
        color: conceptMap.get(label)!.color,
        x: largeStartX + i * largeGap, y: largeY,
        size: 'large',
      });
    });

    // Row 2+: Small attribute nodes (non-hierarchy)
    const smallStartY = largeNodeLabels.length > 0 ? 155 : 55;
    const SMALL_ROW_GAP = 55;
    const SMALL_COL_GAP = 140;
    const COLS_PER_ROW = 3;

    smallNodeLabels.forEach((label, i) => {
      const row = Math.floor(i / COLS_PER_ROW);
      const col = i % COLS_PER_ROW;
      const rowCount = Math.min(COLS_PER_ROW, smallNodeLabels.length - row * COLS_PER_ROW);
      const rowWidth = (rowCount - 1) * SMALL_COL_GAP;
      const startX = (WIDTH - rowWidth) / 2;
      nodes.push({
        id: label, label,
        color: conceptMap.get(label)!.color,
        x: startX + col * SMALL_COL_GAP,
        y: smallStartY + row * SMALL_ROW_GAP,
        size: 'small',
      });
    });

    // Hierarchy section: render tree for each top-level hierarchy parent
    const lastSmallRow = smallNodeLabels.length > 0
      ? Math.floor((smallNodeLabels.length - 1) / COLS_PER_ROW)
      : -1;
    let hierarchyStartY = smallStartY + (lastSmallRow + 1) * SMALL_ROW_GAP + 30;
    if (smallNodeLabels.length === 0 && largeNodeLabels.length > 0) hierarchyStartY = 155;
    if (smallNodeLabels.length === 0 && largeNodeLabels.length === 0) hierarchyStartY = 55;

    const CHILD_COLS = 4;
    const CHILD_COL_GAP = 120;
    const CHILD_ROW_GAP = 35;

    const renderHierarchy = (parentLabel: string, parentId: string, startY: number): number => {
      const def = conceptMap.get(parentLabel);
      if (!def || !def.children) return startY;
      const children = def.children;
      const parentX = WIDTH / 2;
      const parentY = startY;

      nodes.push({
        id: parentId, label: parentLabel,
        color: def.color,
        x: parentX, y: parentY,
        size: 'small',
      });

      let lastChildY = parentY;
      children.forEach((childLabel, ci) => {
        const row = Math.floor(ci / CHILD_COLS);
        const col = ci % CHILD_COLS;
        const rowCount = Math.min(CHILD_COLS, children.length - row * CHILD_COLS);
        const rowWidth = (rowCount - 1) * CHILD_COL_GAP;
        const startX = (WIDTH - rowWidth) / 2;
        const cx = startX + col * CHILD_COL_GAP;
        const cy = parentY + 42 + row * CHILD_ROW_GAP;
        lastChildY = Math.max(lastChildY, cy);

        const childId = `${parentId}::${childLabel}`;
        nodes.push({
          id: childId, label: childLabel,
          color: def.color,
          x: cx, y: cy,
          size: 'child',
        });
        edges.push({ from: parentId, to: childId, color: def.color, isHierarchy: true });

        // If this child is itself a hierarchy parent, render its sub-tree
        const childConcept = CONCEPTS.find(c => c.label === childLabel);
        if (childConcept && childConcept.children && childConcept.children.length > 0) {
          const subChildren = childConcept.children;
          subChildren.forEach((subLabel, si) => {
            const subId = `${childId}::${subLabel}`;
            const subRow = Math.floor(si / CHILD_COLS);
            const subCol = si % CHILD_COLS;
            const subRowCount = Math.min(CHILD_COLS, subChildren.length - subRow * CHILD_COLS);
            const subRowWidth = (subRowCount - 1) * 100;
            const subStartX = cx - subRowWidth / 2 + subCol * 100;
            const subY = cy + 32 + subRow * 28;
            lastChildY = Math.max(lastChildY, subY);

            nodes.push({
              id: subId, label: subLabel,
              color: childConcept.color || def.color,
              x: subStartX, y: subY,
              size: 'child',
            });
            edges.push({ from: childId, to: subId, color: def.color, isHierarchy: true });
          });
        }
      });

      return lastChildY;
    };

    for (const parentLabel of topHierarchyList) {
      const lastY = renderHierarchy(parentLabel, parentLabel, hierarchyStartY);
      hierarchyStartY = lastY + 55;
    }

    const maxY = nodes.reduce((max, n) => Math.max(max, n.y), 0);
    const height = Math.max(250, maxY + 50);
    return { nodes, edges, width: WIDTH, height };
  }, [tablesUsed, context, allMessages]);

  if (!graphData) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <p className="text-[13px] text-gray-500">쿼리를 실행하면 데이터 관계를 보여줍니다.</p>
      </div>
    );
  }

  const { nodes, edges, width, height } = graphData;
  const posMap = new Map<string, { x: number; y: number }>();
  for (const n of nodes) posMap.set(n.id, { x: n.x, y: n.y });

  return (
    <div className="p-2 h-full overflow-y-auto">
      <div className="rounded-[12px] bg-white border border-gray-200 shadow-card p-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          className="block mx-auto"
        >
          {/* Edges */}
          {edges.map((e, i) => {
            const from = posMap.get(e.from);
            const to = posMap.get(e.to);
            if (!from || !to) return null;

            const fromNode = nodes.find(n => n.id === e.from);
            const toNode = nodes.find(n => n.id === e.to);

            if (e.isHierarchy) {
              // Simple vertical line for hierarchy
              const fromHH = fromNode?.size === 'child' ? 10 : 13;
              const toHH = toNode?.size === 'child' ? 10 : 13;
              const y1 = from.y + fromHH;
              const y2 = to.y - toHH;
              return (
                <line
                  key={`e-${i}`}
                  x1={from.x} y1={y1}
                  x2={to.x} y2={y2}
                  stroke={e.color}
                  strokeWidth="1"
                  opacity="0.35"
                />
              );
            }

            const fromHH = fromNode?.size === 'large' ? 16 : 13;
            const toHH = toNode?.size === 'large' ? 16 : 13;
            const sameRow = Math.abs(from.y - to.y) < 20;

            let pathD: string;

            if (sameRow) {
              const fromHW = fromNode ? (fromNode.label.length * (fromNode.size === 'large' ? 11 : 9.5) + (fromNode.size === 'large' ? 26 : 20)) / 2 : 30;
              const toHW = toNode ? (toNode.label.length * (toNode.size === 'large' ? 11 : 9.5) + (toNode.size === 'large' ? 26 : 20)) / 2 : 30;

              const x1 = from.x < to.x ? from.x + fromHW : from.x - fromHW;
              const x2 = from.x < to.x ? to.x - toHW : to.x + toHW;
              const midX = (x1 + x2) / 2;
              const arcY = from.y + 35 + Math.abs(x2 - x1) * 0.15;
              pathD = `M${x1},${from.y} Q${midX},${arcY} ${x2},${to.y}`;
            } else {
              const goingDown = from.y < to.y;
              const x1 = from.x;
              const y1 = goingDown ? from.y + fromHH : from.y - fromHH;
              const x2 = to.x;
              const y2 = goingDown ? to.y - toHH : to.y + toHH;
              const midX = (x1 + x2) / 2;
              const midY = (y1 + y2) / 2;
              pathD = `M${x1},${y1} Q${midX},${midY} ${x2},${y2}`;
            }

            return (
              <path
                key={`e-${i}`}
                d={pathD}
                fill="none"
                stroke={e.color}
                strokeWidth="1.2"
                opacity="0.4"
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((n) => {
            const isLarge = n.size === 'large';
            const isChild = n.size === 'child';
            const fontSize = isLarge ? 12 : isChild ? 9 : 10.5;
            const charW = isLarge ? 11 : isChild ? 8 : 9.5;
            const padding = isLarge ? 26 : isChild ? 14 : 20;
            const labelW = n.label.length * charW + padding;
            const pillH = isLarge ? 32 : isChild ? 20 : 26;

            return (
              <g key={n.id}>
                <rect
                  x={n.x - labelW / 2}
                  y={n.y - pillH / 2}
                  width={labelW}
                  height={pillH}
                  rx={pillH / 2}
                  fill={isLarge ? n.color : isChild ? n.color : '#ffffff'}
                  fillOpacity={isLarge ? 0.1 : isChild ? 0.08 : 1}
                  stroke={n.color}
                  strokeWidth={isLarge ? 2 : isChild ? 1 : 1.5}
                  strokeDasharray={isChild ? '3,2' : undefined}
                />
                <text
                  x={n.x}
                  y={n.y + (isLarge ? 5 : isChild ? 3 : 4)}
                  textAnchor="middle"
                  fill={n.color}
                  fontSize={fontSize}
                  fontWeight={isLarge ? 700 : isChild ? 400 : 500}
                  fontFamily="system-ui"
                >
                  {n.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
