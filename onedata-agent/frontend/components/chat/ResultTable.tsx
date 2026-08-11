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

  // Sort rows
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

  // Paginate
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
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-pearl">조회 결과</h3>
          <span className="text-xs text-mist bg-ink-700 px-2.5 py-1 rounded-full border border-ink-600">
            {result.rowCount}건
          </span>
          {result.executionMs !== undefined && (
            <span className="text-xs text-slate">
              {result.executionMs}ms
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {totalPages > 1 && (
            <span className="text-xs text-mist">
              {currentPage + 1} / {totalPages} 페이지
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-ink-600 overflow-hidden">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full data-table">
            <thead>
              <tr className="border-b border-ink-600">
                {result.columns.map((col) => (
                  <th
                    key={col}
                    onClick={() => handleSort(col)}
                    className="px-4 py-3 text-left text-xs font-semibold text-mist whitespace-nowrap cursor-pointer hover:text-pearl transition-colors bg-ink-800"
                  >
                    <div className="flex items-center gap-1">
                      <span>{col}</span>
                      {sortColumn === col && (
                        <span className="text-aqua">
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
                    'border-b border-ink-600/50 hover:bg-ink-700/30 transition-colors',
                    rowIdx % 2 === 0 ? 'bg-ink-900' : 'bg-ink-800/30',
                  )}
                >
                  {result.columns.map((col) => (
                    <td
                      key={col}
                      className="px-4 py-2.5 text-sm text-pearl whitespace-nowrap"
                    >
                      <CellValue value={row[col]} column={col} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 5) {
              pageNum = i;
            } else if (currentPage < 3) {
              pageNum = i;
            } else if (currentPage > totalPages - 4) {
              pageNum = totalPages - 5 + i;
            } else {
              pageNum = currentPage - 2 + i;
            }
            return (
              <Button
                key={pageNum}
                variant={currentPage === pageNum ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setCurrentPage(pageNum)}
                className="w-8 h-8"
              >
                {pageNum + 1}
              </Button>
            );
          })}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage === totalPages - 1}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Button>
        </div>
      )}
    </div>
  );
}

// Format age range code (010 -> 10~14세, 015 -> 15~19세, 070 -> 70세+)
function formatAgeRange(code: string): string {
  const num = parseInt(code, 10);
  if (isNaN(num)) return code;
  if (num >= 70) return `${num}세+`;
  return `${num}~${num + 4}세`;
}

// Format number: remove decimals, add thousand separators
function formatNumber(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return String(value);
  return Math.round(num).toLocaleString('ko-KR');
}

// Check if a value looks like a numeric string
function isNumericString(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value.trim());
}

// Cell value renderer
function CellValue({ value, column }: { value: unknown; column?: string }) {
  if (value === null || value === undefined) {
    return <span className="text-slate italic">NULL</span>;
  }
  if (typeof value === 'boolean') {
    return (
      <span className={value ? 'text-jade' : 'text-coral'}>
        {value ? 'true' : 'false'}
      </span>
    );
  }

  const strVal = String(value);

  // Age range code formatting
  if (column && (column.includes('연령') || column.includes('나이') || column.includes('age')) &&
      (column.includes('구간') || column.includes('코드') || column.includes('대'))) {
    if (/^\d{2,3}$/.test(strVal)) {
      return <span>{formatAgeRange(strVal)}</span>;
    }
  }

  // Number formatting (remove decimals, add thousand separators)
  if (typeof value === 'number') {
    return (
      <span className="font-mono text-amber">
        {formatNumber(value)}
      </span>
    );
  }
  if (typeof value === 'string' && isNumericString(value)) {
    return (
      <span className="font-mono text-amber">
        {formatNumber(value)}
      </span>
    );
  }

  return <span>{strVal}</span>;
}
