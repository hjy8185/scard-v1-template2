'use client';

import React, { useMemo } from 'react';
import type { ReasoningStep } from '@/lib/types';

interface OntologyViewProps {
  context?: ReasoningStep[];
  tablesUsed?: string[];
}

interface VisNode {
  id: string;
  label: string;
  type: 'master' | 'table' | 'join_key';
  x: number;
  y: number;
  color: string;
  domain?: string;
}

interface VisEdge {
  from: string;
  to: string;
  label: string;
  type: 'join' | 'subsidiary';
}

const DOMAIN_COLORS: Record<string, string> = {
  customer: '#38c7e0',
  transaction: '#3dd68c',
  product: '#f5a623',
  merchant: '#ec4899',
  soleprop: '#a78bfa',
  bank: '#60a5fa',
  card: '#f97316',
  life: '#10b981',
  securities: '#8b5cf6',
  common: '#6b7280',
  marketing: '#f472b6',
  membership: '#34d399',
  digital_channel: '#22d3ee',
};

const ONEDATA_ONTOLOGY = {
  master: { id: 'igd_d_cust_mas', label: '그룹 통합 고객 마스터', domain: 'customer' },
  digital: [
    { id: 'jaz_sh_fanclub_membership_chghist', label: '슈퍼솔 앱 사용', domain: 'digital_channel' },
    { id: 'sol_m_supersol_visit', label: '슈퍼솔 월간방문', domain: 'digital_channel' },
    { id: 'sol_d_supersol_session', label: '슈퍼솔 세션로그', domain: 'digital_channel' },
    { id: 'shg_membership_cust_hist', label: '멤버십 상태', domain: 'digital_channel' },
  ],
  subsidiaries: [
    { id: 'cln_d_cust_mas_bank', label: '은행 고객', domain: 'bank' },
    { id: 'cln_d_cust_mas_card', label: '카드 고객', domain: 'card' },
    { id: 'cln_d_cust_mas_life', label: '라이프 고객', domain: 'life' },
    { id: 'cln_d_cust_mas_sec', label: '증권 고객', domain: 'securities' },
  ],
  transactions: [
    { id: 'igd_m_cust_txn', label: '통합 거래', domain: 'transaction' },
    { id: 'igd_m_cust_txn_bank', label: '은행 거래', domain: 'bank' },
    { id: 'igd_m_cust_txn_card', label: '카드 거래', domain: 'card' },
    { id: 'igd_m_cust_txn_life', label: '라이프 거래', domain: 'life' },
    { id: 'igd_m_cust_txn_sec', label: '증권 거래', domain: 'securities' },
  ],
  analytics: [
    { id: 'igd_m_cust_base', label: '고객 기본정보', domain: 'customer' },
    { id: 'igd_m_shg_rfm_base_ledger', label: 'RFM 분석', domain: 'marketing' },
    { id: 'm_cust_dim', label: '고객 디멘션', domain: 'customer' },
  ],
};

export function OntologyView({ context, tablesUsed }: OntologyViewProps) {
  const graphData = useMemo(() => {
    if (tablesUsed && tablesUsed.length > 0) {
      return buildQueryOntology(tablesUsed);
    }
    return buildDefaultOntology();
  }, [tablesUsed]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-pearl">온톨로지 그래프</h3>
        <div className="flex items-center gap-2">
          {tablesUsed && tablesUsed.length > 0 && (
            <span className="text-xs text-aqua bg-aqua/10 px-2.5 py-1 rounded-full border border-aqua/20">
              쿼리 관련
            </span>
          )}
          <span className="text-xs text-mist bg-ink-700 px-2.5 py-1 rounded-full border border-ink-600">
            {graphData.nodes.length} 노드
          </span>
        </div>
      </div>

      <div className="rounded-xl bg-ink-900 border border-ink-600 overflow-hidden">
        <svg
          viewBox="0 0 800 550"
          className="w-full h-[450px]"
          style={{ background: 'radial-gradient(circle at 50% 50%, #0d1f2d, #06121a)' }}
        >
          <defs>
            <pattern id="ontology-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e3a4f" strokeWidth="0.5" opacity="0.2" />
            </pattern>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <rect width="800" height="550" fill="url(#ontology-grid)" />

          {/* Edges */}
          {graphData.edges.map((edge, i) => {
            const from = graphData.nodes.find((n) => n.id === edge.from);
            const to = graphData.nodes.find((n) => n.id === edge.to);
            if (!from || !to) return null;

            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;

            return (
              <g key={`edge-${i}`}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={edge.type === 'join' ? '#38c7e0' : '#1e3a4f'}
                  strokeWidth={edge.type === 'join' ? 2 : 1}
                  strokeDasharray={edge.type === 'subsidiary' ? '4,4' : 'none'}
                  opacity={0.6}
                />
                <text
                  x={midX}
                  y={midY - 6}
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
          {graphData.nodes.map((node) => {
            const size = node.type === 'master' ? 32 : node.type === 'join_key' ? 16 : 24;
            const highlighted = tablesUsed?.includes(node.id);

            return (
              <g key={node.id} filter={highlighted ? 'url(#glow)' : undefined}>
                {/* Outer glow */}
                {highlighted && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={size + 8}
                    fill={node.color}
                    opacity="0.1"
                  />
                )}
                {/* Node */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={size}
                  fill="#0d1f2d"
                  stroke={node.color}
                  strokeWidth={highlighted ? 2.5 : 1.5}
                  opacity={highlighted ? 1 : 0.7}
                />
                {/* Icon text */}
                {node.type === 'master' && (
                  <text x={node.x} y={node.y + 5} textAnchor="middle" fill={node.color} fontSize="14" fontWeight="bold">
                    M
                  </text>
                )}
                {node.type === 'table' && (
                  <text x={node.x} y={node.y + 4} textAnchor="middle" fill={node.color} fontSize="11">
                    T
                  </text>
                )}
                {node.type === 'join_key' && (
                  <text x={node.x} y={node.y + 4} textAnchor="middle" fill={node.color} fontSize="8">
                    K
                  </text>
                )}
                {/* Label */}
                <text
                  x={node.x}
                  y={node.y + size + 14}
                  textAnchor="middle"
                  fill={highlighted ? '#f0f6f4' : '#8ba4b0'}
                  fontSize={node.type === 'master' ? 11 : 10}
                  fontFamily="system-ui"
                >
                  {node.label.length > 18 ? node.label.slice(0, 18) + '...' : node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full border-2" style={{ borderColor: '#22d3ee' }} />
          <span className="text-xs text-mist">디지털채널(슈퍼솔)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full border-2 border-aqua bg-ink-800" />
          <span className="text-xs text-mist">고객</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full border-2 border-jade bg-ink-800" />
          <span className="text-xs text-mist">거래</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full border-2" style={{ borderColor: '#60a5fa' }} />
          <span className="text-xs text-mist">은행</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full border-2" style={{ borderColor: '#f97316' }} />
          <span className="text-xs text-mist">카드</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-[2px] w-6 bg-aqua/60" />
          <span className="text-xs text-mist">그룹md 조인</span>
        </div>
      </div>
    </div>
  );
}

function buildQueryOntology(tablesUsed: string[]): { nodes: VisNode[]; edges: VisEdge[] } {
  const nodes: VisNode[] = [];
  const edges: VisEdge[] = [];
  const centerX = 400;
  const centerY = 275;

  // Always show the master table in center
  const hasMaster = tablesUsed.includes('igd_d_cust_mas');
  nodes.push({
    id: 'igd_d_cust_mas',
    label: '그룹 통합 고객 마스터',
    type: 'master',
    x: centerX,
    y: centerY,
    color: DOMAIN_COLORS.customer,
    domain: 'customer',
  });

  // Add join key
  nodes.push({
    id: 'join_key',
    label: '그룹md번호',
    type: 'join_key',
    x: centerX,
    y: centerY - 60,
    color: '#f5a623',
  });
  edges.push({ from: 'igd_d_cust_mas', to: 'join_key', label: 'PK', type: 'join' });

  // Place used tables around the center
  const usedNonMaster = tablesUsed.filter(t => t !== 'igd_d_cust_mas');
  const radius = 180;

  usedNonMaster.forEach((tableId, i) => {
    const angle = (2 * Math.PI * i) / Math.max(usedNonMaster.length, 1) - Math.PI / 2;
    const domain = getDomain(tableId);

    nodes.push({
      id: tableId,
      label: getTableLabel(tableId),
      type: 'table',
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      color: DOMAIN_COLORS[domain] || DOMAIN_COLORS.common,
      domain,
    });

    edges.push({
      from: 'join_key',
      to: tableId,
      label: 'FK',
      type: 'join',
    });
  });

  return { nodes, edges };
}

function buildDefaultOntology(): { nodes: VisNode[]; edges: VisEdge[] } {
  const nodes: VisNode[] = [];
  const edges: VisEdge[] = [];
  const centerX = 400;
  const centerY = 280;

  // Master node
  nodes.push({
    id: ONEDATA_ONTOLOGY.master.id,
    label: ONEDATA_ONTOLOGY.master.label,
    type: 'master',
    x: centerX,
    y: centerY,
    color: DOMAIN_COLORS.customer,
  });

  // Digital channel (top-center, most prominent)
  ONEDATA_ONTOLOGY.digital.forEach((d, i) => {
    const x = 300 + (i * 200);
    nodes.push({ id: d.id, label: d.label, type: 'table', x, y: 80, color: DOMAIN_COLORS.digital_channel || '#22d3ee' });
    edges.push({ from: ONEDATA_ONTOLOGY.master.id, to: d.id, label: '그룹md', type: 'join' });
  });

  // Subsidiaries (left side)
  ONEDATA_ONTOLOGY.subsidiaries.forEach((s, i) => {
    nodes.push({ id: s.id, label: s.label, type: 'table', x: 80, y: 120 + (i * 100), color: DOMAIN_COLORS[s.domain] });
    edges.push({ from: ONEDATA_ONTOLOGY.master.id, to: s.id, label: '1:1', type: 'subsidiary' });
  });

  // Transactions (bottom)
  ONEDATA_ONTOLOGY.transactions.slice(0, 4).forEach((t, i) => {
    const x = 150 + (i * 170);
    nodes.push({ id: t.id, label: t.label, type: 'table', x, y: 490, color: DOMAIN_COLORS[t.domain] });
    edges.push({ from: ONEDATA_ONTOLOGY.master.id, to: t.id, label: '1:N', type: 'join' });
  });

  // Analytics (right side)
  ONEDATA_ONTOLOGY.analytics.forEach((a, i) => {
    nodes.push({ id: a.id, label: a.label, type: 'table', x: 700, y: 160 + (i * 120), color: DOMAIN_COLORS[a.domain] || DOMAIN_COLORS.common });
    edges.push({ from: ONEDATA_ONTOLOGY.master.id, to: a.id, label: '1:1', type: 'join' });
  });

  return { nodes, edges };
}

function getDomain(tableId: string): string {
  if (tableId.includes('fanclub') || tableId.includes('membership') || tableId.startsWith('shg_') || tableId.startsWith('sol_')) return 'digital_channel';
  if (tableId.includes('cust') && !tableId.includes('txn')) return 'customer';
  if (tableId.includes('txn') || tableId.startsWith('trs_')) return 'transaction';
  if (tableId.startsWith('pdt_') || tableId.includes('prod')) return 'product';
  if (tableId.includes('merchant')) return 'merchant';
  if (tableId.includes('soleprop')) return 'soleprop';
  if (tableId.includes('bank')) return 'bank';
  if (tableId.includes('card')) return 'card';
  if (tableId.includes('life')) return 'life';
  if (tableId.includes('sec')) return 'securities';
  if (tableId.startsWith('vam_')) return 'marketing';
  return 'common';
}

function getTableLabel(tableId: string): string {
  const labels: Record<string, string> = {
    'igd_d_cust_mas': '그룹 통합 고객 마스터',
    'igd_m_cust_base': '고객 기본정보',
    'igd_m_cust_txn': '통합 거래',
    'igd_m_cust_txn_bank': '은행 거래',
    'igd_m_cust_txn_card': '카드 거래',
    'igd_m_cust_txn_life': '라이프 거래',
    'igd_m_cust_txn_sec': '증권 거래',
    'igd_m_cust_holding_base': '보유상품 현황',
    'cln_d_cust_mas_bank': '은행 고객',
    'cln_d_cust_mas_card': '카드 고객',
    'cln_d_cust_mas_life': '라이프 고객',
    'cln_d_cust_mas_sec': '증권 고객',
    'cln_m_cust_base_bank': '은행 고객 월간',
    'cln_m_cust_base_card': '카드 고객 월간',
    'trs_m_cust_card_txn_card': '카드 결제',
    'trs_m_merchant_delivery': '배달 거래',
    'com_m_merchant_franchise': '가맹점 프랜차이즈',
    'm_cust_dim': '고객 디멘션',
    'm_card_dim': '카드 디멘션',
    'igd_m_shg_rfm_base_ledger': 'RFM 분석',
    'vam_cus_mkt_mas_m': '마케팅 고객',
    'jaz_sh_fanclub_membership_chghist': '슈퍼솔 앱 사용',
    'sol_m_supersol_visit': '슈퍼솔 월간방문',
    'sol_d_supersol_session': '슈퍼솔 세션로그',
    'shg_membership_cust_hist': '멤버십 상태',
  };
  return labels[tableId] || tableId.replace(/^(igd_|cln_|trs_|pdt_|com_|rpt_|jaz_|shg_)/, '');
}
