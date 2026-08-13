'use client';

import React, { useMemo } from 'react';
import type { ReasoningStep, ChatMessage } from '@/lib/types';

interface OntologyViewProps {
  context?: ReasoningStep[];
  tablesUsed?: string[];
  allMessages?: ChatMessage[];
}

const DOMAIN_COLORS: Record<string, string> = {
  통합: '#0064FF',
  은행: '#3b82f6',
  카드: '#f59e0b',
  보험: '#10b981',
  증권: '#8b5cf6',
  앱: '#06b6d4',
  마케팅: '#ec4899',
  기타: '#6b7280',
};

interface TableMeta {
  domain: string;
  attrs: string[];
}

const TABLE_DOMAIN_MAP: Record<string, TableMeta> = {
  'igd_d_cust_mas': { domain: '통합', attrs: ['고객연령', '성별', '거주지역', '고객등급'] },
  'igd_m_cust_base': { domain: '통합', attrs: ['연령대', '성별', '총자산', '추정소득'] },
  'igd_m_cust_txn_card': { domain: '카드', attrs: ['월이용금액', '월이용건수', '신용판매금액', '체크이용금액'] },
  'igd_m_cust_txn_bank': { domain: '은행', attrs: ['월평균수신잔액', '월평균여신잔액', '이체건수'] },
  'igd_m_cust_txn_life': { domain: '보험', attrs: ['월납입보험료', '보유계약건수', '보장금액'] },
  'igd_m_cust_txn_sec': { domain: '증권', attrs: ['월거래금액', '보유종목수', '투자자산규모'] },
  'cln_d_cust_mas_bank': { domain: '은행', attrs: ['주거래점', '고객등급', '수신잔액'] },
  'cln_d_cust_mas_card': { domain: '카드', attrs: ['카드종류', '신용한도', '발급일'] },
  'cln_d_cust_mas_life': { domain: '보험', attrs: ['보험유형', '가입일', '만기일'] },
  'cln_d_cust_mas_sec': { domain: '증권', attrs: ['계좌유형', '투자성향', '자산규모'] },
  'cln_m_cust_base_bank': { domain: '은행', attrs: ['수신평균잔액', '여신평균잔액', '거래빈도'] },
  'cln_m_cust_base_card': { domain: '카드', attrs: ['월이용금액', '이용건수', '연체여부'] },
  'sol_m_supersol_visit': { domain: '앱', attrs: ['월방문횟수', '월방문일수', '월체류시간', 'MAU여부'] },
  'sol_d_supersol_session': { domain: '앱', attrs: ['접속시각', '체류시간', '기기구분'] },
  'shg_membership_cust_hist': { domain: '앱', attrs: ['멤버십등급', '포인트잔액'] },
  'trs_m_cust_card_txn_card': { domain: '카드', attrs: ['결제금액', '가맹점', '업종', '할부'] },
  'trs_m_cust_acct_txn_bank': { domain: '은행', attrs: ['거래금액', '거래유형', '채널'] },
  'trs_m_cust_acct_txn_sec': { domain: '증권', attrs: ['거래금액', '종목명', '매매구분'] },
  'pdt_m_acct_holding_base_bank': { domain: '은행', attrs: ['잔액', '금리', '만기일'] },
  'pdt_m_contract_holding_base_life': { domain: '보험', attrs: ['보험료', '보장내용', '만기일'] },
  'pdt_m_loan_prod_base_card': { domain: '카드', attrs: ['대출잔액', '금리', '상환방식'] },
  'igd_m_shg_rfm_base_ledger': { domain: '통합', attrs: ['R등급', 'F등급', 'M등급', '수신평잔'] },
  'rpt_d_assetsize_sec': { domain: '증권', attrs: ['총자산', '주식비중', '채권비중'] },
  'rpt_d_unit_deposit_acct': { domain: '은행', attrs: ['계좌잔액', '상품명'] },
  'm_cust_dim': { domain: '통합', attrs: ['세그먼트', '라이프스테이지', '가치등급'] },
  'vam_cus_mkt_mas_m': { domain: '마케팅', attrs: ['캠페인반응', '선호채널', '이탈확률'] },
  'jaz_sh_fanclub_membership_chghist': { domain: '앱', attrs: ['가입채널'] },
};

const DOMAIN_TABLE_MAP: Record<string, string[]> = {
  bank: ['cln_d_cust_mas_bank', 'cln_m_cust_base_bank', 'igd_m_cust_txn_bank'],
  card: ['cln_d_cust_mas_card', 'cln_m_cust_base_card', 'igd_m_cust_txn_card'],
  life: ['cln_d_cust_mas_life', 'igd_m_cust_txn_life'],
  securities: ['cln_d_cust_mas_sec', 'igd_m_cust_txn_sec'],
  digital: ['sol_m_supersol_visit', 'sol_d_supersol_session'],
  customer: ['igd_d_cust_mas', 'igd_m_cust_base', 'm_cust_dim'],
};

const KEYWORD_DOMAIN: Record<string, string> = {
  '은행': 'bank', '수신': 'bank', '예금': 'bank', '여신': 'bank', '대출': 'bank', '평잔': 'bank',
  '카드': 'card', '이용금액': 'card', '결제': 'card', '신용': 'card', '월사용': 'card',
  '보험': 'life', '생명': 'life', '계약': 'life',
  '증권': 'securities', '투자': 'securities', '주식': 'securities', '자산': 'securities',
  '슈퍼솔': 'digital', '앱': 'digital', 'MAU': 'digital', '방문': 'digital',
  '고객': 'customer', '연령': 'customer', '성별': 'customer', '나이': 'customer',
  '그룹사': 'group', '계열사': 'group', '각사': 'group',
};

const DOMAIN_LABELS: Record<string, string> = {
  '통합': '그룹 고객',
  '은행': '신한은행',
  '카드': '신한카드',
  '보험': '신한라이프',
  '증권': '신한투자증권',
  '앱': '슈퍼솔(앱)',
  '마케팅': '마케팅',
  '기타': '기타',
};

const ATTR_KEYWORDS: Record<string, string[]> = {
  '평잔': ['수신평균잔액', '월평균수신잔액', '여신평균잔액', '수신잔액', '잔액', '수신평잔'],
  '수신': ['수신평균잔액', '월평균수신잔액', '수신잔액', '수신평잔'],
  '이용금액': ['월이용금액', '신용판매금액', '체크이용금액'],
  '월사용': ['월이용금액'],
  '결제': ['결제금액'],
  'MAU': ['MAU여부', '월방문횟수', '월방문일수'],
  '방문': ['월방문횟수', '월방문일수', '월체류시간'],
  '연령': ['연령대', '고객연령'],
  '나이': ['연령대', '고객연령'],
  '성별': ['성별'],
  '투자': ['투자자산규모', '투자자산'],
  '보험료': ['월납입보험료', '보험료'],
  '거래': ['거래금액', '월거래금액', '거래빈도'],
  '건수': ['월이용건수', '보유계약건수', '이체건수', '이용건수'],
  '동향': ['MAU여부', '월방문횟수', '월방문일수'],
  '추이': ['MAU여부', '월방문횟수', '월방문일수'],
};

// Extra attributes that should be injected when a keyword appears in query
const KEYWORD_EXTRA_ATTRS: Record<string, { domain: string; attrs: string[] }> = {
  '연령': { domain: '통합', attrs: ['연령대', '고객연령'] },
  '나이': { domain: '통합', attrs: ['연령대', '고객연령'] },
  '성별': { domain: '통합', attrs: ['성별'] },
  'MAU': { domain: '앱', attrs: ['MAU여부', '월방문횟수', '월방문일수'] },
  '슈퍼솔': { domain: '앱', attrs: ['월방문횟수', '월방문일수', '월체류시간', 'MAU여부'] },
  '동향': { domain: '앱', attrs: ['MAU여부', '월방문횟수'] },
  '추이': { domain: '앱', attrs: ['MAU여부', '월방문횟수'] },
};

interface DomainNode {
  domain: string;
  label: string;
  color: string;
  attrs: string[];
  x: number;
  y: number;
}

interface AttrDot {
  label: string;
  color: string;
  x: number;
  y: number;
  parentX: number;
  parentY: number;
  highlighted: boolean;
}

interface Edge {
  x1: number; y1: number;
  x2: number; y2: number;
  color: string;
  dashed?: boolean;
  label?: string;
}

interface GraphData {
  rootNode: { x: number; y: number } | null;
  domainNodes: DomainNode[];
  attrDots: AttrDot[];
  edges: Edge[];
  crossEdges: Edge[];
  width: number;
  height: number;
}

export function OntologyView({ context, tablesUsed, allMessages }: OntologyViewProps) {
  const graphData = useMemo(() => {
    const allIntentEntities: string[] = [];
    const allTablesUsed = new Set<string>();
    const allUserQueries: string[] = [];

    if (allMessages) {
      for (const msg of allMessages) {
        if (msg.role === 'user') allUserQueries.push(msg.content);
        if (msg.role !== 'assistant') continue;
        if (msg.tablesUsed) msg.tablesUsed.forEach(t => allTablesUsed.add(t));
        const intentStep = msg.reasoning?.find(s => s.id === 'intent');
        const ents = intentStep?.data?.entities as string[] | undefined;
        if (ents) allIntentEntities.push(...ents);
      }
    }

    const intentEntities = context?.find(s => s.id === 'intent')?.data?.entities as string[] | undefined;
    if (intentEntities) allIntentEntities.push(...intentEntities);
    if (tablesUsed) tablesUsed.forEach(t => allTablesUsed.add(t));

    // Use ALL user queries for keyword detection (not just entities)
    const combinedQueryText = allUserQueries.join(' ');

    const hasGroupKeyword = combinedQueryText.includes('각사') ||
      combinedQueryText.includes('그룹사') || combinedQueryText.includes('계열사') ||
      allIntentEntities.some(e => e.includes('각사') || e.includes('그룹사') || e.includes('계열사'));

    // Collect tables
    let tableIds = Array.from(allTablesUsed);

    // Also detect domains from ALL user query text (not just intent entities)
    const keywordDomains = new Set<string>();
    for (const [kw, dom] of Object.entries(KEYWORD_DOMAIN)) {
      if (combinedQueryText.includes(kw)) keywordDomains.add(dom);
    }

    if (tableIds.length === 0) {
      const domainHint = context?.find(s => s.id === 'intent')?.data?.domain_hint as string | undefined;
      const domains = new Set<string>(keywordDomains);
      if (domainHint) {
        const mapped = domainHint === 'transaction' ? 'card' : domainHint === 'product' ? 'bank' : domainHint;
        if (DOMAIN_TABLE_MAP[mapped]) domains.add(mapped);
      }
      for (const ent of allIntentEntities) {
        for (const [kw, dom] of Object.entries(KEYWORD_DOMAIN)) {
          if (ent.includes(kw)) domains.add(dom);
        }
      }
      if (domains.has('group')) {
        domains.delete('group');
        ['bank', 'card', 'life', 'securities'].forEach(d => domains.add(d));
      }
      for (const d of domains) {
        const tables = DOMAIN_TABLE_MAP[d] || [];
        tableIds.push(...tables.slice(0, 2));
      }
    }

    if (hasGroupKeyword && tableIds.length === 0) {
      tableIds = ['igd_m_cust_txn_bank', 'igd_m_cust_txn_card', 'igd_m_cust_txn_sec', 'igd_m_cust_txn_life'];
    }

    // Build domain → attrs from tables
    const domainAttrs: Record<string, Set<string>> = {};
    for (const tid of tableIds) {
      const meta = TABLE_DOMAIN_MAP[tid];
      if (!meta) continue;
      if (!domainAttrs[meta.domain]) domainAttrs[meta.domain] = new Set();
      for (const a of meta.attrs) domainAttrs[meta.domain].add(a);
    }

    if (hasGroupKeyword) {
      if (!domainAttrs['은행']) domainAttrs['은행'] = new Set(['수신평균잔액', '여신잔액', '이체건수']);
      if (!domainAttrs['카드']) domainAttrs['카드'] = new Set(['월이용금액', '월이용건수', '신용한도']);
      if (!domainAttrs['증권']) domainAttrs['증권'] = new Set(['월거래금액', '투자자산', '보유종목수']);
      if (!domainAttrs['보험']) domainAttrs['보험'] = new Set(['월납입보험료', '보유계약건수', '보장금액']);
    }

    // Inject extra attributes from keyword detection in ALL queries
    for (const query of allUserQueries) {
      for (const [kw, extra] of Object.entries(KEYWORD_EXTRA_ATTRS)) {
        if (query.includes(kw)) {
          if (!domainAttrs[extra.domain]) domainAttrs[extra.domain] = new Set();
          for (const a of extra.attrs) domainAttrs[extra.domain].add(a);
        }
      }
    }

    // Also inject domains detected from keywords even if no tables found
    if (keywordDomains.has('digital') && !domainAttrs['앱']) {
      domainAttrs['앱'] = new Set(['월방문횟수', '월방문일수', '월체류시간', 'MAU여부']);
    }
    if (keywordDomains.has('customer') && !domainAttrs['통합']) {
      domainAttrs['통합'] = new Set(['연령대', '성별', '고객등급']);
    }

    const domainKeys = Object.keys(domainAttrs);
    if (domainKeys.length === 0) return null;

    // Determine highlighted attrs from ALL user queries (accumulative)
    const highlightedAttrs = new Set<string>();
    for (const query of allUserQueries) {
      for (const [kw, matchAttrs] of Object.entries(ATTR_KEYWORDS)) {
        if (query.includes(kw)) {
          for (const a of matchAttrs) highlightedAttrs.add(a);
        }
      }
    }

    return buildGraph(domainKeys, domainAttrs, highlightedAttrs);
  }, [tablesUsed, context, allMessages]);

  if (!graphData) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <p className="text-[13px] text-gray-500">쿼리를 실행하면 데이터 관계를 보여줍니다.</p>
      </div>
    );
  }

  const { rootNode, domainNodes, attrDots, edges, crossEdges, width, height } = graphData;

  return (
    <div className="p-2 h-full overflow-y-auto">
      <div className="rounded-[12px] bg-white border border-gray-200 shadow-card">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          className="block mx-auto"
        >
          {/* Root → domain edges */}
          {edges.map((e, i) => (
            <path
              key={`e-${i}`}
              d={`M${e.x1},${e.y1} C${e.x1},${(e.y1 + e.y2) / 2} ${e.x2},${(e.y1 + e.y2) / 2} ${e.x2},${e.y2}`}
              fill="none"
              stroke={e.color}
              strokeWidth="1.5"
              opacity="0.5"
            />
          ))}

          {/* Cross-domain edges */}
          {crossEdges.map((e, i) => (
            <g key={`ce-${i}`}>
              <line
                x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                stroke="#6b7280"
                strokeWidth="1"
                strokeDasharray="4,3"
                opacity="0.4"
              />
              {e.label && (
                <text
                  x={(e.x1 + e.x2) / 2}
                  y={(e.y1 + e.y2) / 2 - 5}
                  textAnchor="middle"
                  fill="#6b7280"
                  fontSize="7.5"
                  opacity="0.7"
                  fontFamily="system-ui"
                >
                  {e.label}
                </text>
              )}
            </g>
          ))}

          {/* Attr edges */}
          {attrDots.map((a, i) => (
            <line
              key={`al-${i}`}
              x1={a.parentX} y1={a.parentY}
              x2={a.x} y2={a.y}
              stroke={a.highlighted ? a.color : '#d1d5db'}
              strokeWidth={a.highlighted ? '1.8' : '0.8'}
              opacity={a.highlighted ? 0.8 : 0.4}
            />
          ))}

          {/* Attr dots + labels */}
          {attrDots.map((a, i) => (
            <g key={`ad-${i}`}>
              <circle
                cx={a.x} cy={a.y}
                r={a.highlighted ? 5 : 3}
                fill={a.highlighted ? a.color : '#9ca3af'}
                opacity={a.highlighted ? 1 : 0.6}
              />
              {a.highlighted && (
                <circle cx={a.x} cy={a.y} r="9" fill="none" stroke={a.color} strokeWidth="1.5" opacity="0.3" />
              )}
              <text
                x={a.x + (a.x > a.parentX ? 9 : -9)}
                y={a.y + 3.5}
                textAnchor={a.x > a.parentX ? 'start' : 'end'}
                fill={a.highlighted ? '#111827' : '#6b7280'}
                fontSize={a.highlighted ? '10' : '9'}
                fontWeight={a.highlighted ? '600' : '400'}
                fontFamily="system-ui"
              >
                {a.label}
              </text>
            </g>
          ))}

          {/* Root node */}
          {rootNode && (
            <g>
              <rect
                x={rootNode.x - 52} y={rootNode.y - 14}
                width={104} height={28}
                rx="14"
                fill="#0064FF"
                stroke="none"
              />
              <text
                x={rootNode.x} y={rootNode.y + 5}
                textAnchor="middle"
                fill="#ffffff"
                fontSize="11"
                fontWeight="700"
                fontFamily="system-ui"
              >
                신한금융그룹
              </text>
            </g>
          )}

          {/* Domain nodes */}
          {domainNodes.map((d, i) => {
            const labelW = d.label.length * 9 + 22;
            return (
              <g key={`dn-${i}`}>
                <rect
                  x={d.x - labelW / 2} y={d.y - 13}
                  width={labelW} height={26}
                  rx="13"
                  fill="#ffffff"
                  stroke={d.color}
                  strokeWidth="1.8"
                />
                <text
                  x={d.x} y={d.y + 4.5}
                  textAnchor="middle"
                  fill={d.color}
                  fontSize="10.5"
                  fontWeight="600"
                  fontFamily="system-ui"
                >
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function buildGraph(
  domainKeys: string[],
  domainAttrs: Record<string, Set<string>>,
  highlightedAttrs: Set<string>,
): GraphData {
  const width = 520;
  const domainNodes: DomainNode[] = [];
  const attrDots: AttrDot[] = [];
  const edges: Edge[] = [];
  const crossEdges: Edge[] = [];

  const showRoot = domainKeys.length > 1;
  const rootX = width / 2;
  const rootY = showRoot ? 35 : 0;
  const rootNode = showRoot ? { x: rootX, y: rootY } : null;

  const domainStartY = showRoot ? 100 : 40;
  const domainCount = domainKeys.length;

  const usableWidth = width - 100;
  const domainGap = domainCount > 1 ? usableWidth / (domainCount - 1) : 0;
  const startX = domainCount > 1 ? 50 : width / 2;

  domainKeys.forEach((domain, di) => {
    const color = DOMAIN_COLORS[domain] || DOMAIN_COLORS['기타'];
    const label = DOMAIN_LABELS[domain] || domain;
    const dx = startX + di * domainGap;
    const dy = domainStartY;

    domainNodes.push({ domain, label, color, attrs: Array.from(domainAttrs[domain]), x: dx, y: dy });

    if (showRoot) {
      edges.push({ x1: rootX, y1: rootY + 14, x2: dx, y2: dy - 13, color });
    }

    const attrs = Array.from(domainAttrs[domain]);
    const lineHeight = 24;
    const attrStartY = dy + 38;

    attrs.forEach((attr, ai) => {
      const ay = attrStartY + ai * lineHeight;
      const offsetX = (ai % 2 === 0 ? -14 : 14);
      const ax = dx + offsetX;

      attrDots.push({
        label: attr,
        color,
        x: Math.max(55, Math.min(width - 55, ax)),
        y: ay,
        parentX: dx,
        parentY: dy,
        highlighted: highlightedAttrs.has(attr),
      });
    });
  });

  // Cross-domain edges between domains that share highlighted attrs (교차 관계)
  if (domainNodes.length > 1) {
    const highlightedDomains = domainNodes.filter(d =>
      attrDots.some(a => a.parentX === d.x && a.parentY === d.y && a.highlighted)
    );

    if (highlightedDomains.length > 1) {
      for (let i = 0; i < highlightedDomains.length - 1; i++) {
        const a = highlightedDomains[i];
        const b = highlightedDomains[i + 1];
        crossEdges.push({
          x1: a.x, y1: a.y,
          x2: b.x, y2: b.y,
          color: '#6b7280',
          label: '교차',
        });
      }
    } else {
      for (let i = 0; i < domainNodes.length - 1; i++) {
        const a = domainNodes[i];
        const b = domainNodes[i + 1];
        crossEdges.push({
          x1: a.x, y1: a.y,
          x2: b.x, y2: b.y,
          color: '#6b7280',
          label: '교차',
        });
      }
    }
  }

  let maxAttrBottom = domainStartY + 80;
  for (const dk of domainKeys) {
    const count = domainAttrs[dk].size;
    const bottom = domainStartY + 38 + count * 24 + 20;
    if (bottom > maxAttrBottom) maxAttrBottom = bottom;
  }
  const height = maxAttrBottom;
  return { rootNode, domainNodes, attrDots, edges, crossEdges, width, height };
}
