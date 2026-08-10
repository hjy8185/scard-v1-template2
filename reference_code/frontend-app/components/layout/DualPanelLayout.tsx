'use client';

import { useState, type ReactNode } from 'react';

interface DualPanelLayoutProps {
  header: ReactNode;
  leftPanel: ReactNode;
  rightPanel: ReactNode;
  footer: ReactNode;
}

export function DualPanelLayout({
  leftPanel,
  rightPanel,
  header,
  footer,
}: DualPanelLayoutProps) {
  // U6: 42/58 비대칭(자산 쇼케이스 우세). U13 R5a: max-lg에서 hidden 대신 하단 시트로 접근 가능.
  const [sheetOpen, setSheetOpen] = useState(false);
  return (
    <div className="flex h-screen flex-col" style={{ color: 'var(--pearl)' }}>
      {/* header가 시나리오 목록으로 길어져도 화면(main)을 밀지 않도록 max-height+내부 스크롤 */}
      <header
        className="shrink-0 overflow-y-auto px-4 py-3"
        style={{
          maxHeight: '38vh',
          borderBottom: '1px solid var(--ink-600)',
          background: 'rgba(12,19,25,0.72)',
          backdropFilter: 'blur(8px)',
        }}
      >
        {header}
      </header>
      <main className="flex flex-1 min-h-0 overflow-hidden">
        <div className="w-[42%] flex flex-col min-h-0 max-lg:w-full" style={{ borderRight: '1px solid var(--ink-600)' }}>
          {leftPanel}
        </div>
        {/* 대형 화면: 우측 패널 */}
        <div className="w-[58%] flex flex-col max-lg:hidden" style={{ background: 'rgba(12,19,25,0.55)', backdropFilter: 'blur(6px)' }}>
          {rightPanel}
        </div>
      </main>

      {/* R5a: 소형 화면 하단 시트(지도 접근 가능) — hidden 대신 */}
      <button
        onClick={() => setSheetOpen(true)}
        className="hidden max-lg:block fixed bottom-16 right-4 z-40 rounded-[var(--r-pill)] px-4 py-2 text-[13px] font-medium"
        style={{ background: 'var(--flow)', color: '#06121a' }}
        aria-label="자산 지도 열기"
      >
        ◈ 자산 지도
      </button>
      {sheetOpen && (
        <div className="hidden max-lg:flex fixed inset-0 z-50 flex-col" style={{ background: 'rgba(7,11,14,0.96)' }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--ink-600)' }}>
            <span className="text-sm font-medium">자산 지도</span>
            <button onClick={() => setSheetOpen(false)} aria-label="닫기" style={{ color: 'var(--mist)' }}>✕</button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">{rightPanel}</div>
        </div>
      )}

      <footer className="px-4 py-2" style={{ borderTop: '1px solid var(--ink-600)', background: 'rgba(12,19,25,0.72)' }}>
        {footer}
      </footer>
    </div>
  );
}
