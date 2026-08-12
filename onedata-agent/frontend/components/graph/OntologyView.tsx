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
  x: number;
  y: number;
  color: string;
}

interface VisEdge {
  from: string;
  to: string;
  joinKey: string;
}

const DOMAIN_COLORS: Record<string, string> = {
  customer: '#38c7e0',
  bank: '#60a5fa',
  card: '#f97316',
  life: '#10b981',
  securities: '#8b5cf6',
  digital_channel: '#22d3ee',
  transaction: '#3dd68c',
  product: '#f5a623',
  merchant: '#ec4899',
  soleprop: '#a78bfa',
  marketing: '#f472b6',
  common: '#6b7280',
};

const JOIN_RULES: Record<string, Record<string, string>> = {
  'igd_d_cust_mas': { _default: '그룹md번호' },
  'igd_m_cust_base': { _default: '그룹md번호 + 기준년월' },
  'igd_m_cust_txn_card': { _default: '그룹md번호 + 기준년월' },
  'igd_m_cust_txn_bank': { _default: '그룹md번호 + 기준년월' },
  'igd_m_cust_txn_life': { _default: '그룹md번호 + 기준년월' },
  'igd_m_cust_txn_sec': { _default: '그룹md번호 + 기준년월' },
  'cln_d_cust_mas_bank': { _default: '그룹md번호' },
  'cln_d_cust_mas_card': { _default: '그룹md번호' },
  'cln_d_cust_mas_life': { _default: '그룹md번호' },
  'cln_d_cust_mas_sec': { _default: '그룹md번호' },
  'cln_m_cust_base_bank': { _default: '그룹md번호 + 기준년월' },
  'cln_m_cust_base_card': { _default: '그룹md번호 + 기준년월' },
  'sol_m_supersol_visit': { _default: '그룹md번호 + 기준년월', 'jaz_sh_fanclub_membership_chghist': '그룹md번호 = 그룹md' },
  'sol_d_supersol_session': { _default: '그룹md번호 + 기준일자', 'sol_m_supersol_visit': '그룹md번호 (롤업)' },
  'jaz_sh_fanclub_membership_chghist': { _default: '그룹md', 'sol_m_supersol_visit': '그룹md = 그룹md번호' },
  'shg_membership_cust_hist': { _default: '고객번호' },
  'trs_m_cust_card_txn_card': { _default: '그룹md번호 + 기준년월' },
  'trs_m_cust_acct_txn_bank': { _default: '그룹md번호 + 기준년월' },
  'trs_m_cust_acct_txn_sec': { _default: '그룹md번호 + 기준년월' },
  'trs_m_merchant_delivery': { _default: '가맹점번호' },
  'com_m_merchant_franchise': { _default: '가맹점번호' },
  'pdt_m_acct_holding_base_bank': { _default: '그룹md번호 + 기준년월' },
  'pdt_m_contract_holding_base_life': { _default: '그룹md번호 + 기준년월' },
  'pdt_m_loan_prod_base_card': { _default: '그룹md번호' },
  'igd_m_shg_rfm_base_ledger': { _default: '그룹md번호 + 기준년월' },
  'rpt_d_assetsize_sec': { _default: '그룹md번호' },
  'rpt_d_unit_deposit_acct': { _default: 'rtrim(고객번호)' },
  'vam_cus_mkt_mas_m': { _default: '고객번호' },
  'm_cust_dim': { _default: '그룹md번호' },
};

export function OntologyView({ context, tablesUsed }: OntologyViewProps) {
  const graphData = useMemo(() => {
    if (tablesUsed && tablesUsed.length > 0) {
      return buildQueryGraph(tablesUsed);
    }
    return buildEmptyState();
  }, [tablesUsed]);

  if (!graphData) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-sm text-slate">쿼리를 실행하면 사용된 테이블 간 관계를 보여줍니다.</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-pearl">테이블 관계도</h3>
        <span className="text-[11px] text-mist bg-ink-700 px-2 py-0.5 rounded-full border border-ink-600">
          {graphData.nodes.length}개 테이블
        </span>
      </div>

      <div className="rounded-xl bg-ink-900 border border-ink-600 overflow-hidden">
        <svg
          viewBox={`0 0 ${graphData.width} ${graphData.height}`}
          className="w-full"
          style={{
            height: Math.min(400, graphData.height),
            background: 'radial-gradient(circle at 50% 50%, #0d1f2d, #08151f)',
          }}
        >
          {/* Edges with join key labels */}
          {graphData.edges.map((edge, i) => {
            const from = graphData.nodes.find((n) => n.id === edge.from);
            const to = graphData.nodes.find((n) => n.id === edge.to);
            if (!from || !to) return null;

            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;

            return (
              <g key={`edge-${i}`}>
                <line
                  x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                  stroke="#38c7e0" strokeWidth="1.5" opacity="0.6"
                  markerEnd="url(#arrowhead)"
                />
                {/* Join key pill */}
                <rect
                  x={midX - edge.joinKey.length * 3.2 - 6}
                  y={midY - 9}
                  width={edge.joinKey.length * 6.4 + 12}
                  height={18}
                  rx="9"
                  fill="#0d1f2d"
                  stroke="#1e3a4f"
                  strokeWidth="1"
                />
                <text
                  x={midX} y={midY + 3}
                  textAnchor="middle"
                  fill="#38c7e0"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  {edge.joinKey}
                </text>
              </g>
            );
          })}

          {/* Arrow marker */}
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#38c7e0" opacity="0.6" />
            </marker>
          </defs>

          {/* Nodes */}
          {graphData.nodes.map((node) => {
            const labelWidth = Math.max(node.label.length * 7 + 24, 80);
            return (
              <g key={node.id}>
                <rect
                  x={node.x - labelWidth / 2}
                  y={node.y - 16}
                  width={labelWidth}
                  height={32}
                  rx="6"
                  fill="#0a1520"
                  stroke={node.color}
                  strokeWidth="1.5"
                />
                <circle
                  cx={node.x - labelWidth / 2 + 12}
                  cy={node.y}
                  r="4"
                  fill={node.color}
                  opacity="0.8"
                />
                <text
                  x={node.x - labelWidth / 2 + 22}
                  y={node.y + 4}
                  fill="#e0f0f4"
                  fontSize="10"
                  fontFamily="system-ui"
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Table list with domains */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {graphData.nodes.map((node) => (
          <span
            key={node.id}
            className="text-[10px] px-2 py-0.5 rounded border"
            style={{ color: node.color, borderColor: `${node.color}33`, background: `${node.color}08` }}
          >
            {node.id}
          </span>
        ))}
      </div>
    </div>
  );
}

function buildQueryGraph(tablesUsed: string[]): { nodes: VisNode[]; edges: VisEdge[]; width: number; height: number } {
  const nodes: VisNode[] = [];
  const edges: VisEdge[] = [];
  const count = tablesUsed.length;

  if (count === 1) {
    nodes.push({
      id: tablesUsed[0],
      label: getTableLabel(tablesUsed[0]),
      x: 250, y: 50,
      color: DOMAIN_COLORS[getDomain(tablesUsed[0])],
    });
    return { nodes, edges, width: 500, height: 100 };
  }

  // Layout: vertical list for 2-3 tables, grid for more
  const width = 500;
  const rowHeight = 70;
  const height = Math.max(count * rowHeight + 40, 160);

  tablesUsed.forEach((tableId, i) => {
    const x = count <= 3 ? 250 : (i % 2 === 0 ? 160 : 340);
    const y = count <= 3 ? 40 + i * rowHeight : 40 + Math.floor(i / 2) * rowHeight;

    nodes.push({
      id: tableId,
      label: getTableLabel(tableId),
      x, y,
      color: DOMAIN_COLORS[getDomain(tableId)],
    });
  });

  // Find join relationships between used tables
  for (let i = 0; i < tablesUsed.length; i++) {
    for (let j = i + 1; j < tablesUsed.length; j++) {
      const joinKey = getJoinKey(tablesUsed[i], tablesUsed[j]);
      if (joinKey) {
        edges.push({ from: tablesUsed[i], to: tablesUsed[j], joinKey });
      }
    }
  }

  return { nodes, edges, width, height };
}

function buildEmptyState(): null {
  return null;
}

function getJoinKey(tableA: string, tableB: string): string | null {
  const rulesA = JOIN_RULES[tableA];
  const rulesB = JOIN_RULES[tableB];

  if (rulesA?.[tableB]) return rulesA[tableB];
  if (rulesB?.[tableA]) return rulesB[tableA];

  const keyA = rulesA?._default;
  const keyB = rulesB?._default;

  if (!keyA || !keyB) return null;

  // If both tables share 그룹md번호, they can join
  if (keyA.includes('그룹md') && keyB.includes('그룹md')) {
    if (keyA.includes('기준년월') && keyB.includes('기준년월')) {
      return '그룹md번호 + 기준년월';
    }
    return '그룹md번호';
  }
  if (keyA.includes('고객번호') && keyB.includes('고객번호')) {
    return '고객번호';
  }
  if (keyA.includes('가맹점') && keyB.includes('가맹점')) {
    return '가맹점번호';
  }

  return null;
}

function getDomain(tableId: string): string {
  if (tableId.startsWith('sol_') || tableId.includes('fanclub') || tableId.startsWith('shg_')) return 'digital_channel';
  if (tableId.includes('bank') && !tableId.includes('txn')) return 'bank';
  if (tableId.includes('card') && !tableId.includes('txn')) return 'card';
  if (tableId.includes('life') && !tableId.includes('txn')) return 'life';
  if (tableId.includes('sec') && !tableId.includes('txn')) return 'securities';
  if (tableId.includes('txn') || tableId.startsWith('trs_')) return 'transaction';
  if (tableId.startsWith('pdt_')) return 'product';
  if (tableId.includes('merchant')) return 'merchant';
  if (tableId.includes('soleprop')) return 'soleprop';
  if (tableId.startsWith('vam_')) return 'marketing';
  if (tableId.includes('cust')) return 'customer';
  return 'common';
}

function getTableLabel(tableId: string): string {
  const labels: Record<string, string> = {
    'igd_d_cust_mas': '통합고객마스터',
    'igd_m_cust_base': '고객기본(월)',
    'igd_m_cust_txn_card': '카드거래(월)',
    'igd_m_cust_txn_bank': '은행거래(월)',
    'igd_m_cust_txn_life': '보험거래(월)',
    'igd_m_cust_txn_sec': '증권거래(월)',
    'cln_d_cust_mas_bank': '은행고객',
    'cln_d_cust_mas_card': '카드고객',
    'cln_d_cust_mas_life': '라이프고객',
    'cln_d_cust_mas_sec': '증권고객',
    'cln_m_cust_base_bank': '은행고객(월)',
    'cln_m_cust_base_card': '카드고객(월)',
    'sol_m_supersol_visit': '슈퍼솔MAU(월)',
    'sol_d_supersol_session': '슈퍼솔세션(일)',
    'jaz_sh_fanclub_membership_chghist': '신한FAN가입이력',
    'shg_membership_cust_hist': '리워드앱이력',
    'trs_m_cust_card_txn_card': '카드결제상세',
    'trs_m_cust_acct_txn_bank': '은행계좌거래',
    'trs_m_cust_acct_txn_sec': '증권계좌거래',
    'trs_m_merchant_delivery': '배달거래',
    'com_m_merchant_franchise': '가맹점',
    'pdt_m_acct_holding_base_bank': '예금계좌',
    'pdt_m_contract_holding_base_life': '보험계약',
    'pdt_m_loan_prod_base_card': '대출상품',
    'igd_m_shg_rfm_base_ledger': 'RFM분석',
    'rpt_d_assetsize_sec': '증권자산',
    'rpt_d_unit_deposit_acct': '단위예금',
    'm_cust_dim': '고객디멘션',
    'vam_cus_mkt_mas_m': '마케팅고객',
  };
  return labels[tableId] || tableId.replace(/^(igd_|cln_|trs_|pdt_|com_|rpt_|jaz_|shg_|sol_)[a-z]_/, '');
}
