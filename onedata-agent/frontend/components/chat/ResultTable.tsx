'use client';

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { QueryResult } from '@/lib/types';

interface ResultTableProps {
  result: QueryResult;
}

const PAGE_SIZE = 20;

export function ResultTable({ result }: ResultTableProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const totalPages = Math.ceil(result.rows.length / PAGE_SIZE);

  const sortedRows = useMemo(() => {
    if (!sortColumn) return result.rows;
    return [...result.rows].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal);
      const bStr = String(bVal);
      return sortDirection === 'asc'
        ? aStr.localeCompare(bStr, 'ko')
        : bStr.localeCompare(aStr, 'ko');
    });
  }, [result.rows, sortColumn, sortDirection]);

  const pageRows = sortedRows.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-bold text-gray-900">조회 결과</h3>
          <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            {result.rowCount}건{result.executionMs !== undefined && ` · ${result.executionMs}ms`}
          </span>
        </div>
        {totalPages > 1 && (
          <span className="text-[11px] text-gray-500">{currentPage + 1}/{totalPages}</span>
        )}
      </div>

      <div className="rounded-[12px] border border-gray-200 overflow-hidden shadow-card">
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full data-table">
            <thead>
              <tr className="border-b border-gray-200">
                {result.columns.map((col) => (
                  <th
                    key={col}
                    onClick={() => handleSort(col)}
                    className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:text-gray-900 transition-colors bg-gray-50"
                  >
                    <div className="flex items-center gap-0.5">
                      <span>{col}</span>
                      {sortColumn === col && (
                        <span className="text-blue-500">
                          {sortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className={cn(
                    'border-b border-gray-100 hover:bg-blue-50/30 transition-colors',
                    rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50',
                  )}
                >
                  {result.columns.map((col) => (
                    <td key={col} className="px-3 py-2 text-[12px] text-gray-800 whitespace-nowrap">
                      <CellValue value={row[col]} column={col} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-3">
          <Button
            variant="ghost" size="sm"
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
          >
            ‹
          </Button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 5) pageNum = i;
            else if (currentPage < 3) pageNum = i;
            else if (currentPage > totalPages - 4) pageNum = totalPages - 5 + i;
            else pageNum = currentPage - 2 + i;
            return (
              <Button
                key={pageNum}
                variant={currentPage === pageNum ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setCurrentPage(pageNum)}
                className="w-7 h-7 text-[11px]"
              >
                {pageNum + 1}
              </Button>
            );
          })}
          <Button
            variant="ghost" size="sm"
            onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage === totalPages - 1}
          >
            ›
          </Button>
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
};

function formatAgeRange(code: string): string {
  const num = parseInt(code, 10);
  if (isNaN(num)) return code;
  if (num >= 70) return `${num}세+`;
  return `${num}~${num + 4}세`;
}

function formatNumber(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return String(value);
  return Math.round(num).toLocaleString('ko-KR');
}

function isNumericString(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value.trim());
}

function CellValue({ value, column }: { value: unknown; column?: string }) {
  if (value === null || value === undefined) {
    return <span className="text-gray-400 italic">-</span>;
  }
  if (typeof value === 'boolean') {
    return <span className={value ? 'text-green-600' : 'text-red-500'}>{value ? 'Y' : 'N'}</span>;
  }

  const strVal = String(value);

  // Map group/company codes to names
  if (column && (column.includes('계열') || column.includes('그룹') || column.includes('회사') ||
      column.includes('사') || column.includes('구분'))) {
    const mapped = GROUP_CODE_MAP[strVal.trim()];
    if (mapped) return <span className="font-medium">{mapped}</span>;
  }

  if (column && (column.includes('연령') || column.includes('나이') || column.includes('age')) &&
      (column.includes('구간') || column.includes('코드') || column.includes('대'))) {
    if (/^\d{2,3}$/.test(strVal)) {
      return <span>{formatAgeRange(strVal)}</span>;
    }
  }

  const isCodeColumn = column && (
    column.includes('년월') || column.includes('일자') || column.includes('날짜') ||
    column.includes('코드') || column.includes('번호')
  );

  if (!isCodeColumn && typeof value === 'number') {
    return <span className="font-mono text-blue-600">{formatNumber(value)}</span>;
  }
  if (!isCodeColumn && typeof value === 'string' && isNumericString(value)) {
    return <span className="font-mono text-blue-600">{formatNumber(value)}</span>;
  }

  return <span>{strVal}</span>;
}
