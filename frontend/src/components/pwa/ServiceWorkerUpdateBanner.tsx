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
      className="fixed bottom-4 left-1/2 z-[200] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3 shadow-lg"
    >
      <RefreshCw size={18} className="shrink-0 text-primary" />
      <p className="flex-1 text-sm text-navy">Nouvelle version disponible.</p>
      <button
        type="button"
        onClick={onReload}
        className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white"
      >
        Recharger
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Fermer"
        className="shrink-0 text-muted-foreground"
      >
        <X size={16} />
      </button>
    </div>
  );
}
