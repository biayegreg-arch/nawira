'use client';

import { WifiOff, RefreshCw, Check, AlertCircle } from 'lucide-react';
import { useSyncStatus } from '@/contexts/SyncStatusContext';

export function SyncStatusIndicator(): React.JSX.Element | null {
  const { status, retryNow } = useSyncStatus();

  if (status === 'idle') return null;

  if (status === 'offline') {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-soft px-3 py-1.5 text-xs font-medium text-amber">
        <WifiOff size={13} />
        Hors ligne
      </span>
    );
  }

  if (status === 'syncing') {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-border bg-gray-50 px-3 py-1.5 text-xs font-medium text-muted-foreground">
        <RefreshCw size={13} className="animate-spin" />
        Synchronisation…
      </span>
    );
  }

  if (status === 'synced') {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-green-200 bg-green-soft px-3 py-1.5 text-xs font-medium text-green">
        <Check size={13} />
        Synchronisé
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={retryNow}
      className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700"
    >
      <AlertCircle size={13} />
      Échec de synchronisation
    </button>
  );
}
