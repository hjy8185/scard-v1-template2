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
  enabled: boolean;
}

export function DetailPanel() {
  const { selectedMessage, detailView, setDetailView, messages } = useAppContext();

  const tabs: Tab[] = [
    { id: 'reasoning', label: '처리 과정', enabled: !!selectedMessage?.reasoning },
    { id: 'sql', label: 'SQL', enabled: !!selectedMessage?.sql },
    { id: 'results', label: '결과', enabled: !!(selectedMessage?.queryResults && selectedMessage.queryResults.rows.length > 0) },
    { id: 'report', label: '리포트', enabled: !!(selectedMessage?.queryResults && selectedMessage.queryResults.rows.length > 1) },
    { id: 'ontology', label: '온톨로지', enabled: true },
  ];

  if (!selectedMessage) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <div className="text-center max-w-[280px]">
          <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-gray-400">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h3 className="text-[15px] font-semibold text-gray-900 mb-1">상세 분석</h3>
          <p className="text-[13px] text-gray-500 leading-relaxed">
            질문을 하면 처리 과정, SQL, 결과를 이곳에서 확인할 수 있어요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Tab Bar */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-0 bg-white border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => tab.enabled && setDetailView(tab.id)}
            disabled={!tab.enabled}
            className={cn(
              'px-3 py-2 text-[12px] font-medium rounded-t-[8px] transition-all duration-150 border-b-2',
              detailView === tab.id
                ? 'text-blue-500 border-blue-500 bg-blue-50/50'
                : tab.enabled
                  ? 'text-gray-600 border-transparent hover:text-gray-900 hover:bg-gray-50'
                  : 'text-gray-300 border-transparent cursor-not-allowed',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
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
          <OntologyView
            context={selectedMessage.reasoning}
            tablesUsed={
              selectedMessage.tablesUsed ||
              selectedMessage.reasoning?.find(s => s.id === 'sql_generate')?.data?.tables_used as string[] | undefined
            }
            allMessages={messages}
          />
        )}
      </div>
    </div>
  );
}
