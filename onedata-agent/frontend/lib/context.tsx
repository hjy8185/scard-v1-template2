'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { ChatMessage, ReasoningStep, QueryResult, SSEEvent } from './types';
import { generateId } from './utils';
import { sendChatMessage } from './chat-stream';

// Default reasoning steps template
function createReasoningSteps(): ReasoningStep[] {
  return [
    { id: 'intent', label: 'Intent Analysis', labelKo: '의도 분석', status: 'pending' },
    { id: 'context', label: 'Context Retrieval', labelKo: '컨텍스트 검색', status: 'pending' },
    { id: 'sql', label: 'SQL Generation', labelKo: 'SQL 생성', status: 'pending' },
    { id: 'execution', label: 'Execution & Answer', labelKo: '실행 & 응답', status: 'pending' },
  ];
}

interface AppContextValue {
  messages: ChatMessage[];
  isStreaming: boolean;
  selectedMessage: ChatMessage | null;
  detailView: 'reasoning' | 'sql' | 'results' | 'ontology' | 'lineage';
  setDetailView: (view: 'reasoning' | 'sql' | 'results' | 'ontology' | 'lineage') => void;
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

        if (event.event_type === 'sql' && event.status === 'done' && event.data) {
          msg.sql = event.data.sql as string || event.data.query as string;
        }

        if (event.event_type === 'execution' && event.status === 'done' && event.data) {
          const results = event.data.results as Record<string, unknown>[] | undefined;
          const columns = event.data.columns as string[] | undefined;
          if (results && columns) {
            msg.queryResults = {
              columns,
              rows: results,
              rowCount: results.length,
              executionMs: event.ms,
            };
          }
        }

        if (event.event_type === 'answer' && event.status === 'done' && event.data) {
          msg.content = event.data.answer as string || event.data.text as string || '';
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

    sendChatMessage(content, handleEvent, handleError, handleComplete, abortController.signal);
  }, []);

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
