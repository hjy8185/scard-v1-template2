'use client';

import React, { useEffect, useRef } from 'react';
import { useAppContext } from '@/lib/context';
import { ChatInput } from './ChatInput';
import { ChatMessage } from './ChatMessage';

const EXAMPLE_QUERIES = [
  '월 카드이용 200만원 이상 고객의 각사별 슈퍼솔 MAU 추이는?',
  '지역별 카드회원 중 슈퍼솔 미가입자 비율이 높은 시도 TOP5',
  '30~40대 카드only회원의 최근 6개월 이용금액 변화 추이',
  '슈퍼솔 월체류시간 상위 10% 고객의 카드 업종별 소비 패턴',
];

export function ChatPanel() {
  const { messages, isStreaming, sendMessage, setSelectedMessage } = useAppContext();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming]);

  const handleExampleClick = (query: string) => {
    sendMessage(query);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Messages Area */}
      <div
        ref={scrollRef}
        className="flex flex-1 min-h-0 flex-col overflow-y-auto"
      >
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center p-6">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-gradient-to-br from-aqua/20 to-jade/20 border border-aqua/20 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-aqua">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  <path d="M8 10h.01M12 10h.01M16 10h.01" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-pearl mb-1">
                Onedata AI Agent
              </h2>
              <p className="text-sm text-mist max-w-[300px]">
                자연어로 데이터를 조회하세요. AI가 SQL을 생성하고 결과를 분석합니다.
              </p>
            </div>

            <div className="w-full max-w-[360px] space-y-2">
              <p className="text-xs text-slate font-medium mb-2 text-center">예시 질문</p>
              {EXAMPLE_QUERIES.map((query, i) => (
                <button
                  key={i}
                  onClick={() => handleExampleClick(query)}
                  className="w-full text-left px-4 py-3 rounded-xl bg-ink-800 border border-ink-600 text-sm text-pearl/90 hover:bg-ink-700 hover:border-aqua/30 transition-all duration-200 group"
                >
                  <span className="text-aqua/60 group-hover:text-aqua mr-2">Q.</span>
                  {query}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1 p-4">
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                onClick={() => {
                  if (msg.role === 'assistant') {
                    setSelectedMessage(msg);
                  }
                }}
                onDrillDown={msg.role === 'assistant' ? (query) => sendMessage(query) : undefined}
              />
            ))}
            {isStreaming && (
              <div className="flex justify-start px-2 py-1">
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-ink-800 border border-aqua/20">
                  <div className="flex gap-1">
                    <span className="loading-dot h-2 w-2 rounded-full bg-aqua" />
                    <span className="loading-dot h-2 w-2 rounded-full bg-aqua" />
                    <span className="loading-dot h-2 w-2 rounded-full bg-aqua" />
                  </div>
                  <span className="text-xs text-aqua">처리 중...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="shrink-0">
        <ChatInput onSend={sendMessage} isLoading={isStreaming} />
      </div>
    </div>
  );
}
