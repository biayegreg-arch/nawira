// Dedicated fetch + SSE-stream helper for POST /api/assistant/messages.
//
// Not routed through `@/lib/api`'s `api<T>()` wrapper: that wrapper parses
// a single JSON body and isn't stream-aware. This mirrors its request
// shape (CSRF header, credentials: 'include', 30s timeout) but reads the
// response as a `text/event-stream` instead.

import { API_URL, COOKIE_PREFIX } from './constants';

const CSRF_COOKIE_NAME = `${COOKIE_PREFIX}-csrf`;
const CSRF_STORAGE_KEY = `${COOKIE_PREFIX}-csrf`;

function getCsrfToken(): string | null {
  if (typeof window === 'undefined') return null;
  const fromStorage = localStorage.getItem(CSRF_STORAGE_KEY);
  if (fromStorage) return fromStorage;
  const escaped = CSRF_COOKIE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

export interface AssistantChatHistoryMessage {
  role: 'USER' | 'ASSISTANT';
  content: string;
}

export type AssistantChatErrorCode =
  | 'VALIDATION_FAILED'
  | 'ASSISTANT_QUOTA_EXCEEDED'
  | 'CONVERSATION_NOT_FOUND'
  | 'AI_NOT_CONFIGURED'
  | 'ASSISTANT_UPSTREAM_ERROR'
  | 'UNAUTHORIZED'
  | 'NETWORK_ERROR';

export class AssistantChatError extends Error {
  code: AssistantChatErrorCode;

  constructor(code: AssistantChatErrorCode, message: string) {
    super(message);
    this.name = 'AssistantChatError';
    this.code = code;
  }
}

export interface SendAssistantChatMessageResult {
  conversationId: string | null;
  messageId: string | null;
}

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Sends one chat message and streams the assistant's reply.
 * `onChunk` fires once per SSE `chunk` event with that chunk's text —
 * callers append it to a growing string for progressive rendering.
 * Resolves with the `done` event's payload once the stream closes.
 */
export async function sendAssistantChatMessage(
  message: string,
  history: AssistantChatHistoryMessage[],
  onChunk: (text: string) => void,
): Promise<SendAssistantChatMessageResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    const csrfToken = getCsrfToken();
    response = await fetch(`${API_URL}/api/assistant/messages`, {
      method: 'POST',
      credentials: 'include',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
      body: JSON.stringify({ message, history }),
    });
  } catch {
    clearTimeout(timeoutId);
    throw new AssistantChatError('NETWORK_ERROR', 'Impossible de joindre le serveur.');
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    let code: AssistantChatErrorCode = 'ASSISTANT_UPSTREAM_ERROR';
    if (response.status === 401 || response.status === 403) code = 'UNAUTHORIZED';
    else {
      try {
        const body = (await response.json()) as { error?: string };
        if (body.error) code = body.error as AssistantChatErrorCode;
      } catch {
        // Non-JSON error body — keep the generic upstream-error code.
      }
    }
    throw new AssistantChatError(code, `Request failed with status ${response.status}`);
  }

  if (!response.body) {
    throw new AssistantChatError('ASSISTANT_UPSTREAM_ERROR', 'Empty response body.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: SendAssistantChatMessageResult = { conversationId: null, messageId: null };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const rawEvent of events) {
      const lines = rawEvent.split('\n');
      let eventName = 'message';
      let dataLine: string | null = null;
      for (const line of lines) {
        if (line.startsWith('event: ')) eventName = line.slice('event: '.length);
        else if (line.startsWith('data: ')) dataLine = line.slice('data: '.length);
      }
      if (!dataLine) continue;

      if (eventName === 'done') {
        try {
          result = JSON.parse(dataLine) as SendAssistantChatMessageResult;
        } catch {
          // Malformed done payload — keep the default null/null result.
        }
      } else {
        try {
          const parsed = JSON.parse(dataLine) as { type: string; text?: string };
          if (parsed.type === 'chunk' && typeof parsed.text === 'string') {
            onChunk(parsed.text);
          }
        } catch {
          // Malformed chunk — skip it rather than throwing mid-stream.
        }
      }
    }
  }

  return result;
}
