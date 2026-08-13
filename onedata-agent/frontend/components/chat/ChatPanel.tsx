'use client';

import React, { useEffect, useRef } from 'react';
import { useAppContext } from '@/lib/context';
import { ChatInput } from './ChatInput';
import { ChatMessage } from './ChatMessage';

const EXAMPLE_QUERIES = [
  '최근 각사별 슈퍼솔 MAU 동향을 알려줘',
  '지역별 카드회원 수와 슈퍼솔 미가입자 비율은?',
  '30~40대 카드회원의 최근 6개월 이용금액 변화 추이',
  '슈퍼솔 월방문횟수 기준 상위 고객의 연령대 분포',
];

export function ChatPanel() {
  const { messages, isStreaming, sendMessage, setSelectedMessage } = useAppContext();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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
      <div
        ref={scrollRef}
        className="flex flex-1 min-h-0 flex-col overflow-y-auto"
      >
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center p-6">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-blue-50 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-500">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  <path d="M8 10h.01M12 10h.01M16 10h.01" />
                </svg>
              </div>
              <h2 className="text-[18px] font-bold text-gray-900 mb-1">
                무엇이 궁금하세요?
              </h2>
              <p className="text-[13px] text-gray-500 max-w-[280px]">
                자연어로 질문하면 AI가 데이터를 조회하고 분석해 드려요.
              </p>
            </div>

            <div className="w-full max-w-[340px] space-y-2">
              {EXAMPLE_QUERIES.map((query, i) => (
                <button
                  key={i}
                  onClick={() => handleExampleClick(query)}
                  className="w-full text-left px-4 py-3 rounded-[12px] bg-white border border-gray-200 text-[13px] text-gray-700 hover:border-blue-300 hover:bg-blue-50/30 transition-all duration-150 shadow-card"
                >
                  {query}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-4">
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
              <div className="flex justify-start">
                <div className="flex items-center gap-2 px-4 py-3 rounded-[16px] bg-gray-50 border border-gray-100">
                  <div className="flex gap-1">
                    <span className="loading-dot h-2 w-2 rounded-full bg-blue-500" />
                    <span className="loading-dot h-2 w-2 rounded-full bg-blue-500" />
                    <span className="loading-dot h-2 w-2 rounded-full bg-blue-500" />
                  </div>
                  <span className="text-[12px] text-gray-500">분석 중...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="shrink-0">
        <ChatInput onSend={sendMessage} isLoading={isStreaming} />
      </div>
    </div>
  );
}
