// Full-page <a> navigation, not next/link — GET /api/auth/oauth/google/start
// 302s to Google, so this must be a real browser navigation, not client-side
// routing. `next` is echoed back by the callback route once same-origin
// validated (see start/route.ts); /onboarding/welcome is a safe default
// even for returning users since its layout bounces hasProfile=true
// sessions straight to /app/today.
import { cn } from '@/lib/utils';

interface GoogleAuthButtonProps {
  next?: string;
  className?: string;
}

export function GoogleAuthButton({
  next = '/onboarding/welcome',
  className,
}: GoogleAuthButtonProps): React.JSX.Element {
  return (
    <a
      href={`/api/auth/oauth/google/start?next=${encodeURIComponent(next)}`}
      className={cn(
        'inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-white px-5 py-3 text-sm font-semibold text-navy transition-colors hover:bg-gray-50',
        className,
      )}
    >
      <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
        <path
          fill="#FFC107"
          d="M43.6 20.5H42V20.5H24v7h11.3c-1.6 4.5-5.9 7.7-11.3 7.7-6.9 0-12.5-5.6-12.5-12.5S17.1 10.2 24 10.2c3.2 0 6 1.2 8.2 3.1l5.2-5.2C34.1 5 29.3 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.4-.3-3.5z"
        />
        <path
          fill="#FF3D00"
          d="m6.3 14.7 5.8 4.2C13.6 15.4 18.4 12.2 24 12.2c3.2 0 6 1.2 8.2 3.1l5.2-5.2C34.1 6.9 29.3 4.8 24 4.8c-7.6 0-14.2 4.3-17.7 10.7z"
        />
        <path
          fill="#4CAF50"
          d="M24 45.8c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.2-7.2 2.2-5.4 0-10-3.6-11.6-8.5l-6 4.6C9.7 40.9 16.3 45.8 24 45.8z"
        />
        <path
          fill="#1976D2"
          d="M43.6 20.5H42V20.5H24v7h11.3c-.8 2.3-2.3 4.2-4.2 5.5l6.2 5.2C40.9 35.4 45 30.2 45 24c0-1.2-.1-2.4-.4-3.5z"
        />
      </svg>
      Continuer avec Google
    </a>
  );
}
