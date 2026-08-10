'use client';

import React, { useState } from 'react';
import { highlightSQL, copyToClipboard } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface SqlDisplayProps {
  sql: string;
  executionMs?: number;
}

export function SqlDisplay({ sql, executionMs }: SqlDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await copyToClipboard(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const highlightedHtml = highlightSQL(sql);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-pearl">생성된 SQL</h3>
          {executionMs !== undefined && (
            <span className="text-xs text-mist bg-ink-700 px-2.5 py-1 rounded-full border border-ink-600">
              실행: {executionMs}ms
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="text-mist hover:text-pearl"
        >
          {copied ? (
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-jade">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="text-jade text-xs">복사됨</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <span className="text-xs">복사</span>
            </span>
          )}
        </Button>
      </div>

      <div className="rounded-xl bg-ink-900 border border-ink-600 overflow-hidden">
        {/* SQL Header */}
        <div className="flex items-center gap-2 px-4 py-2 bg-ink-800 border-b border-ink-600">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-coral/60" />
            <div className="h-2.5 w-2.5 rounded-full bg-amber/60" />
            <div className="h-2.5 w-2.5 rounded-full bg-jade/60" />
          </div>
          <span className="text-[11px] text-slate font-mono ml-2">query.sql</span>
        </div>

        {/* SQL Content */}
        <div className="p-4 overflow-x-auto">
          <pre className="text-sm leading-relaxed font-mono">
            <code
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          </pre>
        </div>
      </div>

      {/* SQL Explanation */}
      <div className="mt-4 p-4 rounded-xl bg-ink-800/50 border border-ink-600">
        <h4 className="text-xs font-semibold text-mist mb-2 uppercase tracking-wider">쿼리 설명</h4>
        <SqlExplanation sql={sql} />
      </div>
    </div>
  );
}

// Simple SQL explanation generator
function SqlExplanation({ sql }: { sql: string }) {
  const upper = sql.toUpperCase();
  const parts: string[] = [];

  // Detect main operation
  if (upper.includes('SELECT')) {
    const fromMatch = sql.match(/FROM\s+(\w+(?:\.\w+)?)/i);
    if (fromMatch) {
      parts.push(`${fromMatch[1]} 테이블에서 데이터를 조회합니다.`);
    }
  }

  // Detect JOINs
  const joins = sql.match(/JOIN\s+(\w+(?:\.\w+)?)/gi);
  if (joins && joins.length > 0) {
    parts.push(`${joins.length}개 테이블을 조인합니다.`);
  }

  // Detect WHERE
  if (upper.includes('WHERE')) {
    parts.push('조건절로 데이터를 필터링합니다.');
  }

  // Detect GROUP BY
  if (upper.includes('GROUP BY')) {
    parts.push('결과를 그룹화하여 집계합니다.');
  }

  // Detect ORDER BY
  if (upper.includes('ORDER BY')) {
    parts.push('결과를 정렬합니다.');
  }

  // Detect LIMIT
  const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
  if (limitMatch) {
    parts.push(`상위 ${limitMatch[1]}건을 반환합니다.`);
  }

  if (parts.length === 0) {
    parts.push('생성된 SQL 쿼리입니다.');
  }

  return (
    <ul className="space-y-1">
      {parts.map((part, i) => (
        <li key={i} className="flex items-start gap-2 text-xs text-mist">
          <span className="text-aqua mt-0.5 shrink-0">&#8226;</span>
          <span>{part}</span>
        </li>
      ))}
    </ul>
  );
}
