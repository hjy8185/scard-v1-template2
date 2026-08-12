'use client';

import React, { useMemo } from 'react';
import type { QueryResult } from '@/lib/types';

interface ReportChartProps {
  result: QueryResult;
  title?: string;
  answer?: string;
}

export function ReportChart({ result, title, answer }: ReportChartProps) {
  const chartData = useMemo(() => {
    if (!result || result.rows.length === 0 || result.columns.length < 2) {
      return null;
    }

    const isCodeCol = (col: string) =>
      col.includes('년월') || col.includes('일자') || col.includes('날짜') ||
      col.includes('코드') || col.includes('번호') || col.includes('구분');

    const isValueCol = (col: string) =>
      col.includes('수') || col.includes('금액') || col.includes('건수') ||
      col.includes('평균') || col.includes('합계') || col.includes('잔액') ||
      col.includes('비율') || col.includes('cnt') || col.includes('amount') ||
      col.includes('MAU');

    let valueCol = result.columns.find((col) => isValueCol(col) && !isCodeCol(col));
    if (!valueCol) {
      valueCol = result.columns.find((col) => {
        if (isCodeCol(col)) return false;
        const sample = result.rows[0]?.[col];
        return sample !== null && sample !== undefined && !isNaN(Number(sample));
      });
    }
    if (!valueCol) {
      valueCol = result.columns[1];
    }

    const labelCol = result.columns.find((col) => col !== valueCol) || result.columns[0];

    const items = result.rows.slice(0, 12).map((row) => ({
      label: formatLabel(String(row[labelCol] ?? ''), labelCol),
      value: parseFloat(String(row[valueCol] ?? '0')) || 0,
    }));

    const maxValue = Math.max(...items.map((d) => d.value), 1);
    const totalValue = items.reduce((sum, d) => sum + d.value, 0);

    return { items, maxValue, totalValue, labelCol, valueCol };
  }, [result]);

  if (!chartData) {
    return null;
  }

  const { items, maxValue, totalValue, labelCol, valueCol } = chartData;

  return (
    <div className="px-3 py-2.5 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-mist">
          {title || `${labelCol} × ${valueCol}`}
        </span>
        <span className="text-[10px] text-slate">
          {items.length}건 · {totalValue.toLocaleString('ko-KR')}
        </span>
      </div>

      {/* Compact bar chart */}
      <div className="space-y-0.5">
        {items.map((item, i) => {
          const pct = (item.value / maxValue) * 100;
          const share = ((item.value / totalValue) * 100).toFixed(1);
          const color = getColor(i);

          return (
            <div key={i} className="flex items-center gap-1.5 h-[18px]">
              <span className="text-[9px] text-mist w-[56px] truncate text-right shrink-0">
                {item.label}
              </span>
              <div className="flex-1 h-3 rounded-sm bg-ink-800/80 overflow-hidden">
                <div
                  className="h-full rounded-sm transition-all duration-500"
                  style={{ width: `${pct}%`, background: color, opacity: 0.85 }}
                />
              </div>
              <span className="text-[9px] font-mono text-pearl w-[44px] text-right shrink-0">
                {item.value.toLocaleString('ko-KR')}
              </span>
              <span className="text-[8px] text-slate w-[26px] text-right shrink-0">
                {share}%
              </span>
            </div>
          );
        })}
      </div>

      {/* AI Answer as insight/commentary */}
      {answer && (
        <div className="border-t border-ink-700 pt-2">
          <div className="flex items-start gap-1.5">
            <span className="text-[9px] text-aqua mt-0.5 shrink-0">AI</span>
            <p className="text-[10px] text-mist/90 leading-[1.5] whitespace-pre-wrap">
              {answer}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function formatLabel(raw: string, colName: string): string {
  if (colName.includes('연령') || colName.includes('구간')) {
    const num = parseInt(raw, 10);
    if (!isNaN(num)) {
      if (num >= 70) return `${num}대+`;
      return `${num}~${num + 4}세`;
    }
  }
  if (colName.includes('년월') && raw.length === 6) {
    return `${raw.slice(0, 4)}.${raw.slice(4)}`;
  }
  return raw;
}

function getColor(index: number): string {
  const colors = [
    '#38c7e0', '#3dd68c', '#f5a623', '#ec4899',
    '#a78bfa', '#60a5fa', '#f97316', '#10b981',
    '#8b5cf6', '#f472b6', '#22d3ee', '#6b7280',
  ];
  return colors[index % colors.length];
}
