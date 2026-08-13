'use client';

import React from 'react';
import { Header } from './Header';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { DetailPanel } from '@/components/chat/DetailPanel';

export function AppLayout() {
  return (
    <div className="flex h-screen flex-col bg-bg-secondary">
      <Header />
      <main className="flex flex-1 min-h-0 overflow-hidden gap-0">
        {/* Left Panel - Chat */}
        <div className="flex w-[440px] min-w-[380px] flex-col bg-white border-r border-gray-200">
          <ChatPanel />
        </div>
        {/* Right Panel - Detail View */}
        <div className="flex flex-1 min-w-0 flex-col bg-bg-secondary">
          <DetailPanel />
        </div>
      </main>
    </div>
  );
}
