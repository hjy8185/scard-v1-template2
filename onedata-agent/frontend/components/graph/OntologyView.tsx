'use client';

import React, { useMemo, useRef, useEffect, useState } from 'react';
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
  group?: string;
}

const CONCEPTS: ConceptDef[] = [
  // === 슈퍼솔 (직접 언급시에만) ===
  { label: '슈퍼솔(앱)', color: '#06b6d4', keywords: ['슈퍼솔', '팬클럽'] },

  // === 계열사 ===
  { label: '신한은행', color: '#3b82f6', keywords: ['은행', '신한은행'] },
  { label: '신한카드', color: '#f59e0b', keywords: ['카드', '신한카드', '카드회원', '카드사'] },
  { label: '신한투자증권', color: '#8b5cf6', keywords: ['증권', '신한투자증권', '투자'] },
  { label: '신한라이프', color: '#10b981', keywords: ['보험', '신한라이프', '라이프', '신한생명', '생명'] },

  // === 은행 지표 (igd_m_cust_txn_bank) ===
  { label: '수신', color: '#3b82f6', keywords: ['수신', '예금', '적금', '평잔', '유동성잔액', 'igd_m_cust_txn_bank', '수신평균잔액'],
    children: ['유동성잔액', '예금잔액', '적금잔액', '펀드잔액'], group: '신한은행' },
  { label: '여신', color: '#3b82f6', keywords: ['여신', '대출', '대출잔액', '신용대출잔액', '주택담보대출잔액'],
    children: ['신용대출', '주택담보대출', '전세자금대출'], group: '신한은행' },

  // === 카드 지표 (igd_m_cust_txn / igd_m_cust_txn_card) ===
  { label: '이용금액', color: '#f59e0b', keywords: ['이용금액', '사용액', '결제금액', '신용신판이용금액', '체크카드이용금액', 'igd_m_cust_txn_card'],
    children: ['신용신판', '체크카드'], group: '신한카드' },
  { label: '이용건수', color: '#f59e0b', keywords: ['이용건수', '결제건수', '건수', '이용건수합계'], group: '신한카드' },
  { label: '업종', color: '#f59e0b', keywords: ['업종', '업종별', '가맹점', '업종대분류', '외식', '교통', '편의점', '백화점', '주유', '온라인쇼핑'],
    children: ['외식', '교통', '편의점', '백화점', '주유', '병원/약국', '온라인쇼핑'], group: '신한카드' },

  // === 증권 지표 (igd_m_cust_txn_sec) ===
  { label: '증권자산', color: '#8b5cf6', keywords: ['자산', '거래액', '거래금액', '예수금', 'igd_m_cust_txn_sec', '총자산금액'],
    children: ['지분증권', '채무증권', '수익증권', '파생결합증권'], group: '신한투자증권' },
  { label: '증권거래', color: '#8b5cf6', keywords: ['증권거래', '매매', '종목', '거래건수'], group: '신한투자증권' },

  // === 보험 지표 (igd_m_cust_txn_life) ===
  { label: '보험계약', color: '#10b981', keywords: ['계약', '보험료', '납입', '수입보험료', 'igd_m_cust_txn_life', '보험자산금액', '정체', '실효', '해약'],
    children: ['건강보험', '종신보험', '연금보험', '변액보험'], group: '신한라이프' },

  // === 슈퍼솔 KPI (jaz_sh_fanclub) ===
  { label: 'MAU', color: '#06b6d4', keywords: ['MAU', 'mau', '월방문', '방문', 'jaz_sh_fanclub'], group: '슈퍼솔(앱)' },
  { label: '가입', color: '#06b6d4', keywords: ['가입', '미가입', '비가입', '가입채널'], group: '슈퍼솔(앱)' },

  // === 고객정보 (igd_m_cust_base 기반 — 공통 차원의 상위 개념) ===
  { label: '고객정보', color: '#0064FF', keywords: ['연령', '나이', '대별', '연령대', '성별', '지역', '거주', '지역별', '행정동', '고객', '연령5년구간코드', 'igd_m_cust_base', '자택행정'],
    children: ['성별', '연령대', '지역'] },

  // === 교차 분석 ===
  { label: '교차고객', color: '#0064FF', keywords: ['교차', '공통', '그룹사수'] },
  { label: '비율', color: '#ec4899', keywords: ['비율', '비중'] },
];

const SUBSIDIARIES = ['신한은행', '신한카드', '신한투자증권', '신한라이프'];

interface VisNode {
  id: string;
  label: string;
  color: string;
  x: number;
  y: number;
  size: 'large' | 'small' | 'child';
  delay: number;
}

interface VisEdge {
  from: string;
  to: string;
  color: string;
  isHierarchy?: boolean;
  delay: number;
}

export function OntologyView({ context, tablesUsed, allMessages }: OntologyViewProps) {
  const prevMsgCountRef = useRef(0);
  const [animating, setAnimating] = useState(false);

  const userMsgCount = allMessages ? allMessages.filter(m => m.role === 'user').length : 0;

  useEffect(() => {
    if (userMsgCount > 0 && userMsgCount !== prevMsgCountRef.current) {
      prevMsgCountRef.current = userMsgCount;
      setAnimating(true);
      const timer = setTimeout(() => setAnimating(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [userMsgCount]);

  const graphData = useMemo(() => {
    const allUserQueries: string[] = [];
    const allSqlTexts: string[] = [];
    if (allMessages) {
      for (const msg of allMessages) {
        if (msg.role === 'user') allUserQueries.push(msg.content);
        if (msg.role === 'assistant') {
          if (msg.sql) allSqlTexts.push(msg.sql);
          if (msg.tablesUsed) allSqlTexts.push(msg.tablesUsed.join(' '));
        }
      }
    }
    if (allUserQueries.length === 0) return null;

    // Separate SQL text (ground truth) from user text (intent)
    const userText = allUserQueries.join(' ');
    const sqlText = allSqlTexts.join(' ');
    const combinedText = userText + ' ' + sqlText;

    const groupMentioned = ['각사', '그룹사', '계열사'].some(kw => combinedText.includes(kw));

    // 1. Activate concepts — SQL-driven (what was actually queried)
    const activeLabels = new Set<string>();
    const conceptMap = new Map<string, ConceptDef>();

    // First pass: activate based on SQL output (high confidence)
    if (sqlText.length > 0) {
      for (const c of CONCEPTS) {
        if (c.keywords.some(kw => sqlText.includes(kw))) {
          if (!activeLabels.has(c.label)) {
            activeLabels.add(c.label);
            conceptMap.set(c.label, c);
          }
        }
      }
    }

    // Second pass: activate from user text, but only subsidiaries and 슈퍼솔/고객정보
    // (KPIs should only come from SQL evidence, not vague terms like "실적")
    for (const c of CONCEPTS) {
      if (activeLabels.has(c.label)) continue;
      const isSubsidiary = SUBSIDIARIES.includes(c.label);
      const isTopLevel = c.label === '슈퍼솔(앱)' || c.label === '고객정보' || c.label === '교차고객' || c.label === '비율';
      if ((isSubsidiary || isTopLevel) && c.keywords.some(kw => userText.includes(kw))) {
        activeLabels.add(c.label);
        conceptMap.set(c.label, c);
      }
    }

    // "각사/그룹사" → subsidiaries only (NOT 슈퍼솔)
    if (groupMentioned) {
      for (const s of SUBSIDIARIES) {
        if (!activeLabels.has(s)) {
          const def = CONCEPTS.find(c => c.label === s);
          if (def) { activeLabels.add(s); conceptMap.set(s, def); }
        }
      }
    }

    if (activeLabels.size === 0) return null;

    // Hierarchy detection
    const hierarchyParents = new Set<string>();
    for (const label of activeLabels) {
      const def = conceptMap.get(label)!;
      if (def.children && def.children.length > 0) hierarchyParents.add(label);
    }

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
      edges.push({ from: a, to: b, color: cA?.color === cB?.color ? (cA?.color || '#9ca3af') : '#9ca3af', isHierarchy, delay: 0 });
    };

    // 슈퍼솔 → subsidiaries (only when supersol is active)
    if (activeLabels.has('슈퍼솔(앱)')) {
      for (const sub of SUBSIDIARIES) {
        if (activeLabels.has(sub)) addEdge('슈퍼솔(앱)', sub);
      }
    }

    // Co-occurring in same query (but skip subsidiary↔subsidiary unless 교차고객 mentioned)
    const crossMentioned = combinedText.includes('교차');
    for (const query of allUserQueries) {
      const qa: string[] = [];
      for (const c of CONCEPTS) {
        if (c.keywords.some(kw => query.includes(kw)) && activeLabels.has(c.label)) {
          if (!qa.includes(c.label)) qa.push(c.label);
        }
      }
      if (['각사', '그룹사', '계열사'].some(kw => query.includes(kw))) {
        for (const s of SUBSIDIARIES) { if (activeLabels.has(s) && !qa.includes(s)) qa.push(s); }
      }
      for (let i = 0; i < qa.length; i++) {
        for (let j = i + 1; j < qa.length; j++) {
          const bothSubs = SUBSIDIARIES.includes(qa[i]) && SUBSIDIARIES.includes(qa[j]);
          if (bothSubs && !crossMentioned) continue;
          addEdge(qa[i], qa[j]);
        }
      }
    }

    // 고객정보 → each active subsidiary (4개 분기 edge)
    if (activeLabels.has('고객정보')) {
      const activeSubs = SUBSIDIARIES.filter(s => activeLabels.has(s));
      for (const sub of activeSubs) addEdge('고객정보', sub);
    }

    // KPI → parent subsidiary (via group field)
    for (const label of activeLabels) {
      const def = conceptMap.get(label)!;
      if (def.group && activeLabels.has(def.group)) {
        addEdge(label, def.group);
      }
    }

    // Orphan connection
    const connected = new Set<string>();
    for (const e of edges) { connected.add(e.from); connected.add(e.to); }
    const activeSubs = SUBSIDIARIES.filter(s => activeLabels.has(s));
    for (const label of activeLabels) {
      if (connected.has(label)) continue;
      const self = conceptMap.get(label)!;
      let match: string | null = null;
      for (const o of activeLabels) {
        if (o !== label && conceptMap.get(o)!.color === self.color) { match = o; break; }
      }
      if (!match) match = activeSubs[0] || null;
      if (!match) { for (const o of activeLabels) { if (o !== label) { match = o; break; } } }
      if (match) { addEdge(label, match); connected.add(label); }
    }

    // ===== 3. LAYOUT — Column-based to prevent overlap =====
    const WIDTH = 720;
    const nodes: VisNode[] = [];
    let nodeIdx = 0;

    // Categorize
    const activeSubList = SUBSIDIARIES.filter(s => activeLabels.has(s));
    const kpiByGroup = new Map<string, string[]>();
    const ungrouped: string[] = [];
    const supersolKpis: string[] = [];

    for (const label of activeLabels) {
      if (label === '슈퍼솔(앱)' || label === '고객정보' || SUBSIDIARIES.includes(label)) continue;
      const def = conceptMap.get(label)!;
      if (def.group === '슈퍼솔(앱)') {
        supersolKpis.push(label);
      } else if (def.group && activeLabels.has(def.group)) {
        const list = kpiByGroup.get(def.group) || [];
        list.push(label);
        kpiByGroup.set(def.group, list);
      } else {
        ungrouped.push(label);
      }
    }

    let y = 40;

    // --- Row 0: 슈퍼솔 (only if explicitly mentioned) ---
    const hasSuperSol = activeLabels.has('슈퍼솔(앱)');
    if (hasSuperSol) {
      nodes.push({ id: '슈퍼솔(앱)', label: '슈퍼솔(앱)', color: '#06b6d4', x: WIDTH / 2, y, size: 'large', delay: nodeIdx++ * 60 });
      if (supersolKpis.length > 0) {
        supersolKpis.forEach((kpi, i) => {
          const xOff = (i - (supersolKpis.length - 1) / 2) * 100;
          nodes.push({ id: kpi, label: kpi, color: '#06b6d4', x: WIDTH / 2 + xOff, y: y + 38, size: 'small', delay: nodeIdx++ * 60 });
        });
        y += 38;
      }
      y += 60;
    }

    // --- Row 1: Subsidiaries (evenly spaced) ---
    if (activeSubList.length > 0) {
      const colW = WIDTH / (activeSubList.length + 1);
      activeSubList.forEach((label, i) => {
        nodes.push({ id: label, label, color: conceptMap.get(label)!.color, x: colW * (i + 1), y, size: 'large', delay: nodeIdx++ * 60 });
      });
      y += 80;
    }

    // --- Row 2+: KPIs per column ---
    const colW = activeSubList.length > 0 ? WIDTH / (activeSubList.length + 1) : WIDTH;

    for (let si = 0; si < activeSubList.length; si++) {
      const sub = activeSubList[si];
      const kpis = kpiByGroup.get(sub) || [];
      if (kpis.length === 0) continue;
      const colCenter = colW * (si + 1);
      let localY = y;

      // KPIs are parallel concepts → ALWAYS place side-by-side horizontally
      const kpiGap = Math.max(110, colW * 0.85);
      const totalKpiW = (kpis.length - 1) * kpiGap;
      const kx0 = colCenter - totalKpiW / 2;

      kpis.forEach((kpi, ki) => {
        const def = conceptMap.get(kpi)!;
        const kpiX = kx0 + ki * kpiGap;
        nodes.push({ id: kpi, label: kpi, color: def.color, x: kpiX, y: localY, size: 'small', delay: nodeIdx++ * 60 });
      });
      localY += 46;

      // Children below each KPI, stacked vertically with more spacing
      for (let ki = 0; ki < kpis.length; ki++) {
        const kpi = kpis[ki];
        const def = conceptMap.get(kpi)!;
        const kpiX = kx0 + ki * kpiGap;
        if (hierarchyParents.has(kpi) && def.children) {
          def.children.forEach((ch, ci) => {
            const childY = localY + ci * 30;
            const cid = `${kpi}::${ch}`;
            nodes.push({ id: cid, label: ch, color: def.color, x: kpiX, y: childY, size: 'child', delay: nodeIdx++ * 60 });
            edges.push({ from: kpi, to: cid, color: def.color, isHierarchy: true, delay: nodeIdx * 60 });
          });
        }
      }
      const maxChildren = Math.max(...kpis.map(k => {
        const d = conceptMap.get(k)!;
        return (hierarchyParents.has(k) && d.children) ? d.children.length : 0;
      }));
      localY += maxChildren > 0 ? (maxChildren - 1) * 30 + 36 : 0;
    }

    // Find max y from nodes placed so far
    const maxKpiY = nodes.reduce((max, n) => Math.max(max, n.y), 0);
    y = maxKpiY + 90;

    // --- 고객정보 with children (성별, 연령대, 지역) ---
    if (activeLabels.has('고객정보')) {
      const custDef = conceptMap.get('고객정보')!;
      nodes.push({ id: '고객정보', label: '고객정보', color: custDef.color, x: WIDTH / 2, y, size: 'small', delay: nodeIdx++ * 60 });

      if (custDef.children) {
        const childY = y + 40;
        const childGap = 150;
        const totalW = (custDef.children.length - 1) * childGap;
        const cx0 = WIDTH / 2 - totalW / 2;
        custDef.children.forEach((ch, ci) => {
          const cid = `고객정보::${ch}`;
          nodes.push({ id: cid, label: ch, color: custDef.color, x: cx0 + ci * childGap, y: childY, size: 'child', delay: nodeIdx++ * 60 });
          edges.push({ from: '고객정보', to: cid, color: custDef.color, isHierarchy: true, delay: nodeIdx * 60 });
        });
        y = childY + 45;
      } else {
        y += 45;
      }
      y += 15;
    }

    // --- Ungrouped nodes ---
    const ungroupedFlat = ungrouped.filter(l => !hierarchyParents.has(l));
    const ungroupedHier = ungrouped.filter(l => hierarchyParents.has(l));

    if (ungroupedFlat.length > 0) {
      const ug = ungroupedFlat.length > 1 ? Math.min(140, (WIDTH - 80) / (ungroupedFlat.length - 1)) : 0;
      const ux = ungroupedFlat.length > 1 ? (WIDTH - (ungroupedFlat.length - 1) * ug) / 2 : WIDTH / 2;
      ungroupedFlat.forEach((label, i) => {
        nodes.push({ id: label, label, color: conceptMap.get(label)!.color, x: ux + i * ug, y, size: 'small', delay: nodeIdx++ * 60 });
      });
      y += 45;
    }

    for (const parentLabel of ungroupedHier) {
      const def = conceptMap.get(parentLabel)!;
      const children = def.children || [];
      nodes.push({ id: parentLabel, label: parentLabel, color: def.color, x: WIDTH / 2, y, size: 'small', delay: nodeIdx++ * 60 });
      if (children.length > 0) {
        const childY = y + 36;
        const childGap = Math.min(85, (WIDTH - 60) / Math.max(children.length - 1, 1));
        const totalW = (children.length - 1) * childGap;
        const cx0 = WIDTH / 2 - totalW / 2;
        children.forEach((ch, ci) => {
          const cid = `${parentLabel}::${ch}`;
          nodes.push({ id: cid, label: ch, color: def.color, x: cx0 + ci * childGap, y: childY, size: 'child', delay: nodeIdx++ * 60 });
          edges.push({ from: parentLabel, to: cid, color: def.color, isHierarchy: true, delay: nodeIdx * 60 });
        });
        y = childY + 40;
      } else {
        y += 40;
      }
      y += 10;
    }

    // --- Overlap resolution (5 passes) ---
    const getNodeWidth = (n: VisNode) => {
      const cw = n.size === 'large' ? 11 : n.size === 'child' ? 7.5 : 9.5;
      const pad = n.size === 'large' ? 26 : n.size === 'child' ? 14 : 20;
      return n.label.length * cw + pad;
    };

    for (let pass = 0; pass < 5; pass++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          if (Math.abs(a.y - b.y) > 14) continue;
          const halfA = getNodeWidth(a) / 2 + 8;
          const halfB = getNodeWidth(b) / 2 + 8;
          const minDist = halfA + halfB;
          const dist = Math.abs(a.x - b.x);
          if (dist < minDist) {
            const shift = (minDist - dist) / 2 + 4;
            if (a.x <= b.x) { a.x -= shift; b.x += shift; }
            else { a.x += shift; b.x -= shift; }
          }
        }
      }
    }

    // Clamp to canvas
    for (const n of nodes) {
      const hw = getNodeWidth(n) / 2 + 6;
      n.x = Math.max(hw, Math.min(WIDTH - hw, n.x));
    }

    // Assign edge delays based on connected nodes
    for (const e of edges) {
      const fromNode = nodes.find(n => n.id === e.from);
      const toNode = nodes.find(n => n.id === e.to);
      e.delay = Math.max(fromNode?.delay || 0, toNode?.delay || 0) + 100;
    }

    const maxNodeY = nodes.reduce((max, n) => Math.max(max, n.y), 0);
    const height = Math.max(150, maxNodeY + 40);
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

  const getHW = (n: VisNode) => {
    const cw = n.size === 'large' ? 11 : n.size === 'child' ? 7.5 : 9.5;
    const pad = n.size === 'large' ? 26 : n.size === 'child' ? 14 : 20;
    return (n.label.length * cw + pad) / 2;
  };
  const getHH = (n: VisNode) => n.size === 'large' ? 18 : n.size === 'child' ? 12 : 15;

  return (
    <div className="p-2 h-full overflow-y-auto">
      <style>{`
        @keyframes nodeAppear {
          0% { opacity: 0; transform: scale(0.4) translateY(8px); }
          70% { opacity: 1; transform: scale(1.05) translateY(-1px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes edgeDraw {
          0% { opacity: 0; stroke-dashoffset: 200; }
          100% { opacity: 0.6; stroke-dashoffset: 0; }
        }
        .ont-node-anim {
          opacity: 0;
          animation: nodeAppear 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          transform-origin: center;
          transform-box: fill-box;
        }
        .ont-node-static {
          opacity: 1;
        }
        .ont-edge-anim {
          opacity: 0;
          stroke-dasharray: 200;
          animation: edgeDraw 0.6s ease-out forwards;
        }
        .ont-edge-static {
          opacity: 0.6;
        }
      `}</style>
      <div className="rounded-[12px] bg-white border border-gray-200 shadow-card p-3">
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="block mx-auto">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" opacity="0.6" />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const from = posMap.get(e.from);
            const to = posMap.get(e.to);
            if (!from || !to) return null;
            const fn = nodes.find(n => n.id === e.from)!;
            const tn = nodes.find(n => n.id === e.to)!;
            const cls = animating ? 'ont-edge-anim' : 'ont-edge-static';
            const style = animating ? { animationDelay: `${e.delay}ms` } : undefined;

            if (e.isHierarchy) {
              return (
                <line key={`e-${i}`} className={cls} style={style}
                  x1={from.x} y1={from.y + getHH(fn)} x2={to.x} y2={to.y - getHH(tn)}
                  stroke={e.color} strokeWidth="1.5" />
              );
            }

            const sameRow = Math.abs(from.y - to.y) < 15;
            const isLongEdge = Math.abs(from.y - to.y) > 80;
            let d: string;
            if (sameRow) {
              const x1 = from.x < to.x ? from.x + getHW(fn) : from.x - getHW(fn);
              const x2 = from.x < to.x ? to.x - getHW(tn) : to.x + getHW(tn);
              const arc = from.y + 22 + Math.abs(x2 - x1) * 0.06;
              d = `M${x1},${from.y} Q${(x1 + x2) / 2},${arc} ${x2},${to.y}`;
            } else {
              const down = from.y < to.y;
              const y1 = down ? from.y + getHH(fn) : from.y - getHH(fn);
              const y2 = down ? to.y - getHH(tn) : to.y + getHH(tn);
              // For long edges, curve outward to avoid being hidden by intermediate nodes
              const xMid = (from.x + to.x) / 2;
              const xOffset = isLongEdge ? (from.x < to.x ? -30 : 30) : 0;
              d = `M${from.x},${y1} C${from.x + xOffset},${y1 + (y2 - y1) * 0.3} ${to.x + xOffset},${y2 + (y1 - y2) * 0.3} ${to.x},${y2}`;
            }
            return (
              <path key={`e-${i}`} className={cls} style={style}
                d={d} fill="none" stroke={e.color} strokeWidth={isLongEdge ? "1.8" : "1.5"}
                markerEnd={isLongEdge ? "url(#arrow)" : undefined} />
            );
          })}

          {nodes.map((n) => {
            const isL = n.size === 'large';
            const isC = n.size === 'child';
            const fs = isL ? 11.5 : isC ? 8.5 : 10;
            const cw = isL ? 11 : isC ? 7.5 : 9.5;
            const pad = isL ? 26 : isC ? 14 : 20;
            const w = n.label.length * cw + pad;
            const h = isL ? 30 : isC ? 19 : 24;
            const cls = animating ? 'ont-node-anim' : 'ont-node-static';
            const style = animating ? { animationDelay: `${n.delay}ms` } : undefined;

            return (
              <g key={n.id} className={cls} style={style}>
                <rect x={n.x - w / 2} y={n.y - h / 2} width={w} height={h} rx={h / 2}
                  fill={isL ? n.color : isC ? n.color : '#fff'}
                  fillOpacity={isL ? 0.1 : isC ? 0.06 : 1}
                  stroke={n.color} strokeWidth={isL ? 2 : isC ? 0.8 : 1.3}
                  strokeDasharray={isC ? '2.5,1.5' : undefined} />
                <text x={n.x} y={n.y + (isL ? 4 : isC ? 3 : 3.5)} textAnchor="middle"
                  fill={n.color} fontSize={fs} fontWeight={isL ? 700 : isC ? 400 : 500} fontFamily="system-ui">
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
