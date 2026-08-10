'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Subgraph, SubgraphNode } from '@/lib/types';

interface MessageTraceProps {
  subgraph: Subgraph;
  highlightedNode?: string | null;
  onHighlightClear?: () => void;
}

function NodeProperties({ properties }: { properties: Record<string, unknown> }) {
  const entries = Object.entries(properties).filter(
    ([key]) => !key.startsWith('_'),
  );
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {entries.map(([key, val]) => (
        <span key={key} className="inline-flex items-center gap-1 text-[13px]">
          <Badge variant="outline" className="text-[13px] px-1.5 py-0">
            {key}
          </Badge>
          <span style={{ color: 'var(--mist)' }}>{String(val)}</span>
        </span>
      ))}
    </div>
  );
}

export function MessageTrace({ subgraph, highlightedNode, onHighlightClear }: MessageTraceProps) {
  const [expanded, setExpanded] = useState(false);
  const highlightRef = useRef<HTMLDivElement>(null);

  const nodes = subgraph.nodes;

  // U43(#185): 아래 훅들은 전부 조건부 return(nodes.length === 0) '위'에 있어야 한다.
  // 이전 구현은 early return 뒤에 useEffect 3개를 호출 — subgraph가 비었다↔찼다로
  // 바뀌는 렌더 사이에 훅 개수가 달라져 훅 순서가 깨지고(rules of hooks 위반)
  // React 19에서 update depth 폭주(#185)로 표면화됐다.
  const isNodeHighlighted = useCallback((node: SubgraphNode) => {
    if (!highlightedNode) return false;
    return (
      node.id === highlightedNode ||
      node.label === highlightedNode ||
      node.label.includes(highlightedNode)
    );
  }, [highlightedNode]);

  // Auto-expand when a citation is clicked and matches a node
  useEffect(() => {
    if (!highlightedNode) return;
    if (!nodes.some((n) => isNodeHighlighted(n))) return;
    // 이미 펼쳐져 있으면 setState 자체를 하지 않는다(동일 값 재설정으로 인한 렌더 왕복 차단)
    setExpanded((prev) => (prev ? prev : true));
  }, [highlightedNode, nodes, isNodeHighlighted]);

  // Scroll highlighted node into view
  useEffect(() => {
    if (highlightedNode && expanded && highlightRef.current) {
      highlightRef.current.scrollIntoView?.({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [highlightedNode, expanded]);

  // Auto-clear highlight after 3 seconds.
  // onHighlightClear는 부모(AnswerShell)에서 매 렌더 새 함수로 올 수 있으므로 ref로 고정 —
  // 콜백 참조가 바뀔 때마다 타이머가 재생성/재실행되던 경로를 끊는다.
  const clearRef = useRef(onHighlightClear);
  clearRef.current = onHighlightClear;
  useEffect(() => {
    if (!highlightedNode) return;
    const timer = setTimeout(() => { clearRef.current?.(); }, 3000);
    return () => clearTimeout(timer);
  }, [highlightedNode]);

  if (nodes.length === 0) {
    return null;
  }

  // U17 FR-5b: 구 드릴다운 배선 제거(overview 뷰에서만 동작하던 조건부 사장 코드).
  // 노드 클릭은 로컬 하이라이트만 — 지도 연동은 본문 cite pill(resolveCiteBridge) 경로가 담당.
  const handleNodeClick = (_node: SubgraphNode) => {};

  return (
    <div className="mt-2 rounded-[var(--r-md)] text-sm" style={{ border: '1px solid var(--ink-600)' }}>
      <button
        className="flex w-full items-center justify-between px-3 py-2 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="font-medium text-[13px]">
          {expanded ? '\u25BC' : '\u25B6'} 근거 노드 ({nodes.length})
        </span>
      </button>

      {expanded && (
        <div className="px-3 py-2 space-y-2" style={{ borderTop: '1px solid var(--ink-600)' }}>
          {nodes.map((node) => {
            const highlighted = isNodeHighlighted(node);
            return (
              <div
                key={node.id}
                ref={highlighted ? highlightRef : undefined}
                className="rounded-[var(--r-md)] p-2.5 transition-all duration-300 cursor-pointer"
                style={{
                  background: 'var(--ink-800)',
                  outline: highlighted ? '2px solid var(--jade)' : 'none',
                }}
                onClick={() => handleNodeClick(node)}
              >
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[13px]">
                    {node.properties?.node_type as string ?? 'Node'}
                  </Badge>
                  <span className="font-medium text-[13px]">{node.label}</span>
                </div>
                <NodeProperties properties={node.properties} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
