'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { ChatMessage, ReasoningStep, QueryResult, SSEEvent } from './types';
import { generateId } from './utils';
import { sendChatMessage, type ChatHistory } from './chat-stream';

// Default reasoning steps template
function createReasoningSteps(): ReasoningStep[] {
  return [
    { id: 'intent', label: 'Intent Analysis', labelKo: '의도 분석', status: 'pending' },
    { id: 'context', label: 'Context Retrieval', labelKo: '컨텍스트 검색', status: 'pending' },
    { id: 'sql_generate', label: 'SQL Generation', labelKo: 'SQL 생성', status: 'pending' },
    { id: 'execute', label: 'Query Execution', labelKo: '쿼리 실행', status: 'pending' },
    { id: 'answer', label: 'Answer Composition', labelKo: '답변 생성', status: 'pending' },
  ];
}

interface AppContextValue {
  messages: ChatMessage[];
  isStreaming: boolean;
  selectedMessage: ChatMessage | null;
  detailView: 'reasoning' | 'sql' | 'results' | 'report' | 'ontology';
  setDetailView: (view: 'reasoning' | 'sql' | 'results' | 'report' | 'ontology') => void;
  setSelectedMessage: (msg: ChatMessage | null) => void;
  sendMessage: (content: string) => void;
  clearMessages: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [detailView, setDetailView] = useState<AppContextValue['detailView']>('reasoning');
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback((content: string) => {
    // Abort previous stream if any
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    const assistantId = generateId();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      reasoning: createReasoningSteps(),
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setIsStreaming(true);
    setSelectedMessage(assistantMessage);
    setDetailView('reasoning');

    const abortController = new AbortController();
    abortRef.current = abortController;

    const handleEvent = (event: SSEEvent) => {
      setMessages((prev) => {
        const updated = [...prev];
        const msgIndex = updated.findIndex((m) => m.id === assistantId);
        if (msgIndex === -1) return prev;

        const msg = { ...updated[msgIndex] };
        const reasoning = [...(msg.reasoning || createReasoningSteps())];

        // Update reasoning step
        const stepIndex = reasoning.findIndex((s) => s.id === event.event_type);
        if (stepIndex !== -1) {
          const step = { ...reasoning[stepIndex] };

          if (event.status === 'active') {
            step.status = 'active';
            step.startedAt = Date.now();
          } else if (event.status === 'done') {
            step.status = 'done';
            step.durationMs = event.ms;
            step.data = event.data;
          } else if (event.status === 'error') {
            step.status = 'error';
            step.data = event.data;
          }

          reasoning[stepIndex] = step;
        }

        // Extract specific data from events
        if (event.event_type === 'intent' && event.status === 'done' && event.data) {
          msg.reasoning = reasoning;
        }

        if (event.event_type === 'sql_generate' && event.status === 'done' && event.data) {
          msg.sql = event.data.sql as string;
        }

        if (event.event_type === 'execute' && event.status === 'done' && event.data) {
          // execution result comes partially here, full data in 'done' event
        }

        if (event.event_type === 'answer' && event.status === 'done' && event.data) {
          msg.content = event.data.content as string || event.data.answer as string || '';
        }

        if (event.event_type === 'done' && event.status === 'done' && event.data) {
          // Final event with full results
          const columns = event.data.columns as string[] | undefined;
          const rows = event.data.rows as Record<string, unknown>[] | undefined;
          if (columns && rows) {
            msg.queryResults = {
              columns,
              rows,
              rowCount: rows.length,
              executionMs: event.data.total_ms as number || 0,
            };
          }
          if (event.data.sql) {
            msg.sql = event.data.sql as string;
          }
          if (!msg.content && event.data.answer) {
            msg.content = event.data.answer as string;
          }
        }

        if (event.event_type === 'error') {
          msg.error = event.data?.message as string || '처리 중 오류가 발생했습니다.';
          msg.content = msg.error;
        }

        msg.reasoning = reasoning;
        updated[msgIndex] = msg;

        // Also update selected message
        setSelectedMessage(msg);

        return updated;
      });
    };

    const handleError = (error: Error) => {
      setMessages((prev) => {
        const updated = [...prev];
        const msgIndex = updated.findIndex((m) => m.id === assistantId);
        if (msgIndex === -1) return prev;

        const msg = { ...updated[msgIndex] };
        msg.error = error.message;
        msg.content = `오류: ${error.message}`;
        updated[msgIndex] = msg;
        setSelectedMessage(msg);
        return updated;
      });
      setIsStreaming(false);
    };

    const handleComplete = () => {
      setIsStreaming(false);
    };

    // Build conversation history for context
    const history: ChatHistory[] = messages
      .filter((m) => m.content)
      .map((m) => ({
        role: m.role,
        content: m.content,
        sql: m.sql,
      }));

    sendChatMessage(content, handleEvent, handleError, handleComplete, abortController.signal, history);
  }, [messages]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setSelectedMessage(null);
  }, []);

  return (
    <AppContext.Provider
      value={{
        messages,
        isStreaming,
        selectedMessage,
        detailView,
        setDetailView,
        setSelectedMessage,
        sendMessage,
        clearMessages,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
