'use client';

import React from 'react';
import { useAppContext } from '@/lib/context';

export function Header() {
  const { clearMessages, messages } = useAppContext();

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-ink-600 bg-ink-900/90 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-aqua to-jade flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-900">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-semibold text-pearl leading-tight">
              Onedata AI Agent
            </h1>
            <p className="text-[11px] text-mist leading-tight">
              신한금융그룹 데이터 플랫폼
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-ink-700 border border-ink-600">
          <span className="h-2 w-2 rounded-full bg-jade animate-pulse" />
          <span className="text-xs text-mist">Agent Ready</span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearMessages}
            className="px-3 py-1.5 text-xs text-mist hover:text-pearl rounded-lg bg-ink-700 border border-ink-600 hover:border-ink-600 transition-colors"
          >
            대화 초기화
          </button>
        )}
      </div>
    </header>
  );
}
