export interface ChatMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  timestamp: string;
}

interface MessageBubbleProps {
  message: ChatMessage;
  streaming?: boolean;
}

export function MessageBubble({
  message,
  streaming = false,
}: MessageBubbleProps): React.JSX.Element {
  const isUser = message.role === 'USER';

  if (isUser) {
    return (
      <div className="animate-fade-in-up flex justify-end gap-3">
        <div className="max-w-[85%] sm:max-w-sm lg:max-w-md">
          <div className="inline-block rounded-lg bg-primary p-4 text-sm text-white">
            {message.content}
          </div>
          <div className="mt-1 text-right text-xs text-muted-foreground">{message.timestamp}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up flex gap-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-soft">
        <span>🌸</span>
      </div>
      <div className="max-w-[85%] flex-1 sm:max-w-sm lg:max-w-md">
        <div className="inline-block rounded-lg bg-primary-soft p-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-navy">
            {message.content}
            {streaming && (
              <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-navy align-middle" />
            )}
          </p>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{message.timestamp}</div>
      </div>
    </div>
  );
}
