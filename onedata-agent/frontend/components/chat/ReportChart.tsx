'use client';

import React, { useMemo } from 'react';
import type { QueryResult } from '@/lib/types';

interface ReportChartProps {
  result: QueryResult;
  title?: string;
}

export function ReportChart({ result, title }: ReportChartProps) {
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

    const items = result.rows.slice(0, 10).map((row) => ({
      label: String(row[labelCol] ?? ''),
      value: parseFloat(String(row[valueCol] ?? '0')) || 0,
    }));

    const maxValue = Math.max(...items.map((d) => d.value), 1);
    const totalValue = items.reduce((sum, d) => sum + d.value, 0);

    const insight = generateInsight(items, labelCol, valueCol!);

    return { items, maxValue, totalValue, labelCol, valueCol, insight };
  }, [result]);

  if (!chartData) {
    return null;
  }

  const { items, maxValue, totalValue, labelCol, valueCol, insight } = chartData;

  return (
    <div className="px-4 py-3">
      {/* Compact header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-mist">
          {title || valueCol}
        </span>
        <span className="text-[11px] text-slate">
          합계 {totalValue.toLocaleString('ko-KR')}
        </span>
      </div>

      {/* Compact bar chart */}
      <div className="space-y-1.5">
        {items.map((item, i) => {
          const pct = (item.value / maxValue) * 100;
          const share = ((item.value / totalValue) * 100).toFixed(1);
          const color = getColor(i);

          return (
            <div key={i} className="flex items-center gap-2 h-6">
              <span className="text-[11px] text-mist w-[72px] truncate text-right shrink-0">
                {item.label || '(없음)'}
              </span>
              <div className="flex-1 h-4 rounded bg-ink-800 overflow-hidden relative">
                <div
                  className="h-full rounded transition-all duration-500"
                  style={{ width: `${pct}%`, background: color }}
                />
              </div>
              <span className="text-[11px] font-mono text-pearl w-[60px] text-right shrink-0">
                {item.value.toLocaleString('ko-KR')}
              </span>
              <span className="text-[10px] text-slate w-[36px] text-right shrink-0">
                {share}%
              </span>
            </div>
          );
        })}
      </div>

      {/* Insight line */}
      {insight && (
        <p className="mt-2.5 text-[11px] text-slate leading-relaxed border-t border-ink-700 pt-2">
          {insight}
        </p>
      )}
    </div>
  );
}

function generateInsight(
  items: { label: string; value: number }[],
  labelCol: string,
  valueCol: string,
): string {
  if (items.length === 0) return '';
  if (items.length === 1) return `${items[0].label}: ${items[0].value.toLocaleString('ko-KR')}`;

  const sorted = [...items].sort((a, b) => b.value - a.value);
  const top = sorted[0];
  const total = items.reduce((s, d) => s + d.value, 0);
  const topPct = ((top.value / total) * 100).toFixed(1);

  const bottom = sorted[sorted.length - 1];
  const ratio = top.value / Math.max(bottom.value, 1);

  if (items.length <= 3) {
    return `${top.label}(${topPct}%)이 가장 높고, ${bottom.label}이 가장 낮아요.`;
  }

  const top3 = sorted.slice(0, 3);
  const top3Pct = ((top3.reduce((s, d) => s + d.value, 0) / total) * 100).toFixed(0);

  if (ratio > 5) {
    return `${top.label}이 ${topPct}%로 압도적이며, 최하위(${bottom.label}) 대비 ${ratio.toFixed(1)}배 차이가 나요.`;
  }

  return `상위 3개(${top3.map(d => d.label).join(', ')})가 전체의 ${top3Pct}%를 차지해요.`;
}

function getColor(index: number): string {
  const colors = [
    '#38c7e0', '#3dd68c', '#f5a623', '#ec4899',
    '#a78bfa', '#60a5fa', '#f97316', '#10b981',
    '#8b5cf6', '#6b7280',
  ];
  return colors[index % colors.length];
}
