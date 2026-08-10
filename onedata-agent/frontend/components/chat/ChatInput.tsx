'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
}

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 144)}px`;
  }, [value]);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setValue('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, onSend, isLoading]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="border-t border-ink-600 p-4 bg-ink-900/50">
      <div className="flex items-end gap-3">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder="데이터에 대해 질문하세요... (Shift+Enter: 줄바꿈)"
            className="w-full resize-none rounded-xl px-4 py-3 text-sm leading-relaxed outline-none transition-all duration-200 bg-ink-800 text-pearl border border-ink-600 placeholder:text-slate focus:border-aqua/50 focus:ring-1 focus:ring-aqua/20 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <Button
          variant="primary"
          size="icon"
          onClick={handleSend}
          disabled={isLoading || !value.trim()}
          className="shrink-0 h-11 w-11 rounded-xl"
        >
          {isLoading ? (
            <svg className="h-4 w-4 animate-spin-slow" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="20" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-slate text-center">
        AI가 Onedata 온톨로지를 기반으로 SQL을 자동 생성합니다
      </p>
    </div>
  );
}
