'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { ReasoningStep } from '@/lib/types';

interface QueryPlanProps {
  steps?: ReasoningStep[];
  sql?: string;
}

interface PlanNode {
  id: string;
  operation: string;
  detail: string;
  cost?: string;
  rows?: number;
}

export function QueryPlan({ steps, sql }: QueryPlanProps) {
  // Generate a visual query plan from the SQL and reasoning steps
  const planNodes = generatePlan(sql);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-pearl">실행 계획</h3>
        <span className="text-xs text-mist">Onedata Query Optimizer</span>
      </div>

      <div className="space-y-2">
        {planNodes.map((node, index) => (
          <div
            key={node.id}
            className="animate-slide-up"
            style={{ animationDelay: `${index * 80}ms` }}
          >
            <div className={cn(
              'flex items-start gap-3 p-3 rounded-xl border transition-all',
              'bg-ink-800/50 border-ink-600 hover:border-aqua/30',
            )}>
              {/* Indentation guide */}
              <div className="flex items-center gap-1 shrink-0">
                {Array.from({ length: Math.min(index, 3) }).map((_, i) => (
                  <div key={i} className="w-3 h-4 border-l border-b border-ink-600 rounded-bl-sm" />
                ))}
                <div className="h-6 w-6 rounded-lg bg-aqua/10 border border-aqua/20 flex items-center justify-center text-aqua text-[10px] font-mono">
                  {index + 1}
                </div>
              </div>

              {/* Operation details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-pearl">{node.operation}</span>
                  {node.cost && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-700 text-amber border border-amber/20">
                      cost: {node.cost}
                    </span>
                  )}
                </div>
                <p className="text-xs text-mist mt-0.5">{node.detail}</p>
                {node.rows !== undefined && (
                  <span className="text-[10px] text-slate">
                    est. {node.rows.toLocaleString()} rows
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {!sql && (
        <div className="flex items-center justify-center h-40 text-sm text-slate">
          SQL이 생성되면 실행 계획이 표시됩니다.
        </div>
      )}
    </div>
  );
}

function generatePlan(sql?: string): PlanNode[] {
  if (!sql) return [];

  const upper = sql.toUpperCase();
  const nodes: PlanNode[] = [];

  // Parse SQL structure to generate approximate plan
  if (upper.includes('ORDER BY')) {
    nodes.push({
      id: 'sort',
      operation: 'Sort',
      detail: 'ORDER BY 절에 의한 정렬',
      cost: '0.15..0.45',
      rows: 10,
    });
  }

  if (upper.includes('LIMIT')) {
    nodes.push({
      id: 'limit',
      operation: 'Limit',
      detail: '결과 건수 제한',
      cost: '0.00..0.10',
    });
  }

  if (upper.includes('GROUP BY')) {
    nodes.push({
      id: 'aggregate',
      operation: 'HashAggregate',
      detail: 'GROUP BY 절에 의한 집계',
      cost: '0.20..0.60',
      rows: 50,
    });
  }

  const joins = sql.match(/JOIN/gi);
  if (joins) {
    for (let i = 0; i < joins.length; i++) {
      nodes.push({
        id: `join-${i}`,
        operation: 'Hash Join',
        detail: `테이블 조인 (${i + 1}/${joins.length})`,
        cost: '0.30..0.80',
        rows: 1000,
      });
    }
  }

  if (upper.includes('WHERE')) {
    nodes.push({
      id: 'filter',
      operation: 'Filter',
      detail: 'WHERE 조건 필터',
      cost: '0.10..0.30',
      rows: 500,
    });
  }

  // Base scan
  const fromMatch = sql.match(/FROM\s+(\w+)/i);
  nodes.push({
    id: 'scan',
    operation: 'Seq Scan',
    detail: fromMatch ? `${fromMatch[1]} 테이블 스캔` : '테이블 스캔',
    cost: '0.00..1.00',
    rows: 10000,
  });

  return nodes;
}
