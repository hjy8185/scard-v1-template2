'use client';

// U17 §1: 메시지 버블 — 사용자는 평문, 어시스턴트는 AnswerShell(3층: 본문/경로 한 줄/서랍 + 다음은?).
// 기존 상단 pill(VerifiedPathBadge/UnderstoodTokens)·하단 나열(Trace/Insight/Chain/Provenance)은
// AnswerShell/EvidenceDrawer로 통폐합 — 답변 하나에 하나의 주장.

import { cn } from '@/lib/utils';
import { AnswerShell } from './AnswerShell';
import type { MessageAnnotation, PlatformAnnotation } from '@/lib/types';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  annotation?: MessageAnnotation | PlatformAnnotation;
  onSuggestion?: (query: string) => void;
  messageId?: string;   // U40: 스크롤 앵커(data-message-id)
}

export function ChatMessage({ role, content, annotation, onSuggestion, messageId }: ChatMessageProps) {
  const isUser = role === 'user';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
      data-message-id={messageId} data-role={role}>
      <div
        className={cn(
          'rounded-[var(--r-md)] px-4 py-3',
          isUser ? 'max-w-[80%] text-sm' : 'max-w-[92%] text-[15px] leading-relaxed',
        )}
        style={
          isUser
            ? { background: 'var(--jade)', color: 'var(--ink-900)', fontWeight: 500 }
            : { background: 'var(--ink-800)', color: '#F3FAF8', border: '1px solid var(--ink-600)' }
        }
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <AnswerShell
            content={content}
            annotation={annotation as PlatformAnnotation | undefined}
            onSuggestion={onSuggestion}
          />
        )}
      </div>
    </div>
  );
}
