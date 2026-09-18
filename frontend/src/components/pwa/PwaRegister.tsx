'use client';

import { useEffect, useState } from 'react';
import { ServiceWorkerUpdateBanner } from './ServiceWorkerUpdateBanner';
import { track } from '@/lib/analytics';

export function PwaRegister(): React.JSX.Element | null {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [updateCount, setUpdateCount] = useState(0);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        if (registration.waiting) {
          setWaitingWorker(registration.waiting);
          setUpdateCount((n) => n + 1);
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setWaitingWorker(newWorker);
              setUpdateCount((n) => n + 1);
            }
          });
        });
      })
      // SW registration failing (Firefox private browsing, enterprise policy, ...) is
      // an expected, non-actionable condition — the app must keep working without it.
      .catch(() => {});

    // Capture controller state BEFORE attaching the listener: clients.claim() during
    // the very first activate() fires controllerchange on an already-loaded, previously
    // uncontrolled page. Only a page that already had a controller is a genuine update.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded || !hadController) return;
      reloaded = true;
      window.location.reload();
    });

    // Only observed here, not intercepted — event.preventDefault() is
    // deliberately NOT called, so the browser's native install-prompt UI
    // still shows normally. This pass just measures its occurrence.
    function handleBeforeInstallPrompt(): void {
      track('pwa_install_prompt_shown', {});
    }
    function handleAppInstalled(): void {
      track('pwa_installed', {});
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (!waitingWorker) return null;

  return (
    <ServiceWorkerUpdateBanner
      key={updateCount}
      onReload={() => waitingWorker.postMessage({ type: 'SKIP_WAITING' })}
    />
  );
}
