'use client';

import React, { useMemo } from 'react';
import type { ReasoningStep } from '@/lib/types';

interface OntologyViewProps {
  context?: ReasoningStep[];
  tablesUsed?: string[];
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

const TABLE_META: Record<string, { label: string; attrs: string[] }> = {
  'igd_d_cust_mas': {
    label: '통합고객마스터',
    attrs: ['고객연령', '성별', '거주지역', '고객등급'],
  },
  'igd_m_cust_base': {
    label: '고객기본(월)',
    attrs: ['연령5년구간', '성별', '총자산', '소득추정'],
  },
  'igd_m_cust_txn_card': {
    label: '카드거래(월)',
    attrs: ['월이용금액', '월이용건수', '업종분류', '결제수단'],
  },
  'igd_m_cust_txn_bank': {
    label: '은행거래(월)',
    attrs: ['월평균수신잔액', '월평균여신잔액', '거래건수'],
  },
  'igd_m_cust_txn_life': {
    label: '보험거래(월)',
    attrs: ['월보험료', '계약건수', '보험유형'],
  },
  'igd_m_cust_txn_sec': {
    label: '증권거래(월)',
    attrs: ['월거래금액', '보유종목수', '자산규모'],
  },
  'cln_d_cust_mas_bank': {
    label: '은행고객',
    attrs: ['최초거래일', '주거래점', '고객등급'],
  },
  'cln_d_cust_mas_card': {
    label: '카드고객',
    attrs: ['카드종류', '발급일', '한도', '지역코드'],
  },
  'cln_d_cust_mas_life': {
    label: '라이프고객',
    attrs: ['보험유형', '가입일', '만기일'],
  },
  'cln_d_cust_mas_sec': {
    label: '증권고객',
    attrs: ['계좌유형', '개설일', '투자성향'],
  },
  'cln_m_cust_base_bank': {
    label: '은행고객(월)',
    attrs: ['수신평잔', '여신평잔', '거래빈도', '지역'],
  },
  'cln_m_cust_base_card': {
    label: '카드고객(월)',
    attrs: ['월이용금액', '이용건수', '지역코드', '연체여부'],
  },
  'sol_m_supersol_visit': {
    label: '슈퍼솔MAU(월)',
    attrs: ['월방문횟수', '월방문일수', '월체류시간', '주이용기능'],
  },
  'sol_d_supersol_session': {
    label: '슈퍼솔세션(일)',
    attrs: ['접속시각', '체류분', '진입기능', '기기구분'],
  },
  'jaz_sh_fanclub_membership_chghist': {
    label: '신한FAN가입이력',
    attrs: ['가입채널(계열사)', '앱사용여부', '처리일자'],
  },
  'shg_membership_cust_hist': {
    label: '리워드앱이력',
    attrs: ['멤버십등급', '포인트잔액', '가입일'],
  },
  'trs_m_cust_card_txn_card': {
    label: '카드결제상세',
    attrs: ['결제금액', '가맹점', '업종', '할부개월'],
  },
  'trs_m_cust_acct_txn_bank': {
    label: '은행계좌거래',
    attrs: ['거래금액', '거래유형', '상대방', '채널'],
  },
  'trs_m_cust_acct_txn_sec': {
    label: '증권계좌거래',
    attrs: ['거래금액', '종목', '매매구분'],
  },
  'trs_m_merchant_delivery': {
    label: '배달거래',
    attrs: ['주문금액', '배달지역', '업종'],
  },
  'com_m_merchant_franchise': {
    label: '가맹점',
    attrs: ['가맹점명', '업종', '지역', '매출규모'],
  },
  'pdt_m_acct_holding_base_bank': {
    label: '예금계좌',
    attrs: ['잔액', '상품유형', '금리', '만기일'],
  },
  'pdt_m_contract_holding_base_life': {
    label: '보험계약',
    attrs: ['보험료', '보장내용', '만기일'],
  },
  'pdt_m_loan_prod_base_card': {
    label: '대출상품',
    attrs: ['대출잔액', '금리', '상환방식'],
  },
  'igd_m_shg_rfm_base_ledger': {
    label: 'RFM분석',
    attrs: ['R등급', 'F등급', 'M등급', '은행수신평잔'],
  },
  'rpt_d_assetsize_sec': {
    label: '증권자산',
    attrs: ['총자산', '주식비중', '채권비중'],
  },
  'rpt_d_unit_deposit_acct': {
    label: '단위예금',
    attrs: ['계좌잔액', '상품명', '만기일'],
  },
  'm_cust_dim': {
    label: '고객디멘션',
    attrs: ['세그먼트', '라이프스테이지', '가치등급'],
  },
  'vam_cus_mkt_mas_m': {
    label: '마케팅고객',
    attrs: ['캠페인반응', '선호채널', '이탈확률'],
  },
};

const JOIN_RULES: Record<string, Record<string, string>> = {
  'igd_d_cust_mas': { _default: '같은 고객' },
  'igd_m_cust_base': { _default: '같은 고객 · 같은 월' },
  'igd_m_cust_txn_card': { _default: '같은 고객 · 같은 월' },
  'igd_m_cust_txn_bank': { _default: '같은 고객 · 같은 월' },
  'igd_m_cust_txn_life': { _default: '같은 고객 · 같은 월' },
  'igd_m_cust_txn_sec': { _default: '같은 고객 · 같은 월' },
  'cln_d_cust_mas_bank': { _default: '같은 고객' },
  'cln_d_cust_mas_card': { _default: '같은 고객' },
  'cln_d_cust_mas_life': { _default: '같은 고객' },
  'cln_d_cust_mas_sec': { _default: '같은 고객' },
  'cln_m_cust_base_bank': { _default: '같은 고객 · 같은 월' },
  'cln_m_cust_base_card': { _default: '같은 고객 · 같은 월' },
  'sol_m_supersol_visit': { _default: '같은 고객 · 같은 월', 'jaz_sh_fanclub_membership_chghist': '같은 고객' },
  'sol_d_supersol_session': { _default: '같은 고객 · 같은 일', 'sol_m_supersol_visit': '같은 고객 (일→월)' },
  'jaz_sh_fanclub_membership_chghist': { _default: '같은 고객', 'sol_m_supersol_visit': '같은 고객' },
  'shg_membership_cust_hist': { _default: '같은 고객' },
  'trs_m_cust_card_txn_card': { _default: '같은 고객 · 같은 월' },
  'trs_m_cust_acct_txn_bank': { _default: '같은 고객 · 같은 월' },
  'trs_m_cust_acct_txn_sec': { _default: '같은 고객 · 같은 월' },
  'trs_m_merchant_delivery': { _default: '같은 가맹점' },
  'com_m_merchant_franchise': { _default: '같은 가맹점' },
  'pdt_m_acct_holding_base_bank': { _default: '같은 고객 · 같은 월' },
  'pdt_m_contract_holding_base_life': { _default: '같은 고객 · 같은 월' },
  'pdt_m_loan_prod_base_card': { _default: '같은 고객' },
  'igd_m_shg_rfm_base_ledger': { _default: '같은 고객 · 같은 월' },
  'rpt_d_assetsize_sec': { _default: '같은 고객' },
  'rpt_d_unit_deposit_acct': { _default: '같은 고객' },
  'vam_cus_mkt_mas_m': { _default: '같은 고객' },
  'm_cust_dim': { _default: '같은 고객' },
};

export function OntologyView({ context, tablesUsed }: OntologyViewProps) {
  const viewData = useMemo(() => {
    if (tablesUsed && tablesUsed.length > 0) {
      return buildEntityView(tablesUsed);
    }
    return null;
  }, [tablesUsed]);

  if (!viewData) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <p className="text-xs text-slate">쿼리를 실행하면 사용된 엔티티와 속성을 보여줍니다.</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-medium text-pearl">데이터 엔티티</h3>
        <span className="text-[10px] text-mist bg-ink-700 px-1.5 py-0.5 rounded border border-ink-600">
          {viewData.tables.length}개 테이블
        </span>
      </div>

      {/* Entity cards with attributes */}
      <div className="space-y-1.5">
        {viewData.tables.map((table) => (
          <div
            key={table.id}
            className="rounded-lg border overflow-hidden"
            style={{ borderColor: `${table.color}40` }}
          >
            {/* Table header */}
            <div
              className="flex items-center gap-2 px-2.5 py-1.5"
              style={{ background: `${table.color}0a` }}
            >
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: table.color }}
              />
              <span className="text-[11px] font-medium" style={{ color: table.color }}>
                {table.label}
              </span>
            </div>
            {/* Attributes */}
            <div className="px-2.5 py-1.5 flex flex-wrap gap-1">
              {table.attrs.map((attr, i) => (
                <span
                  key={i}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-ink-800 text-mist border border-ink-600"
                >
                  {attr}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Join relationships */}
      {viewData.joins.length > 0 && (
        <div className="pt-1.5 border-t border-ink-700">
          <p className="text-[10px] text-slate mb-1.5">연결 관계</p>
          <div className="space-y-1">
            {viewData.joins.map((join, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px]">
                <span className="text-mist font-medium">{join.fromLabel}</span>
                <span className="text-aqua">—</span>
                <span className="text-aqua bg-ink-800 px-1.5 py-0.5 rounded border border-ink-700">
                  {join.relation}
                </span>
                <span className="text-aqua">→</span>
                <span className="text-mist font-medium">{join.toLabel}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface TableView {
  id: string;
  label: string;
  color: string;
  attrs: string[];
}

interface JoinView {
  fromLabel: string;
  toLabel: string;
  relation: string;
}

function buildEntityView(tablesUsed: string[]): { tables: TableView[]; joins: JoinView[] } {
  const tables: TableView[] = tablesUsed.map((tid) => {
    const meta = TABLE_META[tid];
    return {
      id: tid,
      label: meta?.label || tid,
      color: DOMAIN_COLORS[getDomain(tid)],
      attrs: meta?.attrs || [],
    };
  });

  const joins: JoinView[] = [];
  for (let i = 0; i < tablesUsed.length; i++) {
    for (let j = i + 1; j < tablesUsed.length; j++) {
      const rel = getJoinKey(tablesUsed[i], tablesUsed[j]);
      if (rel) {
        const labelA = TABLE_META[tablesUsed[i]]?.label || tablesUsed[i];
        const labelB = TABLE_META[tablesUsed[j]]?.label || tablesUsed[j];
        joins.push({ fromLabel: labelA, toLabel: labelB, relation: rel });
      }
    }
  }

  return { tables, joins };
}

function getJoinKey(tableA: string, tableB: string): string | null {
  const rulesA = JOIN_RULES[tableA];
  const rulesB = JOIN_RULES[tableB];

  if (rulesA?.[tableB]) return rulesA[tableB];
  if (rulesB?.[tableA]) return rulesB[tableA];

  const keyA = rulesA?._default;
  const keyB = rulesB?._default;

  if (!keyA || !keyB) return null;

  if (keyA.includes('고객') && keyB.includes('고객')) {
    if (keyA.includes('월') && keyB.includes('월')) return '같은 고객 · 같은 월';
    if (keyA.includes('일') && keyB.includes('일')) return '같은 고객 · 같은 일';
    return '같은 고객';
  }
  if (keyA.includes('가맹점') && keyB.includes('가맹점')) {
    return '같은 가맹점';
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
