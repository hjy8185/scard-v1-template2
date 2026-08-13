'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils';
import type { ReasoningStep } from '@/lib/types';

interface ReasoningTraceProps {
  steps: ReasoningStep[];
  compact?: boolean;
}

function StatusIcon({ status }: { status: ReasoningStep['status'] }) {
  switch (status) {
    case 'pending':
      return <div className="h-4 w-4 rounded-full border border-gray-300 bg-gray-100" />;
    case 'active':
      return (
        <div className="relative h-4 w-4">
          <div className="absolute inset-0 rounded-full bg-blue-100 animate-ping" />
          <div className="relative h-4 w-4 rounded-full bg-blue-100 border border-blue-400 flex items-center justify-center">
            <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
          </div>
        </div>
      );
    case 'done':
      return (
        <div className="h-4 w-4 rounded-full bg-green-50 border border-green-400 flex items-center justify-center">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-green-500">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      );
    case 'error':
      return (
        <div className="h-4 w-4 rounded-full bg-red-50 border border-red-400 flex items-center justify-center">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-red-500">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
      );
  }
}

export function ReasoningTrace({ steps, compact = false }: ReasoningTraceProps) {
  const [isExpanded, setIsExpanded] = useState(!compact);

  const completedCount = steps.filter((s) => s.status === 'done').length;
  const hasError = steps.some((s) => s.status === 'error');
  const isActive = steps.some((s) => s.status === 'active');
  const totalDuration = steps.reduce((sum, s) => sum + (s.durationMs || 0), 0);

  if (compact && !isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="flex items-center gap-2 text-[12px] text-gray-500 hover:text-gray-700 transition-colors"
      >
        <span className="flex items-center gap-1">
          {isActive ? (
            <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          ) : hasError ? (
            <span className="h-2 w-2 rounded-full bg-red-500" />
          ) : (
            <span className="h-2 w-2 rounded-full bg-green-500" />
          )}
          <span>
            {isActive ? '처리 중...' : hasError ? '오류 발생' : `${completedCount}단계 완료`}
          </span>
        </span>
        {totalDuration > 0 && (
          <span className="text-gray-400">{formatDuration(totalDuration)}</span>
        )}
        <span className="text-gray-400">▶</span>
      </button>
    );
  }

  return (
    <div className="space-y-0">
      {compact && (
        <button
          onClick={() => setIsExpanded(false)}
          className="flex items-center gap-2 text-[12px] text-gray-500 hover:text-gray-700 transition-colors mb-2"
        >
          <span>▼ 처리 과정</span>
          {totalDuration > 0 && (
            <span className="text-gray-400">{formatDuration(totalDuration)}</span>
          )}
        </button>
      )}

      <div className="relative">
        <div className="absolute left-[7px] top-4 bottom-4 w-[2px] bg-gray-200" />

        <div className="space-y-0">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className="relative flex items-start gap-3 py-2 pl-0 animate-fade-in"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="relative z-10 shrink-0">
                <StatusIcon status={step.status} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      'text-[13px] font-medium',
                      step.status === 'active' && 'text-blue-500',
                      step.status === 'done' && 'text-gray-900',
                      step.status === 'error' && 'text-red-500',
                      step.status === 'pending' && 'text-gray-400',
                    )}
                  >
                    {step.labelKo}
                  </span>
                  {step.durationMs !== undefined && step.status === 'done' && (
                    <span className="text-[11px] text-gray-400 shrink-0">
                      {formatDuration(step.durationMs)}
                    </span>
                  )}
                </div>
                {step.data && step.status === 'done' && (
                  <StepDataPreview step={step} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepDataPreview({ step }: { step: ReasoningStep }) {
  if (!step.data) return null;

  switch (step.id) {
    case 'intent':
      return (
        <p className="text-[11px] text-gray-500 mt-0.5 truncate">
          {(step.data.intent as string) || (step.data.description as string) || ''}
        </p>
      );
    case 'context':
      const tables = step.data.tables as string[] | undefined;
      const domainHint = step.data.domain_hint as string | undefined;
      if (tables && tables.length > 0) {
        return (
          <div className="flex flex-wrap gap-1 mt-1">
            {tables.slice(0, 3).map((t, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded bg-blue-50 text-[10px] text-blue-600">
                {t}
              </span>
            ))}
            {tables.length > 3 && (
              <span className="text-[10px] text-gray-400">+{tables.length - 3}</span>
            )}
          </div>
        );
      }
      if (domainHint) {
        return <p className="text-[11px] text-gray-500 mt-0.5">도메인: {domainHint}</p>;
      }
      return null;
    case 'sql_generate':
      const sqlTables = step.data.tables_used as string[] | undefined;
      return (
        <div className="mt-0.5">
          <p className="text-[11px] text-green-600">SQL 쿼리 생성 완료</p>
          {sqlTables && sqlTables.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {sqlTables.map((t, i) => (
                <span key={i} className="px-1.5 py-0.5 rounded bg-blue-50 text-[10px] text-blue-600">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    case 'execute':
      const rowCount = step.data.row_count as number | undefined;
      return rowCount !== undefined ? (
        <p className="text-[11px] text-green-600 mt-0.5">{rowCount}건 조회됨</p>
      ) : null;
    case 'answer':
      return <p className="text-[11px] text-green-600 mt-0.5">답변 생성 완료</p>;
    default:
      return null;
  }
}

export function ReasoningTraceDetail({ steps }: { steps: ReasoningStep[] }) {
  const totalDuration = steps.reduce((sum, s) => sum + (s.durationMs || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[15px] font-bold text-gray-900">처리 과정</h3>
        {totalDuration > 0 && (
          <span className="text-[13px] text-gray-500">총 {formatDuration(totalDuration)}</span>
        )}
      </div>

      <div className="relative">
        <div className="absolute left-[11px] top-6 bottom-6 w-[2px] bg-gray-200" />

        <div className="space-y-1">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={cn(
                'relative flex items-start gap-4 p-4 rounded-[12px] transition-all duration-200',
                step.status === 'active' && 'bg-blue-50 border border-blue-200',
                step.status === 'done' && 'bg-gray-50',
                step.status === 'error' && 'bg-red-50 border border-red-200',
              )}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="relative z-10 shrink-0 mt-0.5">
                <StatusIcon status={step.status} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'text-[13px] font-semibold',
                        step.status === 'active' && 'text-blue-600',
                        step.status === 'done' && 'text-gray-900',
                        step.status === 'error' && 'text-red-600',
                        step.status === 'pending' && 'text-gray-400',
                      )}
                    >
                      {step.labelKo}
                    </span>
                    <span className="text-[11px] text-gray-400">{step.label}</span>
                  </div>
                  {step.durationMs !== undefined && step.status === 'done' && (
                    <span className="text-[11px] text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                      {formatDuration(step.durationMs)}
                    </span>
                  )}
                </div>

                {step.data && step.status === 'done' && (
                  <StepDataDetail step={step} />
                )}

                {step.status === 'active' && (
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex gap-0.5">
                      <span className="loading-dot h-1.5 w-1.5 rounded-full bg-blue-500" />
                      <span className="loading-dot h-1.5 w-1.5 rounded-full bg-blue-500" />
                      <span className="loading-dot h-1.5 w-1.5 rounded-full bg-blue-500" />
                    </div>
                    <span className="text-[11px] text-blue-500">처리 중...</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepDataDetail({ step }: { step: ReasoningStep }) {
  if (!step.data) return null;

  switch (step.id) {
    case 'intent':
      return (
        <div className="mt-2 p-3 rounded-[8px] bg-white border border-gray-200">
          <p className="text-[12px] text-gray-700">
            <span className="text-gray-900 font-medium">의도:</span>{' '}
            {(step.data.intent as string) || (step.data.description as string) || JSON.stringify(step.data)}
          </p>
          {Array.isArray(step.data.entities) && (step.data.entities as string[]).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {(step.data.entities as string[]).map((e, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[11px] font-medium">
                  {e}
                </span>
              ))}
            </div>
          )}
          {!!step.data.confidence && (
            <p className="text-[11px] text-gray-500 mt-1">
              신뢰도: {Math.round((step.data.confidence as number) * 100)}%
            </p>
          )}
        </div>
      );
    case 'context':
      return (
        <div className="mt-2 p-3 rounded-[8px] bg-white border border-gray-200">
          {!!step.data.domain_hint && (
            <p className="text-[12px] text-gray-700">
              <span className="text-gray-900 font-medium">도메인:</span> {step.data.domain_hint as string}
            </p>
          )}
          {!!step.data.tables && (
            <div className="mt-2">
              <p className="text-[11px] text-gray-500 mb-1">관련 테이블</p>
              <div className="flex flex-wrap gap-1.5">
                {(step.data.tables as string[]).map((t, i) => (
                  <span key={i} className="px-2 py-1 rounded-[6px] bg-gray-100 text-[11px] text-gray-700">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    case 'sql_generate':
      return (
        <div className="mt-2 p-3 rounded-[8px] bg-white border border-gray-200">
          {!!step.data.explanation && (
            <p className="text-[12px] text-gray-600 mb-2">{step.data.explanation as string}</p>
          )}
          {!!step.data.tables_used && (
            <div>
              <p className="text-[11px] text-gray-500 mb-1">사용 테이블</p>
              <div className="flex flex-wrap gap-1.5">
                {(step.data.tables_used as string[]).map((t, i) => (
                  <span key={i} className="px-2 py-1 rounded-[6px] bg-blue-50 text-[11px] text-blue-600 font-medium">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
          {!!step.data.confidence && (
            <p className="text-[11px] text-gray-500 mt-1.5">
              신뢰도: {Math.round((step.data.confidence as number) * 100)}%
            </p>
          )}
        </div>
      );
    case 'execute':
      const rowCount = step.data.row_count as number | undefined;
      return (
        <div className="mt-2 p-3 rounded-[8px] bg-white border border-gray-200">
          <div className="flex items-center gap-3">
            {rowCount !== undefined && (
              <span className="text-[12px] text-green-600 font-medium">{rowCount}건 조회됨</span>
            )}
            {!!step.data.truncated && (
              <span className="text-[11px] text-orange-500">결과 일부 표시</span>
            )}
          </div>
        </div>
      );
    case 'answer':
      return (
        <div className="mt-2">
          <p className="text-[12px] text-green-600">답변이 생성되었습니다.</p>
        </div>
      );
    default:
      return (
        <pre className="mt-2 text-[11px] text-gray-600 overflow-x-auto">
          {JSON.stringify(step.data, null, 2)}
        </pre>
      );
  }
}
