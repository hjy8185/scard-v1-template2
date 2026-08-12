'use client';

import React from 'react';
import { Header } from './Header';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { DetailPanel } from '@/components/chat/DetailPanel';

export function AppLayout() {
  return (
    <div className="flex h-screen flex-col bg-ink-900">
      <Header />
      <main className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Panel - Chat */}
        <div className="flex w-[420px] min-w-[360px] flex-col border-r border-ink-600">
          <ChatPanel />
        </div>
        {/* Right Panel - Detail View */}
        <div className="flex flex-1 min-w-0 max-w-[560px] flex-col">
          <DetailPanel />
        </div>
      </main>
    </div>
  );
}
