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
  type: 'master' | 'table' | 'join_key' | 'group';
  x: number;
  y: number;
  color: string;
  domain?: string;
  depth?: number;
}

interface VisEdge {
  from: string;
  to: string;
  label: string;
  type: 'join' | 'subsidiary' | 'hierarchy';
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

export function OntologyView({ context, tablesUsed }: OntologyViewProps) {
  const graphData = useMemo(() => {
    return buildHierarchicalOntology();
  }, []);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-pearl">온톨로지 그래프</h3>
        <div className="flex items-center gap-2">
          {tablesUsed && tablesUsed.length > 0 && (
            <span className="text-xs text-aqua bg-aqua/10 px-2.5 py-1 rounded-full border border-aqua/20">
              쿼리 관련 {tablesUsed.length}개
            </span>
          )}
          <span className="text-xs text-mist bg-ink-700 px-2.5 py-1 rounded-full border border-ink-600">
            {graphData.nodes.length} 노드
          </span>
        </div>
      </div>

      <div className="rounded-xl bg-ink-900 border border-ink-600 overflow-hidden">
        <svg
          viewBox="0 0 900 680"
          className="w-full h-[550px]"
          style={{ background: 'radial-gradient(circle at 50% 40%, #0d1f2d, #06121a)' }}
        >
          <defs>
            <pattern id="ontology-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e3a4f" strokeWidth="0.5" opacity="0.15" />
            </pattern>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <filter id="glow-strong">
              <feGaussianBlur stdDeviation="5" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <rect width="900" height="680" fill="url(#ontology-grid)" />

          {/* Depth level indicators */}
          <text x="20" y="60" fill="#2a4a5a" fontSize="10" fontFamily="monospace">Depth 0: 마스터</text>
          <text x="20" y="200" fill="#2a4a5a" fontSize="10" fontFamily="monospace">Depth 1: 계열사/도메인</text>
          <text x="20" y="420" fill="#2a4a5a" fontSize="10" fontFamily="monospace">Depth 2: 거래/상세</text>
          <text x="20" y="600" fill="#2a4a5a" fontSize="10" fontFamily="monospace">Depth 3: 분석/집계</text>

          {/* Edges */}
          {graphData.edges.map((edge, i) => {
            const from = graphData.nodes.find((n) => n.id === edge.from);
            const to = graphData.nodes.find((n) => n.id === edge.to);
            if (!from || !to) return null;

            const isHighlighted = tablesUsed?.includes(from.id) && tablesUsed?.includes(to.id);
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const midX = from.x + dx * 0.5;
            const midY = from.y + dy * 0.5;
            const ctrlY = midY - Math.abs(dx) * 0.05;

            return (
              <g key={`edge-${i}`}>
                <path
                  d={`M ${from.x} ${from.y} Q ${midX} ${ctrlY} ${to.x} ${to.y}`}
                  fill="none"
                  stroke={isHighlighted ? '#38c7e0' : edge.type === 'join' ? '#38c7e0' : edge.type === 'hierarchy' ? '#2a4a5a' : '#1e3a4f'}
                  strokeWidth={isHighlighted ? 2.5 : edge.type === 'join' ? 1.5 : 1}
                  strokeDasharray={edge.type === 'subsidiary' ? '4,4' : edge.type === 'hierarchy' ? '2,3' : 'none'}
                  opacity={isHighlighted ? 0.9 : 0.5}
                />
                {edge.label && (
                  <text
                    x={midX}
                    y={ctrlY - 5}
                    textAnchor="middle"
                    fill="#4a6a7a"
                    fontSize="8"
                    fontFamily="monospace"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {graphData.nodes.map((node) => {
            const size = node.type === 'master' ? 30 : node.type === 'group' ? 22 : 18;
            const highlighted = tablesUsed?.includes(node.id);

            return (
              <g key={node.id} filter={highlighted ? 'url(#glow-strong)' : undefined}>
                {highlighted && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={size + 10}
                    fill={node.color}
                    opacity="0.12"
                  />
                )}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={size}
                  fill={highlighted ? `${node.color}15` : '#0a1520'}
                  stroke={node.color}
                  strokeWidth={highlighted ? 2.5 : node.type === 'master' ? 2 : 1.2}
                  opacity={highlighted ? 1 : 0.75}
                />
                {node.type === 'master' && (
                  <text x={node.x} y={node.y + 5} textAnchor="middle" fill={node.color} fontSize="13" fontWeight="bold">M</text>
                )}
                {node.type === 'group' && (
                  <text x={node.x} y={node.y + 4} textAnchor="middle" fill={node.color} fontSize="10" fontWeight="bold">G</text>
                )}
                {node.type === 'table' && (
                  <text x={node.x} y={node.y + 4} textAnchor="middle" fill={node.color} fontSize="9">T</text>
                )}
                <text
                  x={node.x}
                  y={node.y + size + 12}
                  textAnchor="middle"
                  fill={highlighted ? '#f0f6f4' : '#7a9aaa'}
                  fontSize={node.type === 'master' ? 11 : node.type === 'group' ? 10 : 9}
                  fontFamily="system-ui"
                  fontWeight={node.type === 'master' ? 'bold' : 'normal'}
                >
                  {node.label.length > 14 ? node.label.slice(0, 14) + '…' : node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full border-2" style={{ borderColor: DOMAIN_COLORS.customer }} />
          <span className="text-xs text-mist">고객</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full border-2" style={{ borderColor: DOMAIN_COLORS.digital_channel }} />
          <span className="text-xs text-mist">디지털</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full border-2" style={{ borderColor: DOMAIN_COLORS.bank }} />
          <span className="text-xs text-mist">은행</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full border-2" style={{ borderColor: DOMAIN_COLORS.card }} />
          <span className="text-xs text-mist">카드</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full border-2" style={{ borderColor: DOMAIN_COLORS.life }} />
          <span className="text-xs text-mist">라이프</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full border-2" style={{ borderColor: DOMAIN_COLORS.securities }} />
          <span className="text-xs text-mist">증권</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full border-2" style={{ borderColor: DOMAIN_COLORS.product }} />
          <span className="text-xs text-mist">상품</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full border-2" style={{ borderColor: DOMAIN_COLORS.merchant }} />
          <span className="text-xs text-mist">가맹점</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-[2px] w-5" style={{ background: '#38c7e0' }} />
          <span className="text-xs text-mist">조인</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-[2px] w-5 border-t border-dashed" style={{ borderColor: '#2a4a5a' }} />
          <span className="text-xs text-mist">계층</span>
        </div>
      </div>
    </div>
  );
}

function buildHierarchicalOntology(): { nodes: VisNode[]; edges: VisEdge[] } {
  const nodes: VisNode[] = [];
  const edges: VisEdge[] = [];

  // --- Depth 0: Master (center-top) ---
  const masterX = 450;
  const masterY = 55;
  nodes.push({
    id: 'igd_d_cust_mas', label: '통합 고객 마스터', type: 'master',
    x: masterX, y: masterY, color: DOMAIN_COLORS.customer, depth: 0,
  });

  // --- Depth 1: Domain groups ---
  const depth1Y = 180;
  const depth1Items = [
    { id: 'cln_d_cust_mas_bank', label: '은행 고객', domain: 'bank', x: 100 },
    { id: 'cln_d_cust_mas_card', label: '카드 고객', domain: 'card', x: 250 },
    { id: 'cln_d_cust_mas_life', label: '라이프 고객', domain: 'life', x: 400 },
    { id: 'cln_d_cust_mas_sec', label: '증권 고객', domain: 'securities', x: 550 },
    { id: 'jaz_sh_fanclub_membership_chghist', label: '팬클럽(가입이력)', domain: 'digital_channel', x: 700 },
    { id: 'igd_m_cust_base', label: '고객 기본', domain: 'customer', x: 850 },
  ];

  depth1Items.forEach(item => {
    nodes.push({
      id: item.id, label: item.label, type: 'group',
      x: item.x, y: depth1Y, color: DOMAIN_COLORS[item.domain], depth: 1,
    });
    edges.push({ from: 'igd_d_cust_mas', to: item.id, label: '그룹md', type: 'join' });
  });

  // --- Depth 2: Transactions & detail tables ---
  const depth2Y = 370;
  const depth2Items = [
    // Bank children
    { id: 'igd_m_cust_txn_bank', label: '은행 거래', domain: 'bank', x: 60, parent: 'cln_d_cust_mas_bank' },
    { id: 'trs_m_cust_acct_txn_bank', label: '은행 계좌 거래', domain: 'bank', x: 150, parent: 'cln_d_cust_mas_bank' },
    // Card children
    { id: 'igd_m_cust_txn_card', label: '카드 거래', domain: 'card', x: 250, parent: 'cln_d_cust_mas_card' },
    { id: 'trs_m_cust_card_txn_card', label: '카드 결제 상세', domain: 'card', x: 340, parent: 'cln_d_cust_mas_card' },
    // Life children
    { id: 'igd_m_cust_txn_life', label: '보험 거래', domain: 'life', x: 430, parent: 'cln_d_cust_mas_life' },
    // Securities children
    { id: 'igd_m_cust_txn_sec', label: '증권 거래', domain: 'securities', x: 540, parent: 'cln_d_cust_mas_sec' },
    { id: 'trs_m_cust_acct_txn_sec', label: '증권 계좌', domain: 'securities', x: 620, parent: 'cln_d_cust_mas_sec' },
    // Digital children
    { id: 'sol_m_supersol_visit', label: '슈퍼솔 월MAU', domain: 'digital_channel', x: 720, parent: 'jaz_sh_fanclub_membership_chghist' },
    { id: 'shg_membership_cust_hist', label: '리워드앱', domain: 'digital_channel', x: 810, parent: 'jaz_sh_fanclub_membership_chghist' },
  ];

  depth2Items.forEach(item => {
    nodes.push({
      id: item.id, label: item.label, type: 'table',
      x: item.x, y: depth2Y, color: DOMAIN_COLORS[item.domain], depth: 2,
    });
    edges.push({ from: item.parent, to: item.id, label: '', type: 'hierarchy' });
  });

  // --- Depth 3: Leaf analytics / detail ---
  const depth3Y = 540;
  const depth3Items = [
    { id: 'cln_m_cust_base_bank', label: '은행 고객 월간', domain: 'bank', x: 60, parent: 'igd_m_cust_txn_bank' },
    { id: 'pdt_m_acct_holding_base_bank', label: '예금 계좌', domain: 'product', x: 150, parent: 'trs_m_cust_acct_txn_bank' },
    { id: 'cln_m_cust_base_card', label: '카드 고객 월간', domain: 'card', x: 260, parent: 'igd_m_cust_txn_card' },
    { id: 'com_m_merchant_franchise', label: '가맹점', domain: 'merchant', x: 360, parent: 'trs_m_cust_card_txn_card' },
    { id: 'trs_m_merchant_delivery', label: '배달 거래', domain: 'merchant', x: 450, parent: 'trs_m_cust_card_txn_card' },
    { id: 'pdt_m_contract_holding_base_life', label: '보험 계약', domain: 'product', x: 540, parent: 'igd_m_cust_txn_life' },
    { id: 'rpt_d_assetsize_sec', label: '증권 자산', domain: 'securities', x: 630, parent: 'trs_m_cust_acct_txn_sec' },
    { id: 'sol_d_supersol_session', label: '슈퍼솔 일세션', domain: 'digital_channel', x: 730, parent: 'sol_m_supersol_visit' },
    { id: 'igd_m_shg_rfm_base_ledger', label: 'RFM 분석', domain: 'marketing', x: 840, parent: 'shg_membership_cust_hist' },
  ];

  depth3Items.forEach(item => {
    nodes.push({
      id: item.id, label: item.label, type: 'table',
      x: item.x, y: depth3Y, color: DOMAIN_COLORS[item.domain], depth: 3,
    });
    edges.push({ from: item.parent, to: item.id, label: '', type: 'hierarchy' });
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
    'igd_d_cust_mas': '통합 고객 마스터',
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
    'trs_m_cust_acct_txn_bank': '은행 계좌 거래',
    'trs_m_cust_acct_txn_sec': '증권 계좌 거래',
    'trs_m_merchant_delivery': '배달 거래',
    'com_m_merchant_franchise': '가맹점 프랜차이즈',
    'm_cust_dim': '고객 디멘션',
    'm_card_dim': '카드 디멘션',
    'igd_m_shg_rfm_base_ledger': 'RFM 분석',
    'vam_cus_mkt_mas_m': '마케팅 고객',
    'jaz_sh_fanclub_membership_chghist': '팬클럽(가입이력)',
    'sol_m_supersol_visit': '슈퍼솔 월MAU',
    'sol_d_supersol_session': '슈퍼솔 일세션',
    'shg_membership_cust_hist': '리워드앱 이력',
    'pdt_m_acct_holding_base_bank': '예금 계좌',
    'pdt_m_contract_holding_base_life': '보험 계약',
    'rpt_d_assetsize_sec': '증권 자산',
  };
  return labels[tableId] || tableId.replace(/^(igd_|cln_|trs_|pdt_|com_|rpt_|jaz_|shg_|sol_)/, '');
}
