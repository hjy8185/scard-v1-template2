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

    const labelCol = result.columns[0];
    const valueCol = result.columns[result.columns.length > 1 ? 1 : 0];

    const items = result.rows.map((row) => ({
      label: String(row[labelCol] ?? ''),
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
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-pearl">
          {title || '데이터 시각화'}
        </h3>
        <span className="text-xs text-mist bg-ink-700 px-2.5 py-1 rounded-full border border-ink-600">
          합계: {totalValue.toLocaleString('ko-KR')}
        </span>
      </div>

      {/* Bar Chart */}
      <div className="rounded-xl bg-ink-800/50 border border-ink-600 p-5">
        <div className="space-y-3">
          {items.map((item, i) => {
            const percentage = (item.value / maxValue) * 100;
            const share = ((item.value / totalValue) * 100).toFixed(1);
            const barColor = getBarColor(i, items.length);

            return (
              <div key={i} className="group">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-pearl">
                    {item.label || '(없음)'}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-pearl">
                      {item.value.toLocaleString('ko-KR')}
                    </span>
                    <span className="text-[11px] text-slate">
                      ({share}%)
                    </span>
                  </div>
                </div>
                <div className="h-7 rounded-lg bg-ink-900 border border-ink-600 overflow-hidden relative">
                  <div
                    className="h-full rounded-lg transition-all duration-700 ease-out relative overflow-hidden"
                    style={{
                      width: `${percentage}%`,
                      background: `linear-gradient(90deg, ${barColor}33, ${barColor}66)`,
                      borderRight: `2px solid ${barColor}`,
                    }}
                  >
                    <div
                      className="absolute inset-0 opacity-30"
                      style={{
                        background: `repeating-linear-gradient(90deg, transparent, transparent 4px, ${barColor}22 4px, ${barColor}22 8px)`,
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Axis labels */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-ink-600">
          <span className="text-[11px] text-slate">{labelCol}</span>
          <span className="text-[11px] text-slate">{valueCol}</span>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        <StatCard label="전체" value={totalValue.toLocaleString('ko-KR')} color="aqua" />
        <StatCard label="최대" value={Math.max(...items.map(d => d.value)).toLocaleString('ko-KR')} color="jade" />
        <StatCard label="평균" value={Math.round(totalValue / items.length).toLocaleString('ko-KR')} color="amber" />
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`rounded-lg bg-ink-800 border border-ink-600 p-3 text-center`}>
      <p className="text-[11px] text-slate mb-0.5">{label}</p>
      <p className={`text-sm font-semibold text-${color}`}>{value}</p>
    </div>
  );
}

function getBarColor(index: number, total: number): string {
  const colors = ['#38c7e0', '#3dd68c', '#f5a623', '#ff6b6b', '#a78bfa', '#ec4899'];
  return colors[index % colors.length];
}
