'use client';

import React, { useMemo } from 'react';
import type { QueryResult } from '@/lib/types';

interface ReportChartProps {
  result: QueryResult;
  title?: string;
  answer?: string;
}

interface ChartGroup {
  groupLabel: string;
  items: { label: string; value: number }[];
}

export function ReportChart({ result, title, answer }: ReportChartProps) {
  const chartData = useMemo(() => {
    if (!result || result.rows.length === 0 || result.columns.length < 2) {
      return null;
    }

    const isDateCol = (col: string) =>
      col.includes('년월') || col.includes('일자') || col.includes('날짜');

    const isCodeCol = (col: string) =>
      isDateCol(col) || col.includes('코드') || col.includes('번호');

    const isValueCol = (col: string) =>
      col.includes('수') || col.includes('금액') || col.includes('건수') ||
      col.includes('평균') || col.includes('합계') || col.includes('잔액') ||
      col.includes('비율') || col.includes('cnt') || col.includes('amount') ||
      col.includes('MAU') || col.includes('mau');

    const isGroupCol = (col: string) =>
      col.includes('계열') || col.includes('그룹') || col.includes('회사') ||
      col.includes('사') || col.includes('구분') || col.includes('채널');

    const isAgeCol = (col: string) =>
      col.includes('연령') || col.includes('나이') || col.includes('age') || col.includes('대');

    // Find value column
    let valueCol = result.columns.find((col) => isValueCol(col) && !isCodeCol(col));
    if (!valueCol) {
      valueCol = result.columns.find((col) => {
        if (isCodeCol(col)) return false;
        const sample = result.rows[0]?.[col];
        return sample !== null && sample !== undefined && !isNaN(Number(sample));
      });
    }
    if (!valueCol) valueCol = result.columns[result.columns.length - 1];

    // Find group column (각사) and sub-group column (연령대/기준년월)
    const otherCols = result.columns.filter(c => c !== valueCol);
    let groupCol = otherCols.find(c => isGroupCol(c));
    let subCol = otherCols.find(c => isAgeCol(c) || isDateCol(c));

    // If no explicit group/sub columns, use first two non-value columns
    if (!groupCol && !subCol && otherCols.length >= 2) {
      groupCol = otherCols[0];
      subCol = otherCols[1];
    } else if (!groupCol && !subCol && otherCols.length === 1) {
      groupCol = undefined;
      subCol = otherCols[0];
    }

    // When we have both group and date columns, always show date as sub label
    if (groupCol && !subCol) {
      const dateCol = otherCols.find(c => isDateCol(c) && c !== groupCol);
      if (dateCol) subCol = dateCol;
    }

    // If we have both groupCol and subCol, build grouped charts
    if (groupCol && subCol) {
      const groupMap = new Map<string, { label: string; value: number }[]>();
      for (const row of result.rows) {
        const gKey = String(row[groupCol] ?? '');
        const sKey = formatLabel(String(row[subCol] ?? ''), subCol);
        const val = parseFloat(String(row[valueCol] ?? '0')) || 0;
        if (!groupMap.has(gKey)) groupMap.set(gKey, []);
        groupMap.get(gKey)!.push({ label: sKey, value: val });
      }
      const groups: ChartGroup[] = Array.from(groupMap.entries()).map(([k, items]) => ({
        groupLabel: k,
        items: items.slice(0, 10),
      }));
      const globalMax = Math.max(...groups.flatMap(g => g.items.map(i => i.value)), 1);
      return { mode: 'grouped' as const, groups, globalMax, valueCol, groupCol, subCol };
    }

    // If only groupCol, use it as the label axis
    if (groupCol && !subCol) {
      const items = result.rows.slice(0, 12).map(row => ({
        label: formatLabel(String(row[groupCol] ?? ''), groupCol!),
        value: parseFloat(String(row[valueCol] ?? '0')) || 0,
      }));
      const globalMax = Math.max(...items.map(i => i.value), 1);
      return { mode: 'flat' as const, items, globalMax, valueCol, labelCol: groupCol };
    }

    // Flat: use subCol or first other col as label
    const labelCol = subCol || otherCols[0] || result.columns[0];
    const items = result.rows.slice(0, 12).map(row => ({
      label: formatLabel(String(row[labelCol] ?? ''), labelCol),
      value: parseFloat(String(row[valueCol] ?? '0')) || 0,
    }));
    const globalMax = Math.max(...items.map(i => i.value), 1);
    return { mode: 'flat' as const, items, globalMax, valueCol, labelCol };
  }, [result]);

  if (!chartData) return null;

  if (chartData.mode === 'grouped') {
    const { groups, globalMax, valueCol, groupCol, subCol } = chartData;
    const totalValue = groups.reduce((s, g) => s + g.items.reduce((ss, i) => ss + i.value, 0), 0);

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-gray-900">
            {title || `${groupCol}별 ${subCol} × ${valueCol}`}
          </h3>
          <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            합계 {totalValue.toLocaleString('ko-KR')}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {groups.map((group, gi) => {
            const groupTotal = group.items.reduce((s, i) => s + i.value, 0);
            return (
              <div key={gi} className="rounded-[12px] border border-gray-200 bg-white shadow-card p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13px] font-semibold text-gray-900">{group.groupLabel}</span>
                  <span className="text-[11px] text-gray-500">
                    합계 {groupTotal.toLocaleString('ko-KR')}
                  </span>
                </div>
                <div className="space-y-1">
                  {group.items.map((item, ii) => {
                    const pct = (item.value / globalMax) * 100;
                    return (
                      <div key={ii} className="flex items-center gap-2 h-[20px]">
                        <span className="text-[10px] text-gray-600 w-[64px] text-right shrink-0" title={item.label}>
                          {item.label}
                        </span>
                        <div className="flex-1 h-3.5 rounded-[3px] bg-gray-100 overflow-hidden">
                          <div
                            className="h-full rounded-[3px] transition-all duration-500"
                            style={{ width: `${pct}%`, background: getColor(gi) }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-gray-800 w-[48px] text-right shrink-0">
                          {item.value.toLocaleString('ko-KR')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Scale reference */}
        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] text-gray-400">0</span>
          <div className="flex-1 h-[1px] bg-gray-200" />
          <span className="text-[10px] text-gray-400">{globalMax.toLocaleString('ko-KR')}</span>
        </div>

        {answer && (
          <div className="p-3 rounded-[10px] bg-gray-50 border border-gray-200">
            <div className="flex items-start gap-2">
              <span className="text-[11px] font-semibold text-blue-500 mt-0.5 shrink-0">AI</span>
              <p className="text-[12px] text-gray-700 leading-[1.6] whitespace-pre-wrap">{answer}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Flat mode
  const { items, globalMax, valueCol, labelCol } = chartData;
  const totalValue = items.reduce((s, i) => s + i.value, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-bold text-gray-900">
          {title || `${labelCol} × ${valueCol}`}
        </h3>
        <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
          {items.length}건 · {totalValue.toLocaleString('ko-KR')}
        </span>
      </div>

      <div className="rounded-[12px] border border-gray-200 bg-white shadow-card p-4 space-y-1.5">
        {items.map((item, i) => {
          const pct = (item.value / globalMax) * 100;
          const share = ((item.value / totalValue) * 100).toFixed(1);

          return (
            <div key={i} className="flex items-center gap-2 h-[22px]">
              <span className="text-[11px] text-gray-600 w-[64px] truncate text-right shrink-0">
                {item.label}
              </span>
              <div className="flex-1 h-4 rounded-[4px] bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-[4px] transition-all duration-500"
                  style={{ width: `${pct}%`, background: getColor(i) }}
                />
              </div>
              <span className="text-[11px] font-mono text-gray-800 w-[52px] text-right shrink-0">
                {item.value.toLocaleString('ko-KR')}
              </span>
              <span className="text-[10px] text-gray-500 w-[30px] text-right shrink-0">
                {share}%
              </span>
            </div>
          );
        })}
      </div>

      {answer && (
        <div className="p-3 rounded-[10px] bg-gray-50 border border-gray-200">
          <div className="flex items-start gap-2">
            <span className="text-[11px] font-semibold text-blue-500 mt-0.5 shrink-0">AI</span>
            <p className="text-[12px] text-gray-700 leading-[1.6] whitespace-pre-wrap">{answer}</p>
          </div>
        </div>
      )}
    </div>
  );
}

const GROUP_CODE_MAP: Record<string, string> = {
  '01': '신한은행',
  '02': '신한카드',
  '03': '신한투자증권',
  '04': '신한라이프',
  '05': '슈퍼솔(앱)',
  '06': '신한캐피탈',
  '07': '신한저축은행',
  'bank': '신한은행',
  'card': '신한카드',
  'securities': '신한투자증권',
  'sec': '신한투자증권',
  'life': '신한라이프',
  'digital': '슈퍼솔(앱)',
  'app': '슈퍼솔(앱)',
};

function formatLabel(raw: string, colName: string): string {
  if (colName.includes('연령') || colName.includes('구간') || colName.includes('대')) {
    const num = parseInt(raw, 10);
    if (!isNaN(num)) {
      if (num >= 70) return `${num}대+`;
      return `${num}~${num + 4}세`;
    }
  }
  if (colName.includes('년월') && raw.length === 6) {
    return `${raw.slice(0, 4)}.${raw.slice(4)}`;
  }
  // Map group codes to company names
  if (colName.includes('계열') || colName.includes('그룹') || colName.includes('회사') ||
      colName.includes('사') || colName.includes('구분') || colName.includes('채널')) {
    const mapped = GROUP_CODE_MAP[raw.toLowerCase().trim()];
    if (mapped) return mapped;
  }
  return raw;
}

function getColor(index: number): string {
  const colors = [
    '#0064FF', '#00c471', '#f59e0b', '#ec4899',
    '#a78bfa', '#60a5fa', '#f97316', '#10b981',
    '#8b5cf6', '#f472b6', '#06b6d4', '#6b7280',
  ];
  return colors[index % colors.length];
}
