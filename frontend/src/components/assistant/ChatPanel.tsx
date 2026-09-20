'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Plus, Send } from 'lucide-react';
import { MessageBubble, type ChatMessage } from './MessageBubble';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  sending: boolean;
  streamingMessageId: string | null;
  quotaExceeded: boolean;
  prefillText: string | null;
  onPrefillConsumed: () => void;
}

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'ASSISTANT',
  content:
    'Bonjour 🌸 Je suis NAWIRA, ton assistant santé féminine. Je suis ici pour te donner des conseils adaptés à ton cycle, répondre à tes questions et t’accompagner quotidiennement.',
  timestamp: '',
};

const EXAMPLE_QUESTIONS = [
  'Pourquoi j’ai des douleurs à la poitrine en ce moment ?',
  'Que dois-je manger cette semaine ?',
  'Comment bien gérer mes règles abondantes ?',
];

/**
 * Renders in the page's normal scroll flow — no internal scroll container.
 * The `/app/*` shell has no bounded-height content area (every page just
 * lets the whole page scroll; see `.planning/banani/assistant.md`), so
 * fighting that with a fixed-height chat pane would be a page-specific
 * hack. Auto-scrolls the newest message into view instead.
 */
export function ChatPanel({
  messages,
  onSend,
  sending,
  streamingMessageId,
  quotaExceeded,
  prefillText,
  onPrefillConsumed,
}: ChatPanelProps): React.JSX.Element {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefillText) {
      setInput(prefillText);
      onPrefillConsumed();
    }
  }, [prefillText, onPrefillConsumed]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sending || quotaExceeded) return;
    onSend(trimmed);
    setInput('');
  }

  const disabled = sending || quotaExceeded;

  return (
    <div className="flex min-w-0 flex-col font-body">
      <div className="space-y-4">
        <MessageBubble message={WELCOME_MESSAGE} />

        {messages.length === 0 && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-soft">
              <span>💡</span>
            </div>
            <div className="min-w-0 max-w-[85%] flex-1 sm:max-w-sm lg:max-w-md">
              <div className="inline-block max-w-full rounded-lg bg-primary-soft p-3 sm:p-4">
                <p className="mb-3 text-sm font-medium text-navy">
                  Voici ce que tu peux me demander :
                </p>
                <div className="space-y-2">
                  {EXAMPLE_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => onSend(q)}
                      disabled={disabled}
                      className="min-h-12 w-full break-words rounded-md border border-border bg-white p-2 text-left text-sm font-medium text-primary transition-all duration-150 hover:bg-gray-50 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} streaming={m.id === streamingMessageId} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 mt-4 bg-background pb-2 lg:bottom-0 lg:mt-6">
        {quotaExceeded ? (
          <div className="rounded-lg border border-amber bg-amber-soft p-4 text-center text-sm font-medium text-navy">
            Tu as atteint ta limite de 10 messages aujourd’hui. Reviens demain !
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="border-t border-border pt-4">
            <div className="flex items-end gap-2 sm:gap-3">
              <button
                type="button"
                disabled
                aria-hidden="true"
                tabIndex={-1}
                className="hidden h-11 w-11 flex-shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground sm:flex"
              >
                <Plus size={18} />
              </button>
              <div className="flex min-h-12 min-w-0 flex-1 items-center rounded-md border border-border bg-gray-50 px-4 py-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Pose-moi une question..."
                  disabled={disabled}
                  className="min-w-0 flex-1 bg-transparent text-base text-navy outline-none placeholder:text-muted-light md:text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={disabled || !input.trim()}
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md bg-primary text-white transition-transform duration-150 active:scale-90 disabled:opacity-50 disabled:active:scale-100"
              >
                <Send size={18} />
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              NAWIRA peut faire des erreurs. Consulte un professionnel pour des questions médicales
              urgentes.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
