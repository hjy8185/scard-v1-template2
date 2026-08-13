'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { formatTimestamp } from '@/lib/utils';
import { ReasoningTrace } from './ReasoningTrace';
import { DrillDownSuggestions } from './DrillDownSuggestions';
import type { ChatMessage as ChatMessageType } from '@/lib/types';

interface ChatMessageProps {
  message: ChatMessageType;
  onClick?: () => void;
  onDrillDown?: (query: string) => void;
}

function getMainContent(content: string): string {
  const idx = content.indexOf('\u{1F4A1}');
  if (idx === -1) return content;
  return content.slice(0, idx).trim();
}

function getInsightSuggestions(content: string): string[] {
  const idx = content.indexOf('\u{1F4A1}');
  if (idx === -1) return [];
  const block = content.slice(idx);
  const afterColon = block.indexOf(':');
  if (afterColon === -1) return [];
  const rest = block.slice(afterColon + 1).trim();
  return rest
    .split(/\n-\s*|[\/,]/)
    .map(s => s.replace(/^[-•]\s*/, '').trim())
    .filter(s => s.length > 1 && s.length < 50);
}

export function ChatMessage({ message, onClick, onDrillDown }: ChatMessageProps) {
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
          'rounded-[16px] px-4 py-3 transition-all duration-150',
          isUser
            ? 'max-w-[85%] bg-blue-500 text-white'
            : 'max-w-[92%] bg-white border border-gray-200 text-gray-900 shadow-card cursor-pointer hover:shadow-elevated hover:border-blue-200',
          !isUser && message.error && 'border-red-200 bg-red-50',
        )}
      >
        {isUser ? (
          <div>
            <p className="text-[14px] whitespace-pre-wrap leading-relaxed">{message.content}</p>
            <p className="text-[10px] text-white/60 mt-1 text-right">
              {formatTimestamp(message.timestamp)}
            </p>
          </div>
        ) : (
          <div>
            {message.reasoning && message.reasoning.length > 0 && (
              <ReasoningTrace steps={message.reasoning} compact />
            )}

            {message.content && (
              <div className="mt-2">
                <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-gray-800">
                  {getMainContent(message.content)}
                </p>
                {getInsightSuggestions(message.content).length > 0 && onDrillDown && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {getInsightSuggestions(message.content).map((s, i) => (
                      <button
                        key={i}
                        onClick={(e) => { e.stopPropagation(); onDrillDown(s); }}
                        className="text-[11px] px-2.5 py-1 rounded-full bg-blue-50 text-blue-500 font-medium hover:bg-blue-100 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {message.error && !message.content && (
              <div className="flex items-start gap-2 text-red-500 text-[13px]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <span>{message.error}</span>
              </div>
            )}

            {message.sql && (
              <div className="mt-2 flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-500 text-[11px] font-medium">
                  SQL
                </span>
                {message.queryResults && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-500 text-[11px] font-medium">
                    {message.queryResults.rowCount}건
                  </span>
                )}
              </div>
            )}

            {message.queryResults && message.queryResults.rows.length > 0 && onDrillDown && (
              <DrillDownSuggestions message={message} onSelect={onDrillDown} />
            )}

            <p className="text-[10px] text-gray-400 mt-2">
              {formatTimestamp(message.timestamp)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
