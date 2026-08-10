'use client';

// U13 C1: 지도 노드/다리 클릭 → 상세 패널(기존 6패널 재배치). 탭 바 없음 — 지도가 허브.
import type { PlatformAnnotation } from '@/lib/types';
import { ASSET_NODES, BRIDGES } from '@/lib/asset-map';
import { RoutePlanView } from './RoutePlanView';
import { CitationPanel } from './CitationPanel';
import { OntologyPanel } from './OntologyPanel';
import { ConnectionPath } from './ConnectionPath';
import { CatalogPanel } from './CatalogPanel';
import { MetricPanel } from './MetricPanel';
import { GraphView } from '@/components/graph/GraphView';

interface DrilldownPanelProps {
  selection: { kind: 'node' | 'bridge'; id: string } | null;
  annotation: PlatformAnnotation | undefined;
  onClose: () => void;
}

// 노드/다리 → 어떤 상세를 보일지 결정
function panelFor(selection: { kind: 'node' | 'bridge'; id: string }, ann: PlatformAnnotation | undefined) {
  const cit = ann?.citation;
  if (selection.kind === 'bridge') {
    const b = BRIDGES.find((x) => x.id === selection.id);
    // P6: crosswalk/subsumption 다리 → 구체 개념쌍 경로(ConnectionPath), 오버뷰 아님
    if (b?.kind === 'crosswalk' || b?.kind === 'subsumption') return <ConnectionPath annotation={ann} />;
    if (b?.kind === 'rule') return <CitationPanel citation={cit} />;
    if (b?.kind === 'metric') return <MetricPanel metrics={cit?.metrics} />;
  }
  const node = ASSET_NODES.find((x) => x.id === selection.id);
  if (!node) return null;
  switch (node.camp) {
    case 'terms':
      return node.id === 'benefit_condition'
        ? <CitationPanel citation={cit} />
        : <><RoutePlanView plan={ann?.route_plan} audit={ann?.audit} /><GraphView subgraph={ann?.subgraph} /></>;
    case 'market':
      return node.id === 'category_node'
        ? <OntologyPanel ontology={ann?.ontology} />
        : <CatalogPanel catalog={ann?.catalog} />;
    case 'synthetic':
      return node.id === 'reward_ledger'
        ? <MetricPanel metrics={cit?.metrics} />
        : <CitationPanel citation={cit} />;
  }
  return null;
}

export function DrilldownPanel({ selection, annotation, onClose }: DrilldownPanelProps) {
  if (!selection) return null;
  const label = selection.kind === 'node'
    ? ASSET_NODES.find((n) => n.id === selection.id)?.label
    : BRIDGES.find((b) => b.id === selection.id)?.label;
  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--ink-800)', borderTop: '1px solid var(--ink-600)' }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--ink-600)' }}>
        <span className="text-[13px] font-medium" style={{ color: 'var(--pearl)' }}>{label} · 상세</span>
        <button onClick={onClose} className="text-[13px]" style={{ color: 'var(--mist)' }} aria-label="상세 닫기">✕</button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {panelFor(selection, annotation)}
      </div>
    </div>
  );
}
