'use client';

import React from 'react';
import { useAppContext } from '@/lib/context';

export function Header() {
  const { clearMessages, messages } = useAppContext();

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
      <div className="flex items-center gap-3">
        <img src="/logo_shinhan.svg" alt="신한금융그룹" className="h-8" />
        <div>
          <h1 className="text-[15px] font-bold text-gray-900 leading-tight">
            Onedata AI
          </h1>
          <p className="text-[11px] text-gray-500 leading-tight">
            데이터 분석 플랫폼
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 border border-green-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          <span className="text-[11px] text-green-500 font-medium">Ready</span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearMessages}
            className="px-3 py-1.5 text-[12px] text-gray-500 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors font-medium"
          >
            초기화
          </button>
        )}
      </div>
    </header>
  );
}
