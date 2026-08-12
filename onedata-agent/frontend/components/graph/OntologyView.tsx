'use client';

import React, { useMemo } from 'react';
import type { ReasoningStep } from '@/lib/types';

interface OntologyViewProps {
  context?: ReasoningStep[];
  tablesUsed?: string[];
}

const DOMAIN_COLORS: Record<string, string> = {
  통합: '#38c7e0',
  은행: '#60a5fa',
  카드: '#f97316',
  보험: '#10b981',
  증권: '#8b5cf6',
  디지털: '#22d3ee',
  마케팅: '#f472b6',
  기타: '#6b7280',
};

interface EntityDef {
  label: string;
  domain: string;
  attrs: string[];
}

const ENTITY_MAP: Record<string, EntityDef> = {
  'igd_d_cust_mas': {
    label: '통합 고객 마스터',
    domain: '통합',
    attrs: ['고객연령', '성별', '거주지역', '고객등급', '최초거래일'],
  },
  'igd_m_cust_base': {
    label: '통합 고객 기본 (월)',
    domain: '통합',
    attrs: ['연령대', '성별', '총자산', '추정소득', '보유상품수'],
  },
  'igd_m_cust_txn_card': {
    label: '카드 이용 실적 (월)',
    domain: '카드',
    attrs: ['월이용금액', '월이용건수', '신용판매금액', '체크이용금액', '업종별이용'],
  },
  'igd_m_cust_txn_bank': {
    label: '은행 거래 실적 (월)',
    domain: '은행',
    attrs: ['월평균수신잔액', '월평균여신잔액', '이체건수', '예금잔액'],
  },
  'igd_m_cust_txn_life': {
    label: '보험 거래 실적 (월)',
    domain: '보험',
    attrs: ['월납입보험료', '보유계약건수', '보험유형', '보장금액'],
  },
  'igd_m_cust_txn_sec': {
    label: '증권 거래 실적 (월)',
    domain: '증권',
    attrs: ['월거래금액', '보유종목수', '투자자산규모', '매매회전율'],
  },
  'cln_d_cust_mas_bank': {
    label: '은행 고객',
    domain: '은행',
    attrs: ['최초거래일', '주거래점', '고객등급', '수신잔액'],
  },
  'cln_d_cust_mas_card': {
    label: '카드 회원',
    domain: '카드',
    attrs: ['카드종류', '발급일', '신용한도', '연회비', '지역'],
  },
  'cln_d_cust_mas_life': {
    label: '보험 고객',
    domain: '보험',
    attrs: ['보험유형', '가입일', '만기일', '납입상태'],
  },
  'cln_d_cust_mas_sec': {
    label: '증권 고객',
    domain: '증권',
    attrs: ['계좌유형', '개설일', '투자성향', '자산규모'],
  },
  'cln_m_cust_base_bank': {
    label: '은행 고객 실적 (월)',
    domain: '은행',
    attrs: ['수신평균잔액', '여신평균잔액', '거래빈도', '지역', '이체금액'],
  },
  'cln_m_cust_base_card': {
    label: '카드 회원 실적 (월)',
    domain: '카드',
    attrs: ['월이용금액', '이용건수', '지역', '연체여부', '리볼빙잔액'],
  },
  'sol_m_supersol_visit': {
    label: '슈퍼솔 앱 이용 (월)',
    domain: '디지털',
    attrs: ['월방문횟수', '월방문일수', '월체류시간', '주이용기능', 'MAU여부'],
  },
  'sol_d_supersol_session': {
    label: '슈퍼솔 세션 (일)',
    domain: '디지털',
    attrs: ['접속시각', '체류시간', '진입기능', '기기구분', '유입경로'],
  },
  'jaz_sh_fanclub_membership_chghist': {
    label: '신한FAN 가입 이력',
    domain: '디지털',
    attrs: ['가입채널(계열사)', '앱사용여부', '변경일자'],
  },
  'shg_membership_cust_hist': {
    label: '리워드 멤버십',
    domain: '디지털',
    attrs: ['멤버십등급', '포인트잔액', '가입일'],
  },
  'trs_m_cust_card_txn_card': {
    label: '카드 결제 상세',
    domain: '카드',
    attrs: ['결제금액', '가맹점', '업종', '할부개월', '해외여부'],
  },
  'trs_m_cust_acct_txn_bank': {
    label: '은행 계좌 거래',
    domain: '은행',
    attrs: ['거래금액', '거래유형', '상대방', '채널'],
  },
  'trs_m_cust_acct_txn_sec': {
    label: '증권 매매 거래',
    domain: '증권',
    attrs: ['거래금액', '종목명', '매매구분', '수수료'],
  },
  'trs_m_merchant_delivery': {
    label: '배달 거래',
    domain: '기타',
    attrs: ['주문금액', '배달지역', '음식업종'],
  },
  'com_m_merchant_franchise': {
    label: '가맹점 정보',
    domain: '기타',
    attrs: ['가맹점명', '업종', '지역', '매출규모'],
  },
  'pdt_m_acct_holding_base_bank': {
    label: '예금 계좌',
    domain: '은행',
    attrs: ['잔액', '상품유형', '금리', '만기일'],
  },
  'pdt_m_contract_holding_base_life': {
    label: '보험 계약',
    domain: '보험',
    attrs: ['보험료', '보장내용', '만기일', '납입기간'],
  },
  'pdt_m_loan_prod_base_card': {
    label: '대출 상품',
    domain: '카드',
    attrs: ['대출잔액', '금리', '상환방식', '한도'],
  },
  'igd_m_shg_rfm_base_ledger': {
    label: 'RFM 분석',
    domain: '통합',
    attrs: ['R등급', 'F등급', 'M등급', '은행수신평잔', '카드이용금액'],
  },
  'rpt_d_assetsize_sec': {
    label: '증권 자산',
    domain: '증권',
    attrs: ['총자산', '주식비중', '채권비중', '펀드비중'],
  },
  'rpt_d_unit_deposit_acct': {
    label: '단위 예금',
    domain: '은행',
    attrs: ['계좌잔액', '상품명', '만기일', '금리'],
  },
  'm_cust_dim': {
    label: '고객 세그먼트',
    domain: '통합',
    attrs: ['세그먼트', '라이프스테이지', '가치등급'],
  },
  'vam_cus_mkt_mas_m': {
    label: '마케팅 고객',
    domain: '마케팅',
    attrs: ['캠페인반응', '선호채널', '이탈확률', '타겟여부'],
  },
};

export function OntologyView({ context, tablesUsed }: OntologyViewProps) {
  const entities = useMemo(() => {
    if (tablesUsed && tablesUsed.length > 0) {
      return tablesUsed
        .map((tid) => ENTITY_MAP[tid])
        .filter(Boolean) as EntityDef[];
    }
    // tablesUsed 없으면 context에서 도메인 힌트로 관련 엔티티 표시
    const domainHint = context?.find(s => s.id === 'intent')?.data?.domain_hint as string | undefined;
    const intentEntities = context?.find(s => s.id === 'intent')?.data?.entities as string[] | undefined;
    if (domainHint || intentEntities) {
      return inferEntities(domainHint, intentEntities);
    }
    return null;
  }, [tablesUsed, context]);

  if (!entities || entities.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <p className="text-xs text-slate">쿼리를 실행하면 사용된 데이터 엔티티를 보여줍니다.</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-1.5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[11px] font-medium text-pearl">사용된 데이터</h3>
        <span className="text-[10px] text-mist">
          {entities.length}개 엔티티
        </span>
      </div>

      {entities.map((entity, i) => {
        const color = DOMAIN_COLORS[entity.domain] || DOMAIN_COLORS['기타'];
        return (
          <div
            key={i}
            className="rounded-lg border overflow-hidden"
            style={{ borderColor: `${color}30` }}
          >
            <div className="flex items-center gap-2 px-2.5 py-1.5" style={{ background: `${color}08` }}>
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
              <span className="text-[11px] font-medium text-pearl">{entity.label}</span>
              <span className="text-[9px] ml-auto" style={{ color }}>{entity.domain}</span>
            </div>
            <div className="px-2.5 py-1.5 flex flex-wrap gap-1">
              {entity.attrs.map((attr, j) => (
                <span
                  key={j}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-ink-800 text-mist/80 border border-ink-700"
                >
                  {attr}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const DOMAIN_TABLE_MAP: Record<string, string[]> = {
  bank: ['cln_d_cust_mas_bank', 'cln_m_cust_base_bank', 'igd_m_cust_txn_bank', 'trs_m_cust_acct_txn_bank', 'pdt_m_acct_holding_base_bank'],
  card: ['cln_d_cust_mas_card', 'cln_m_cust_base_card', 'igd_m_cust_txn_card', 'trs_m_cust_card_txn_card', 'pdt_m_loan_prod_base_card'],
  life: ['cln_d_cust_mas_life', 'igd_m_cust_txn_life', 'pdt_m_contract_holding_base_life'],
  securities: ['cln_d_cust_mas_sec', 'igd_m_cust_txn_sec', 'trs_m_cust_acct_txn_sec', 'rpt_d_assetsize_sec'],
  digital: ['sol_m_supersol_visit', 'sol_d_supersol_session', 'jaz_sh_fanclub_membership_chghist'],
  customer: ['igd_d_cust_mas', 'igd_m_cust_base', 'm_cust_dim'],
};

const KEYWORD_DOMAIN: Record<string, string> = {
  '은행': 'bank', '수신': 'bank', '예금': 'bank', '여신': 'bank', '대출': 'bank',
  '카드': 'card', '이용금액': 'card', '결제': 'card', '신용': 'card',
  '보험': 'life', '생명': 'life', '계약': 'life',
  '증권': 'securities', '투자': 'securities', '주식': 'securities', '자산': 'securities',
  '슈퍼솔': 'digital', '앱': 'digital', 'MAU': 'digital', '방문': 'digital',
  '고객': 'customer', '연령': 'customer', '성별': 'customer',
};

function inferEntities(domainHint?: string, intentEntities?: string[]): EntityDef[] | null {
  const domains = new Set<string>();

  if (domainHint) {
    const mapped = domainHint === 'transaction' ? 'card' : domainHint === 'product' ? 'bank' : domainHint;
    if (DOMAIN_TABLE_MAP[mapped]) domains.add(mapped);
  }

  if (intentEntities) {
    for (const ent of intentEntities) {
      for (const [keyword, domain] of Object.entries(KEYWORD_DOMAIN)) {
        if (ent.includes(keyword)) {
          domains.add(domain);
        }
      }
    }
  }

  if (domains.size === 0) domains.add('customer');

  const tableIds: string[] = [];
  for (const domain of domains) {
    const tables = DOMAIN_TABLE_MAP[domain] || [];
    tableIds.push(...tables.slice(0, 3));
  }

  const results = tableIds.map((tid) => ENTITY_MAP[tid]).filter(Boolean) as EntityDef[];
  return results.length > 0 ? results : null;
}
