import Link from 'next/link';
import { type ReactNode } from 'react';

const TOTAL_STEPS = 11;

interface OnboardingLayoutProps {
  step: number;
  backHref?: string;
  children: ReactNode;
}

export function OnboardingLayout({
  step,
  backHref,
  children,
}: OnboardingLayoutProps): React.JSX.Element {
  const progress = Math.round((step / TOTAL_STEPS) * 100);

  return (
    <main className="flex min-h-dvh w-full flex-col bg-background px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:pt-8 md:pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          {backHref ? (
            <Link
              href={backHref}
              aria-label="Retour"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-navy hover:bg-primary-soft"
            >
              &larr;
            </Link>
          ) : (
            <span className="h-11 w-11 shrink-0" />
          )}
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
            {/* Inline style is required here: the width is a computed
                percentage that Tailwind's static class scanning cannot
                express (see Global Constraints — no inline style except
                for genuinely dynamic values). */}
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
