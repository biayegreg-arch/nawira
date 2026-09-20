'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { ChatPanel } from '@/components/assistant/ChatPanel';
import { TopicsChipRow, TopicsSidebar } from '@/components/assistant/TopicsPanel';
import type { ChatMessage } from '@/components/assistant/MessageBubble';
import {
  sendAssistantChatMessage,
  AssistantChatError,
  type AssistantChatHistoryMessage,
} from '@/lib/assistant-chat';

const MAX_STORED_MESSAGES = 50;
const MAX_HISTORY_CONTENT_CHARS = 4000;

interface StoredChat {
  conversationId: string | null;
  messages: ChatMessage[];
}

function storageKey(userId: string): string {
  return `assistant-chat:${userId}`;
}

function loadStoredChat(userId: string): StoredChat {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return { conversationId: null, messages: [] };
    const parsed = JSON.parse(raw) as StoredChat;
    return {
      conversationId: parsed.conversationId ?? null,
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    };
  } catch {
    return { conversationId: null, messages: [] };
  }
}

function saveStoredChat(userId: string, chat: StoredChat): void {
  try {
    const trimmed: StoredChat = {
      conversationId: chat.conversationId,
      messages: chat.messages.slice(-MAX_STORED_MESSAGES),
    };
    localStorage.setItem(storageKey(userId), JSON.stringify(trimmed));
  } catch {
    // Storage full or unavailable (private browsing) — the chat still
    // works for this session, it just won't survive a reload.
  }
}

function nowLabel(): string {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function buildHistoryForApi(messages: ChatMessage[]): AssistantChatHistoryMessage[] {
  return messages.slice(-MAX_STORED_MESSAGES).map((m) => ({
    role: m.role,
    content: m.content.slice(0, MAX_HISTORY_CONTENT_CHARS),
  }));
}

export default function AssistantPage(): React.JSX.Element | null {
  const user = useUser();
  const { toast } = useToast();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [prefillText, setPrefillText] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const loadedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user || loadedForUserRef.current === user.id) return;
    loadedForUserRef.current = user.id;
    const stored = loadStoredChat(user.id);
    setMessages(stored.messages);
    conversationIdRef.current = stored.conversationId;
  }, [user]);

  const handleSend = useCallback(
    (text: string) => {
      if (!user || sending || quotaExceeded) return;

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'USER',
        content: text,
        timestamp: nowLabel(),
      };
      const assistantMessageId = `assistant-${Date.now()}`;
      const assistantPlaceholder: ChatMessage = {
        id: assistantMessageId,
        role: 'ASSISTANT',
        content: '',
        timestamp: nowLabel(),
      };

      const historyForApi = buildHistoryForApi(messages);
      const nextMessages = [...messages, userMessage, assistantPlaceholder];
      setMessages(nextMessages);
      setSending(true);
      setStreamingMessageId(assistantMessageId);

      let accumulated = '';

      sendAssistantChatMessage(text, historyForApi, (chunk) => {
        accumulated += chunk;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMessageId ? { ...m, content: accumulated } : m)),
        );
      })
        .then((result) => {
          if (result.conversationId) conversationIdRef.current = result.conversationId;
          setMessages((prev) => {
            const final = prev.map((m) =>
              m.id === assistantMessageId ? { ...m, content: accumulated } : m,
            );
            saveStoredChat(user.id, { conversationId: conversationIdRef.current, messages: final });
            return final;
          });
        })
        .catch((err: unknown) => {
          const code = err instanceof AssistantChatError ? err.code : 'ASSISTANT_UPSTREAM_ERROR';

          if (code === 'ASSISTANT_QUOTA_EXCEEDED') {
            setQuotaExceeded(true);
            setMessages((prev) => {
              const withoutPlaceholder = prev.filter((m) => m.id !== assistantMessageId);
              saveStoredChat(user.id, {
                conversationId: conversationIdRef.current,
                messages: withoutPlaceholder,
              });
              return withoutPlaceholder;
            });
            return;
          }

          if (code === 'UNAUTHORIZED') {
            toast('Ta session a expiré, reconnecte-toi.', 'error');
            setMessages((prev) => {
              const withoutPlaceholder = prev.filter((m) => m.id !== assistantMessageId);
              saveStoredChat(user.id, {
                conversationId: conversationIdRef.current,
                messages: withoutPlaceholder,
              });
              return withoutPlaceholder;
            });
            return;
          }

          const errorText =
            code === 'AI_NOT_CONFIGURED'
              ? "L'assistant n'est pas encore configuré. Réessaie plus tard."
              : 'Une erreur est survenue, réessaie.';
          if (code !== 'AI_NOT_CONFIGURED') toast(errorText, 'error');

          setMessages((prev) => {
            const final = prev.map((m) =>
              m.id === assistantMessageId ? { ...m, content: errorText } : m,
            );
            saveStoredChat(user.id, { conversationId: conversationIdRef.current, messages: final });
            return final;
          });
        })
        .finally(() => {
          setSending(false);
          setStreamingMessageId(null);
        });
    },
    [user, sending, quotaExceeded, messages, toast],
  );

  if (!user) return null;

  return (
    <div className="px-4 py-6 sm:px-6 lg:p-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-3 text-2xl font-bold leading-tight text-navy md:text-3xl">
          <span className="text-2xl md:text-3xl">🌸</span>
          Assistant NAWIRA
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pose-moi tes questions et reçois des conseils adaptés à ton cycle
        </p>
      </div>

      <div className="mb-4 md:hidden">
        <TopicsChipRow onTopicClick={setPrefillText} />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_280px]">
        <ChatPanel
          messages={messages}
          onSend={handleSend}
          sending={sending}
          streamingMessageId={streamingMessageId}
          quotaExceeded={quotaExceeded}
          prefillText={prefillText}
          onPrefillConsumed={() => setPrefillText(null)}
        />
        <div className="hidden md:sticky md:top-6 md:block md:self-start">
          <TopicsSidebar onTopicClick={setPrefillText} />
        </div>
      </div>
    </div>
  );
}
