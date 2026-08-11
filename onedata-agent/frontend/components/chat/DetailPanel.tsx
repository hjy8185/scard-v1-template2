'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { useAppContext } from '@/lib/context';
import { ReasoningTraceDetail } from './ReasoningTrace';
import { SqlDisplay } from './SqlDisplay';
import { ResultTable } from './ResultTable';
import { ReportChart } from './ReportChart';
import { OntologyView } from '@/components/graph/OntologyView';

type TabId = 'reasoning' | 'sql' | 'results' | 'report' | 'ontology';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  enabled: boolean;
}

export function DetailPanel() {
  const { selectedMessage, detailView, setDetailView } = useAppContext();

  const tabs: Tab[] = [
    {
      id: 'reasoning',
      label: '처리 과정',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
      ),
      enabled: !!selectedMessage?.reasoning,
    },
    {
      id: 'sql',
      label: 'SQL',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 7V4a2 2 0 0 1 2-2h8.5L20 7.5V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      ),
      enabled: !!selectedMessage?.sql,
    },
    {
      id: 'results',
      label: '결과',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="15" x2="21" y2="15" />
          <line x1="9" y1="3" x2="9" y2="21" />
          <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
      ),
      enabled: !!(selectedMessage?.queryResults && selectedMessage.queryResults.rows.length > 0),
    },
    {
      id: 'report',
      label: '리포트',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
      enabled: !!(selectedMessage?.queryResults && selectedMessage.queryResults.rows.length > 1),
    },
    {
      id: 'ontology',
      label: '온톨로지',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <circle cx="4" cy="6" r="2" />
          <circle cx="20" cy="6" r="2" />
          <circle cx="4" cy="18" r="2" />
          <circle cx="20" cy="18" r="2" />
          <line x1="9.5" y1="10.5" x2="5.5" y2="7.5" />
          <line x1="14.5" y1="10.5" x2="18.5" y2="7.5" />
          <line x1="9.5" y1="13.5" x2="5.5" y2="16.5" />
          <line x1="14.5" y1="13.5" x2="18.5" y2="16.5" />
        </svg>
      ),
      enabled: true,
    },
  ];

  // Empty state when no message is selected
  if (!selectedMessage) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <div className="text-center max-w-[300px]">
          <div className="mx-auto mb-4 h-20 w-20 rounded-2xl bg-ink-800 border border-ink-600 flex items-center justify-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-ink-600">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h3 className="text-base font-medium text-mist mb-2">상세 보기</h3>
          <p className="text-sm text-slate leading-relaxed">
            왼쪽 채팅에서 질문을 하면 AI 에이전트의 처리 과정, 생성된 SQL, 조회 결과를 이곳에서 확인할 수 있습니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Tab Bar */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-0 border-b border-ink-600">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => tab.enabled && setDetailView(tab.id)}
            disabled={!tab.enabled}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium rounded-t-lg transition-all duration-200 border-b-2',
              detailView === tab.id
                ? 'text-aqua border-aqua bg-ink-800/50'
                : tab.enabled
                  ? 'text-mist border-transparent hover:text-pearl hover:bg-ink-700/30'
                  : 'text-slate/50 border-transparent cursor-not-allowed',
            )}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {detailView === 'reasoning' && selectedMessage.reasoning && (
          <ReasoningTraceDetail steps={selectedMessage.reasoning} />
        )}
        {detailView === 'sql' && selectedMessage.sql && (
          <SqlDisplay
            sql={selectedMessage.sql}
            executionMs={selectedMessage.queryResults?.executionMs}
          />
        )}
        {detailView === 'results' && selectedMessage.queryResults && (
          <ResultTable result={selectedMessage.queryResults} />
        )}
        {detailView === 'report' && selectedMessage.queryResults && (
          <ReportChart result={selectedMessage.queryResults} answer={selectedMessage.content} />
        )}
        {detailView === 'ontology' && (
          <OntologyView context={selectedMessage.reasoning} tablesUsed={
            selectedMessage.tablesUsed ||
            selectedMessage.reasoning?.find(s => s.id === 'sql_generate')?.data?.tables_used as string[] | undefined
          } />
        )}
      </div>
    </div>
  );
}
