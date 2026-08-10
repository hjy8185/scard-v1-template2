'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { formatTimestamp } from '@/lib/utils';
import { ReasoningTrace } from './ReasoningTrace';
import type { ChatMessage as ChatMessageType } from '@/lib/types';

interface ChatMessageProps {
  message: ChatMessageType;
  onClick?: () => void;
}

export function ChatMessage({ message, onClick }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex animate-fade-in',
        isUser ? 'justify-end' : 'justify-start',
      )}
    >
      <div
        onClick={onClick}
        className={cn(
          'rounded-xl px-4 py-3 transition-all duration-200',
          isUser
            ? 'max-w-[85%] bg-gradient-to-r from-aqua/20 to-jade/20 border border-aqua/20 text-pearl'
            : 'max-w-[92%] bg-ink-800 border border-ink-600 text-pearl cursor-pointer hover:border-aqua/30',
          !isUser && message.error && 'border-coral/30',
        )}
      >
        {isUser ? (
          <div>
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            <p className="text-[10px] text-mist/60 mt-1 text-right">
              {formatTimestamp(message.timestamp)}
            </p>
          </div>
        ) : (
          <div>
            {/* Inline Reasoning Trace (compact) */}
            {message.reasoning && message.reasoning.length > 0 && (
              <ReasoningTrace steps={message.reasoning} compact />
            )}

            {/* Answer Content */}
            {message.content && (
              <div className="mt-2">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {message.content}
                </p>
              </div>
            )}

            {/* Error Display */}
            {message.error && !message.content && (
              <div className="flex items-start gap-2 text-coral text-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <span>{message.error}</span>
              </div>
            )}

            {/* SQL Badge */}
            {message.sql && (
              <div className="mt-2 flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-aqua/10 text-aqua text-[11px] border border-aqua/20">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 7V4a2 2 0 0 1 2-2h8.5L20 7.5V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  SQL 생성됨
                </span>
                {message.queryResults && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-jade/10 text-jade text-[11px] border border-jade/20">
                    {message.queryResults.rowCount}건
                  </span>
                )}
              </div>
            )}

            <p className="text-[10px] text-mist/60 mt-2">
              {formatTimestamp(message.timestamp)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
