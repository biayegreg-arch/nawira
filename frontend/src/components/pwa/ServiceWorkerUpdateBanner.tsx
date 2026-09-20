'use client';

import { useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

interface ServiceWorkerUpdateBannerProps {
  onReload: () => void;
}

export function ServiceWorkerUpdateBanner({
  onReload,
}: ServiceWorkerUpdateBannerProps): React.JSX.Element | null {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-[200] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-2xl border border-border bg-white px-4 py-2 lg:bottom-4 shadow-lg"
    >
      <RefreshCw size={18} className="shrink-0 text-primary" />
      <p className="min-w-0 flex-1 text-sm text-navy">Nouvelle version disponible.</p>
      <button
        type="button"
        onClick={onReload}
        className="min-h-11 shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
      >
        Recharger
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Fermer"
        className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground"
      >
        <X size={16} />
      </button>
    </div>
  );
}
