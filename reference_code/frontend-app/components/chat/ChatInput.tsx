'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
}

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [value, setValue] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  // auto-resize: 내용에 맞춰 높이 조정 (최대 ~6줄)
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 144)}px`;
  }, [value]);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue('');
  }, [value, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // R5a: Enter=전송, Shift+Enter=개행 (멀티라인 입력)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="flex gap-2 p-3" style={{ borderTop: '1px solid var(--ink-600)' }}>
      <textarea
        ref={taRef}
        rows={1}
        className="flex-1 resize-none rounded-[var(--r-md)] px-3 py-2.5 text-[15px] leading-relaxed outline-none transition-colors placeholder:opacity-60 disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          background: 'var(--ink-700)',
          color: 'var(--pearl)',
          border: '1px solid var(--ink-600)',
        }}
        placeholder="카드 혜택에 대해 질문하세요... (Shift+Enter 줄바꿈)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isLoading}
      />
      <Button size="icon" onClick={handleSend} disabled={isLoading || !value.trim()}>
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
