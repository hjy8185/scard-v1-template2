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
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-bold text-gray-900">생성된 SQL</h3>
          {executionMs !== undefined && (
            <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {executionMs}ms
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={handleCopy}>
          {copied ? (
            <span className="flex items-center gap-1 text-green-600 text-[12px]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              복사됨
            </span>
          ) : (
            <span className="flex items-center gap-1 text-gray-500 text-[12px]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              복사
            </span>
          )}
        </Button>
      </div>

      <div className="rounded-[12px] bg-gray-900 overflow-hidden shadow-card">
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
            <div className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
            <div className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
          </div>
          <span className="text-[10px] text-gray-400 font-mono ml-2">query.sql</span>
        </div>
        <div className="p-4 overflow-x-auto">
          <pre className="text-[12px] leading-[1.7] font-mono text-[#D4D4D4]">
            <code dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
          </pre>
        </div>
      </div>

      <div className="mt-3 p-3 rounded-[10px] bg-gray-50 border border-gray-200">
        <h4 className="text-[11px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">쿼리 설명</h4>
        <SqlExplanation sql={sql} />
      </div>
    </div>
  );
}

function SqlExplanation({ sql }: { sql: string }) {
  const upper = sql.toUpperCase();
  const parts: string[] = [];

  if (upper.includes('SELECT')) {
    const fromMatch = sql.match(/FROM\s+(\w+(?:\.\w+)?)/i);
    if (fromMatch) parts.push(`${fromMatch[1]} 테이블에서 데이터를 조회합니다.`);
  }
  const joins = sql.match(/JOIN\s+(\w+(?:\.\w+)?)/gi);
  if (joins && joins.length > 0) parts.push(`${joins.length}개 테이블을 조인합니다.`);
  if (upper.includes('WHERE')) parts.push('조건절로 데이터를 필터링합니다.');
  if (upper.includes('GROUP BY')) parts.push('결과를 그룹화하여 집계합니다.');
  if (upper.includes('ORDER BY')) parts.push('결과를 정렬합니다.');
  const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
  if (limitMatch) parts.push(`상위 ${limitMatch[1]}건을 반환합니다.`);
  if (parts.length === 0) parts.push('생성된 SQL 쿼리입니다.');

  return (
    <ul className="space-y-0.5">
      {parts.map((part, i) => (
        <li key={i} className="flex items-start gap-2 text-[12px] text-gray-600">
          <span className="text-blue-500 mt-0.5 shrink-0">•</span>
          <span>{part}</span>
        </li>
      ))}
    </ul>
  );
}
