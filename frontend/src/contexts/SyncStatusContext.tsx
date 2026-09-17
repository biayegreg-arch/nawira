'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { drain, pendingCount as getPendingCount } from '@/lib/offline/queue';
import { backoffDelayMs } from '@/lib/offline/sync-logic';
import type { SyncStatus } from '@/lib/offline/types';

interface SyncStatusContextValue {
  status: SyncStatus;
  pendingCount: number;
  retryNow: () => void;
}

const SyncStatusContext = createContext<SyncStatusContextValue>({
  status: 'idle',
  pendingCount: 0,
  retryNow: () => {},
});

const SYNCED_BADGE_DURATION_MS = 3000;

export function SyncStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [pendingCount, setPendingCount] = useState(0);
  const attemptsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draining = useRef(false);

  const clearScheduledDrain = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const runDrain = useCallback(async () => {
    if (draining.current || typeof navigator === 'undefined' || !navigator.onLine) return;
    draining.current = true;
    setStatus((s) => (s === 'error' ? s : 'syncing'));
    try {
      const result = await drain();
      setPendingCount(result.remaining);
      if (result.remaining === 0) {
        attemptsRef.current = 0;
        if (result.synced > 0) {
          setStatus('synced');
          setTimeout(
            () => setStatus((s) => (s === 'synced' ? 'idle' : s)),
            SYNCED_BADGE_DURATION_MS,
          );
        } else {
          setStatus('idle');
        }
      } else if (result.failed > 0) {
        setStatus('error');
        clearScheduledDrain();
      } else {
        // Still offline mid-drain, or a retryable failure remains — back off.
        attemptsRef.current += 1;
        setStatus('offline');
        clearScheduledDrain();
        timerRef.current = setTimeout(() => void runDrain(), backoffDelayMs(attemptsRef.current));
      }
    } finally {
      draining.current = false;
    }
  }, [clearScheduledDrain]);

  const retryNow = useCallback(() => {
    attemptsRef.current = 0;
    clearScheduledDrain();
    void runDrain();
  }, [clearScheduledDrain, runDrain]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const count = await getPendingCount();
      if (cancelled) return;
      setPendingCount(count);
      if (count > 0) void runDrain();
    })();

    function handleOnline(): void {
      attemptsRef.current = 0;
      clearScheduledDrain();
      void runDrain();
    }
    function handleOffline(): void {
      clearScheduledDrain();
      setStatus((s) => (s === 'error' ? s : 'offline'));
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearScheduledDrain();
    };
  }, [clearScheduledDrain, runDrain]);

  return (
    <SyncStatusContext.Provider value={{ status, pendingCount, retryNow }}>
      {children}
    </SyncStatusContext.Provider>
  );
}

export function useSyncStatus(): SyncStatusContextValue {
  return useContext(SyncStatusContext);
}
