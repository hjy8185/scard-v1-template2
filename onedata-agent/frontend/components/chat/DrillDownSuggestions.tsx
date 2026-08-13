'use client';

import React, { useMemo } from 'react';
import type { ChatMessage } from '@/lib/types';

interface DrillDownSuggestionsProps {
  message: ChatMessage;
  onSelect: (query: string) => void;
}

export function DrillDownSuggestions({ message, onSelect }: DrillDownSuggestionsProps) {
  const suggestions = useMemo(() => {
    return generateDrillDowns(message);
  }, [message]);

  if (suggestions.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <p className="text-[11px] text-gray-500 mb-2 flex items-center gap-1">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400">
          <polyline points="7 13 12 18 17 13" />
          <polyline points="7 6 12 11 17 6" />
        </svg>
        더 깊이 분석하기
      </p>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(s.query);
            }}
            className="px-3 py-1.5 rounded-[8px] bg-gray-50 border border-gray-200 text-[12px] text-gray-700 hover:text-blue-500 hover:border-blue-200 hover:bg-blue-50 transition-all duration-150"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface Suggestion {
  label: string;
  query: string;
}

function generateDrillDowns(message: ChatMessage): Suggestion[] {
  if (!message.queryResults || !message.sql) return [];

  const { columns, rows } = message.queryResults;
  const sql = message.sql;
  const suggestions: Suggestion[] = [];

  const hasAgeCol = columns.some(c => c.includes('연령') || c.includes('나이'));
  const hasGenderCol = columns.some(c => c.includes('성별'));
  const hasGroupCol = columns.some(c => c.includes('그룹') || c.includes('계열'));
  const hasAmountCol = columns.some(c => c.includes('금액') || c.includes('매출') || c.includes('거래'));
  const hasCountCol = columns.some(c => c.includes('수') || c.includes('건') || c.includes('count'));
  const hasTimeCol = columns.some(c => c.includes('년월') || c.includes('일자') || c.includes('기간'));

  if (!hasAgeCol) {
    suggestions.push({
      label: '연령대별 분포',
      query: '위 결과를 연령대별로 나눠서 보여줘',
    });
  }
  if (!hasGenderCol) {
    suggestions.push({
      label: '성별 비교',
      query: '위 결과를 성별로 구분해서 보여줘',
    });
  }
  if (!hasGroupCol) {
    suggestions.push({
      label: '계열사별 현황',
      query: '위 결과를 계열사별(은행/카드/증권/라이프)로 나눠줘',
    });
  }
  if (!hasTimeCol && (hasAmountCol || hasCountCol)) {
    suggestions.push({
      label: '월별 추이',
      query: '위 결과를 최근 6개월 월별 추이로 보여줘',
    });
  }

  if (rows.length > 0 && rows.length <= 10) {
    const firstCol = columns[0];
    const topValue = rows[0][firstCol];
    if (topValue && typeof topValue === 'string') {
      suggestions.push({
        label: `${topValue} 상세`,
        query: `${topValue}에 대해 더 자세히 알려줘`,
      });
    }
  }

  if (rows.length >= 5 && !hasTimeCol) {
    suggestions.push({
      label: '상위 20개로 확장',
      query: '같은 조건으로 상위 20개까지 보여줘',
    });
  }

  return suggestions.slice(0, 4);
}
