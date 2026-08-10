'use client';

// U13 P7: 답변별 테이블/노드 레벨 비저빌리티. 진영 오버뷰가 아니라
// "이 답변이 어떤 테이블·어떤 노드·어떤 개념쌍을 실제로 썼는가"를 보여준다.
import type { PlatformAnnotation, OntologyContext } from '@/lib/types';
import { extractProvenance } from '@/lib/asset-map';

const SCHEME_LABEL: Record<string, string> = {
  'shinhan-benefit': '신한 혜택', 'seoul-industry': '서울 업종', 'mcc': 'MCC 코드',
};
const SCHEME_COLOR: Record<string, string> = {
  'shinhan-benefit': 'var(--jade)', 'seoul-industry': 'var(--aqua)', 'mcc': 'var(--slate)',
};
// 그래프 노드 타입별 색
const NODE_COLOR: Record<string, string> = {
  CARD_Product: 'var(--jade)', CARD_BenefitGroup: 'var(--jade)', CARD_Benefit: 'var(--jade)',
  CARD_Condition: 'var(--amber)', CARD_BenefitLimit: 'var(--amber)', MERCHANT: 'var(--aqua)',
};

function chip(label: string, color: string) {
  return <span style={{ fontSize: 12, padding: '1px 5px', borderRadius: 'var(--r-pill)', background: color, color: 'var(--ink-900)' }}>{label}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--r-md)] p-2" style={{ background: 'var(--ink-800)', border: '1px solid var(--ink-600)' }}>
      <div style={{ color: 'var(--slate)', marginBottom: 5, fontSize: 12 }}>{title}</div>
      {children}
    </div>
  );
}

export function ConnectionPath({
  annotation, ontology,
}: { annotation?: PlatformAnnotation; ontology?: OntologyContext | null }) {
  const onto = ontology ?? annotation?.ontology;
  const { nodes, tables, marketRows } = extractProvenance(annotation);
  const pairs = onto?.crosswalk ?? [];
  const closure = onto?.closure_path ?? [];

  const nothing = nodes.length === 0 && tables.length === 0 && marketRows.length === 0
    && pairs.length === 0 && closure.length === 0;
  if (nothing) {
    return (
      <div className="flex h-full items-center justify-center text-sm" style={{ color: 'var(--mist)' }}>
        이 답변에는 노드/테이블 레벨 근거가 없습니다.
      </div>
    );
  }

  // crosswalk from_label별 그룹핑
  const byFrom = new Map<string, typeof pairs>();
  for (const p of pairs) {
    const k = p.from_label ?? p.from;
    if (!byFrom.has(k)) byFrom.set(k, []);
    byFrom.get(k)!.push(p);
  }

  return (
    <div className="space-y-2.5 text-[13px]">
      <div style={{ color: 'var(--mist)' }}>
        이 답변이 <b style={{ color: 'var(--pearl)' }}>실제로 사용한</b> 테이블 · 노드 · 연결
      </div>

      {/* 테이블 레벨 (provenance) */}
      {tables.length > 0 && (
        <Section title={`데이터 테이블 (${tables.length})`}>
          <div className="space-y-1">
            {tables.map((t, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <span style={{ color: 'var(--pearl)' }}>{t.component}</span>
                <span style={{ color: 'var(--mist)', fontSize: 12 }}>{t.source}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 노드 레벨 (graph_paths 실노드) */}
      {nodes.length > 0 && (
        <Section title={`지식그래프 노드 (${nodes.length})`}>
          <div className="flex flex-wrap gap-1">
            {nodes.slice(0, 40).map((n) => (
              <span key={n.id} className="rounded-[var(--r-pill)] px-2 py-0.5"
                title={`${n.label} · ${n.id}`}
                style={{ background: 'var(--ink-700)', color: NODE_COLOR[n.label] ?? 'var(--pearl)', fontSize: 12 }}>
                {n.name}
              </span>
            ))}
            {nodes.length > 40 && <span style={{ color: 'var(--slate)' }}>+{nodes.length - 40}</span>}
          </div>
        </Section>
      )}

      {/* 시장 행(테이블 레벨 실측치) */}
      {marketRows.length > 0 && (
        <Section title={`서울 시장 행 (${marketRows.length})`}>
          <div className="space-y-1">
            {marketRows.slice(0, 8).map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <span style={{ color: 'var(--pearl)' }}>{r.label}</span>
                <span style={{ color: 'var(--aqua)' }}>{r.amount}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 개념 계층 (subsumption) */}
      {closure.length > 0 && (
        <Section title="개념 계층 (subsumption)">
          <div className="flex flex-wrap items-center gap-1">
            {closure.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span style={{ color: 'var(--slate)' }}>⊒</span>}
                <span className="rounded-[var(--r-pill)] px-2 py-0.5" style={{ background: 'var(--ink-700)', color: 'var(--pearl)' }}>{c}</span>
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* crosswalk 구체 개념쌍 (약관어→통계어) */}
      {[...byFrom.entries()].map(([from, ps]) => (
        <Section key={from} title="개념 연결 (crosswalk)">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="font-medium" style={{ color: 'var(--jade)' }}>{from}</span>
            {chip(SCHEME_LABEL['shinhan-benefit'], SCHEME_COLOR['shinhan-benefit'])}
          </div>
          <div className="space-y-1 pl-3" style={{ borderLeft: '2px solid var(--ink-600)' }}>
            {ps.map((p, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span style={{ color: 'var(--slate)' }}>→</span>
                <span style={{ color: 'var(--pearl)' }}>{p.to_label ?? p.to}</span>
                {chip(SCHEME_LABEL[p.to_scheme] ?? p.to_scheme, SCHEME_COLOR[p.to_scheme] ?? 'var(--mist)')}
              </div>
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
}
