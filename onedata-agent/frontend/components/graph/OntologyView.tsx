'use client';

import React, { useMemo } from 'react';
import type { ReasoningStep, ChatMessage } from '@/lib/types';

interface OntologyViewProps {
  context?: ReasoningStep[];
  tablesUsed?: string[];
  allMessages?: ChatMessage[];
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
    label: '통합 고객',
    domain: '통합',
    attrs: ['고객연령', '성별', '거주지역', '고객등급'],
  },
  'igd_m_cust_base': {
    label: '고객 기본',
    domain: '통합',
    attrs: ['연령대', '성별', '총자산', '추정소득'],
  },
  'igd_m_cust_txn_card': {
    label: '카드 이용',
    domain: '카드',
    attrs: ['월이용금액', '월이용건수', '신용판매금액', '체크이용금액'],
  },
  'igd_m_cust_txn_bank': {
    label: '은행 실적',
    domain: '은행',
    attrs: ['월평균수신잔액', '월평균여신잔액', '이체건수'],
  },
  'igd_m_cust_txn_life': {
    label: '보험 실적',
    domain: '보험',
    attrs: ['월납입보험료', '보유계약건수', '보장금액'],
  },
  'igd_m_cust_txn_sec': {
    label: '증권 실적',
    domain: '증권',
    attrs: ['월거래금액', '보유종목수', '투자자산규모'],
  },
  'cln_d_cust_mas_bank': {
    label: '은행 고객',
    domain: '은행',
    attrs: ['주거래점', '고객등급', '수신잔액'],
  },
  'cln_d_cust_mas_card': {
    label: '카드 회원',
    domain: '카드',
    attrs: ['카드종류', '신용한도', '발급일'],
  },
  'cln_d_cust_mas_life': {
    label: '보험 고객',
    domain: '보험',
    attrs: ['보험유형', '가입일', '만기일'],
  },
  'cln_d_cust_mas_sec': {
    label: '증권 고객',
    domain: '증권',
    attrs: ['계좌유형', '투자성향', '자산규모'],
  },
  'cln_m_cust_base_bank': {
    label: '은행 월실적',
    domain: '은행',
    attrs: ['수신평균잔액', '여신평균잔액', '거래빈도'],
  },
  'cln_m_cust_base_card': {
    label: '카드 월실적',
    domain: '카드',
    attrs: ['월이용금액', '이용건수', '연체여부'],
  },
  'sol_m_supersol_visit': {
    label: '슈퍼솔 이용',
    domain: '디지털',
    attrs: ['월방문횟수', '월방문일수', '월체류시간', 'MAU여부'],
  },
  'sol_d_supersol_session': {
    label: '슈퍼솔 세션',
    domain: '디지털',
    attrs: ['접속시각', '체류시간', '진입기능', '기기구분'],
  },
  'jaz_sh_fanclub_membership_chghist': {
    label: '신한FAN 가입',
    domain: '디지털',
    attrs: ['가입채널(계열사)', '앱사용여부'],
  },
  'shg_membership_cust_hist': {
    label: '리워드 멤버십',
    domain: '디지털',
    attrs: ['멤버십등급', '포인트잔액'],
  },
  'trs_m_cust_card_txn_card': {
    label: '카드 결제',
    domain: '카드',
    attrs: ['결제금액', '가맹점', '업종', '할부'],
  },
  'trs_m_cust_acct_txn_bank': {
    label: '은행 이체',
    domain: '은행',
    attrs: ['거래금액', '거래유형', '채널'],
  },
  'trs_m_cust_acct_txn_sec': {
    label: '증권 매매',
    domain: '증권',
    attrs: ['거래금액', '종목명', '매매구분'],
  },
  'trs_m_merchant_delivery': {
    label: '배달 거래',
    domain: '기타',
    attrs: ['주문금액', '배달지역'],
  },
  'com_m_merchant_franchise': {
    label: '가맹점',
    domain: '기타',
    attrs: ['가맹점명', '업종', '지역'],
  },
  'pdt_m_acct_holding_base_bank': {
    label: '예금 계좌',
    domain: '은행',
    attrs: ['잔액', '금리', '만기일'],
  },
  'pdt_m_contract_holding_base_life': {
    label: '보험 계약',
    domain: '보험',
    attrs: ['보험료', '보장내용', '만기일'],
  },
  'pdt_m_loan_prod_base_card': {
    label: '대출 상품',
    domain: '카드',
    attrs: ['대출잔액', '금리', '상환방식'],
  },
  'igd_m_shg_rfm_base_ledger': {
    label: 'RFM 분석',
    domain: '통합',
    attrs: ['R등급', 'F등급', 'M등급', '수신평잔'],
  },
  'rpt_d_assetsize_sec': {
    label: '증권 자산',
    domain: '증권',
    attrs: ['총자산', '주식비중', '채권비중'],
  },
  'rpt_d_unit_deposit_acct': {
    label: '단위 예금',
    domain: '은행',
    attrs: ['계좌잔액', '상품명', '만기일'],
  },
  'm_cust_dim': {
    label: '고객 세그먼트',
    domain: '통합',
    attrs: ['세그먼트', '라이프스테이지', '가치등급'],
  },
  'vam_cus_mkt_mas_m': {
    label: '마케팅 고객',
    domain: '마케팅',
    attrs: ['캠페인반응', '선호채널', '이탈확률'],
  },
};

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
  '그룹사': 'group', '계열사': 'group', '각사': 'group',
};

const DOMAIN_LABEL: Record<string, string> = {
  bank: '신한은행',
  card: '신한카드',
  life: '신한라이프',
  securities: '신한투자증권',
  digital: '디지털',
  customer: '고객',
};

export function OntologyView({ context, tablesUsed, allMessages }: OntologyViewProps) {
  const graphData = useMemo(() => {
    // 현재 + 이전 대화 모든 intent entities 수집
    const allIntentEntities: string[] = [];
    const allTablesUsed = new Set<string>();

    if (allMessages) {
      for (const msg of allMessages) {
        if (msg.role !== 'assistant') continue;
        if (msg.tablesUsed) msg.tablesUsed.forEach(t => allTablesUsed.add(t));
        const intentStep = msg.reasoning?.find(s => s.id === 'intent');
        const ents = intentStep?.data?.entities as string[] | undefined;
        if (ents) allIntentEntities.push(...ents);
      }
    }

    // 현재 메시지도 추가
    const intentEntities = context?.find(s => s.id === 'intent')?.data?.entities as string[] | undefined;
    if (intentEntities) allIntentEntities.push(...intentEntities);
    if (tablesUsed) tablesUsed.forEach(t => allTablesUsed.add(t));

    const hasGroupKeyword = allIntentEntities.some(e =>
      e.includes('각사') || e.includes('그룹사') || e.includes('계열사')
    );

    const combinedTables = Array.from(allTablesUsed);

    if (combinedTables.length > 0) {
      return buildGraphFromTables(combinedTables, hasGroupKeyword);
    }
    const domainHint = context?.find(s => s.id === 'intent')?.data?.domain_hint as string | undefined;
    if (domainHint || allIntentEntities.length > 0) {
      return buildGraphFromHint(domainHint, allIntentEntities);
    }
    return null;
  }, [tablesUsed, context, allMessages]);

  if (!graphData) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <p className="text-xs text-slate">쿼리를 실행하면 데이터 관계를 보여줍니다.</p>
      </div>
    );
  }

  const { centerNodes, attrNodes, width, height } = graphData;

  return (
    <div className="p-2">
      <div className="rounded-lg bg-ink-900 border border-ink-700 overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          style={{ height: Math.min(380, height) }}
        >
          {/* Edges from center to attr */}
          {attrNodes.map((attr, i) => (
            <line
              key={`e-${i}`}
              x1={attr.parentX} y1={attr.parentY}
              x2={attr.x} y2={attr.y}
              stroke={attr.color} strokeWidth="1" opacity="0.3"
            />
          ))}

          {/* Attr nodes (small circles with label) */}
          {attrNodes.map((attr, i) => (
            <g key={`a-${i}`}>
              <circle cx={attr.x} cy={attr.y} r="3" fill={attr.color} opacity="0.7" />
              <text
                x={attr.x + (attr.x > attr.parentX ? 6 : -6)}
                y={attr.y + 3}
                textAnchor={attr.x > attr.parentX ? 'start' : 'end'}
                fill="#a0b4c0"
                fontSize="8"
                fontFamily="system-ui"
              >
                {attr.label}
              </text>
            </g>
          ))}

          {/* Center entity nodes */}
          {centerNodes.map((node, i) => {
            const labelW = node.label.length * 8 + 20;
            return (
              <g key={`c-${i}`}>
                <rect
                  x={node.x - labelW / 2}
                  y={node.y - 12}
                  width={labelW}
                  height={24}
                  rx="12"
                  fill="#0c1a28"
                  stroke={node.color}
                  strokeWidth="1.5"
                />
                <text
                  x={node.x}
                  y={node.y + 4}
                  textAnchor="middle"
                  fill={node.color}
                  fontSize="10"
                  fontWeight="600"
                  fontFamily="system-ui"
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

interface CenterNode {
  label: string;
  color: string;
  x: number;
  y: number;
}

interface AttrNode {
  label: string;
  color: string;
  x: number;
  y: number;
  parentX: number;
  parentY: number;
}

interface GraphData {
  centerNodes: CenterNode[];
  attrNodes: AttrNode[];
  width: number;
  height: number;
}

const GROUP_ENTITIES: EntityDef[] = [
  { label: '신한은행', domain: '은행', attrs: ['수신평균잔액', '여신잔액', '이체건수'] },
  { label: '신한카드', domain: '카드', attrs: ['월이용금액', '월이용건수', '신용한도'] },
  { label: '신한투자증권', domain: '증권', attrs: ['월거래금액', '투자자산', '보유종목수'] },
  { label: '신한라이프', domain: '보험', attrs: ['월보험료', '보유계약건수', '보장금액'] },
];

function buildGraphFromTables(tablesUsed: string[], hasGroupKeyword?: boolean): GraphData {
  const entities = tablesUsed
    .map((tid) => ENTITY_MAP[tid])
    .filter(Boolean) as EntityDef[];

  if (hasGroupKeyword) {
    // 그룹사 키워드가 있으면 4개 계열사 엔티티를 추가 (중복 제거)
    const existingLabels = new Set(entities.map(e => e.label));
    for (const ge of GROUP_ENTITIES) {
      if (!existingLabels.has(ge.label)) {
        entities.push(ge);
      }
    }
  }

  return layoutGraph(entities);
}

function buildGraphFromHint(domainHint?: string, intentEntities?: string[]): GraphData | null {
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

  // "그룹사" → 은행+카드+증권+보험 전부
  if (domains.has('group')) {
    domains.delete('group');
    domains.add('bank');
    domains.add('card');
    domains.add('life');
    domains.add('securities');
  }

  if (domains.size === 0) return null;

  const tableIds: string[] = [];
  for (const domain of domains) {
    const tables = DOMAIN_TABLE_MAP[domain] || [];
    tableIds.push(...tables.slice(0, 2));
  }

  const entities = tableIds.map((tid) => ENTITY_MAP[tid]).filter(Boolean) as EntityDef[];
  if (entities.length === 0) return null;
  return layoutGraph(entities);
}

function layoutGraph(entities: EntityDef[]): GraphData {
  const centerNodes: CenterNode[] = [];
  const attrNodes: AttrNode[] = [];

  const width = 420;
  const count = entities.length;
  const verticalGap = Math.min(80, 320 / Math.max(count, 1));
  const height = Math.max(count * verticalGap + 60, 180);

  entities.forEach((entity, i) => {
    const color = DOMAIN_COLORS[entity.domain] || DOMAIN_COLORS['기타'];
    const cx = width / 2;
    const cy = 35 + i * verticalGap;

    centerNodes.push({ label: entity.label, color, x: cx, y: cy });

    const attrCount = entity.attrs.length;
    const spread = Math.min(140, width * 0.35);
    const startAngle = -60;
    const endAngle = 60;
    const angleStep = attrCount > 1 ? (endAngle - startAngle) / (attrCount - 1) : 0;

    // Alternate sides for variety
    const side = i % 2 === 0 ? 1 : -1;

    entity.attrs.forEach((attr, j) => {
      const angle = attrCount > 1
        ? (startAngle + j * angleStep) * (Math.PI / 180)
        : 0;
      const radius = spread * 0.6 + (j % 2) * 20;
      const ax = cx + side * (radius * Math.cos(angle) + 60);
      const ay = cy + radius * Math.sin(angle) * 0.5;

      attrNodes.push({
        label: attr,
        color,
        x: Math.max(40, Math.min(width - 40, ax)),
        y: Math.max(10, Math.min(height - 10, ay)),
        parentX: cx,
        parentY: cy,
      });
    });
  });

  return { centerNodes, attrNodes, width, height };
}
