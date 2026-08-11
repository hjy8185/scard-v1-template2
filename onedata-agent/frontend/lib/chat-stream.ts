import type { SSEEvent } from './types';

let _sessionId: string | null = null;
export function getSessionId(): string {
  if (!_sessionId) {
    _sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  return _sessionId;
}

/**
 * Parse SSE stream from the BFF backend.
 * The backend sends newline-delimited JSON events with an optional "event:" prefix.
 *
 * Format:
 *   event: intent
 *   data: {"event_type":"intent","status":"active","data":{...}}
 *
 * Or simple newline-delimited JSON:
 *   {"event_type":"intent","status":"active","data":{...}}
 */
export async function* parseSSEStream(
  response: Response,
): AsyncGenerator<SSEEvent, void, unknown> {
  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentData = '';

      for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines (event boundary)
        if (!trimmed) {
          if (currentData) {
            try {
              const parsed = JSON.parse(currentData) as SSEEvent;
              yield parsed;
            } catch {
              // Skip malformed JSON
            }
            currentData = '';
          }
          continue;
        }

        // Handle "event:" prefix (ignore - we get type from data)
        if (trimmed.startsWith('event:')) {
          continue;
        }

        // Handle "data:" prefix
        if (trimmed.startsWith('data:')) {
          currentData = trimmed.slice(5).trim();
          continue;
        }

        // Try parsing as raw JSON line
        try {
          const parsed = JSON.parse(trimmed) as SSEEvent;
          yield parsed;
        } catch {
          // Not JSON, might be part of a multi-line data field
          if (currentData) {
            currentData += trimmed;
          }
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer.trim()) as SSEEvent;
        yield parsed;
      } catch {
        // Ignore trailing non-JSON
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Send a chat message and stream back SSE events.
 */
export interface ChatHistory {
  role: 'user' | 'assistant';
  content: string;
  sql?: string;
}

export async function sendChatMessage(
  query: string,
  onEvent: (event: SSEEvent) => void,
  onError: (error: Error) => void,
  onComplete: () => void,
  signal?: AbortSignal,
  history?: ChatHistory[],
): Promise<void> {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, session_id: getSessionId(), history: history?.slice(-6) }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Server error (${response.status}): ${errorText}`);
    }

    for await (const event of parseSSEStream(response)) {
      if (signal?.aborted) break;
      onEvent(event);
    }

    onComplete();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      onComplete();
      return;
    }
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
