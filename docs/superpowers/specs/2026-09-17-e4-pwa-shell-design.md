# E4 (part 1) — PWA Shell Design

## 1. Scope

Backend-free, client-only. Builds the installable "app shell" half of PRD
Epic E4 ("Journal & offline") — PRD §28.4 (PWA), the app-shell/
installability portions of §28.5 (Offline), and the storage-hygiene intent
of §28.6. The journal/logging UI itself (LOG01) already shipped in Phase 4
(`docs/superpowers/specs/2026-09-07-phase4-daily-journal-design.md`).

**Decomposition decision (confirmed with user, 2026-09-17):** E4's PRD
scope covers two materially different subsystems — an installable PWA
shell (this spec, lower risk, self-contained) and offline mutation
sync/conflict-resolution for health data (a separate, much larger and
riskier epic, deferred). This spec is part 1 only.

**In scope:**
- `frontend/src/app/manifest.ts` — Next.js 16 native manifest route.
- Real icon assets (192×192, 512×512, 512×512 maskable) generated via
  `next/og`'s `ImageResponse` (ships with Next.js, zero new dependency),
  committed to `frontend/public/icons/`.
- A hand-written service worker (`frontend/public/sw.js`) — no Workbox,
  no `next-pwa`/`@ducanh2912/next-pwa`.
- Cache-first for `/_next/static/*` (content-hashed, safe to cache
  indefinitely). Network-first-with-cache-fallback for HTML navigations
  (fresh when online, cached shell when offline after ≥1 prior visit).
- Zero interception of `/api/*` requests — the service worker's `fetch`
  handler explicitly passes these through untouched.
- A dedicated `/offline` route shown when a navigation fails with no
  cached match.
- A `ServiceWorkerUpdateBanner` component — persistent (not
  auto-dismissing like the existing `ToastContext`), shown when a new
  service worker is waiting, with a "Recharger" action.
- A small client component (`PwaRegister`) mounted in the root
  `app/layout.tsx` that registers the service worker.

**Out of scope (explicit deviations, decided with the user before writing
this spec):**
- **No offline mutation queue.** PRD §13.1's UUID/version/sync_state
  local-mutation model, retry queue, conflict resolution, and
  `prediction_version` invalidation are a separate, later epic — this
  spec adds zero offline write capability. `POST /api/period-events`,
  `PUT /api/daily-logs/today`, `PUT /api/fertility-signals/today` remain
  fully online-only; nothing about how they're called changes.
- **No offline data reads.** PRD §28.5 also lists "consultation du
  calendrier déjà synchronisé" as offline-available — confirmed with
  user (AskUserQuestion, 2026-09-17): out of scope for this pass. The
  service worker does not cache or serve any `/api/*` response. A user
  who loses connectivity mid-session sees the existing app UI attempt
  its normal fetches and fail exactly as it does today (existing error
  states in each page) unless they navigate to an un-cached route, in
  which case they see `/offline`.
- **No Workbox / `next-pwa`.** Confirmed with user: this codebase
  consistently hand-rolls infrastructure it can reason about directly
  (circuit breaker, leader-lease, outbox) rather than pulling
  general-purpose libraries — a runtime-caching-only SW (no build-time
  precache manifest to keep in sync with Next's content-hashed chunk
  names) is simple enough to hand-write and avoids composing a second
  webpack/build plugin alongside the existing `withSentryConfig` wrapper.
- **No `localStorage`/`IndexedDB` changes.** This app's auth tokens are
  already `httpOnly` cookies (PRD §28.6's "avoid storing sensitive
  elements in `localStorage`" requirement is already satisfied — nothing
  to change here). IndexedDB for offline health data is part of the
  deferred sync epic.
- **Real brand icons.** No NAWIRA icon asset exists anywhere in this
  repo today. Confirmed with user (AskUserQuestion): ship an honest
  placeholder (existing violet `#6C43C1` + a droplet symbol matching the
  sidebar's existing branding), explicitly flagged in this spec and in
  a code comment as a placeholder to replace with real brand assets
  before public launch — not a substitute for a real design pass.
- **Push notifications.** Out of scope — unrelated to installability;
  Phase 8 already ships in-app notifications, and Web Push is a distinct
  future capability if ever needed.

## 2. Manifest

`frontend/src/app/manifest.ts`:

```ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NAWIRA',
    short_name: 'NAWIRA',
    description: 'Comprends ton corps. Vis ta vie sereinement.',
    start_url: '/app/today',
    display: 'standalone',
    background_color: '#FDFBFD',
    theme_color: '#6C43C1',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
```

`background_color` matches the existing `--color-background` token
(`#FDFBFD`, see `globals.css`); `theme_color` matches the existing
`primary` token (`#6C43C1`). `start_url: '/app/today'` matches this
project's existing precedent (login/verify-email already redirect to
`/app/today` as the canonical post-auth landing page). Next.js serves
this route at `/manifest.webmanifest` automatically and links it in
every page's `<head>` — no manual `<link rel="manifest">` needed.

## 3. Icon generation (one-time script, output committed)

`frontend/scripts/generate-pwa-icons.tsx` — run once during
implementation, not at build time or request time. Uses `ImageResponse`
from `next/og` (ships with Next.js — no new dependency) to rasterize a
simple JSX shape to PNG:

```ts
import { ImageResponse } from 'next/og';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = join(process.cwd(), 'public/icons');

interface IconSpec {
  file: string;
  size: number;
  /** Maskable icons need ~10% safe-zone padding so OS icon masks don't clip the symbol. */
  padding: number;
}

const ICONS: IconSpec[] = [
  { file: 'icon-192.png', size: 192, padding: 0 },
  { file: 'icon-512.png', size: 512, padding: 0 },
  { file: 'icon-512-maskable.png', size: 512, padding: 51 }, // ~10% of 512
];

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const icon of ICONS) {
    const response = new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#6C43C1',
          }}
        >
          <div
            style={{
              width: icon.size - icon.padding * 2,
              height: icon.size - icon.padding * 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Droplet symbol — matches the existing sidebar branding
                (see frontend/src/components/app/AppSidebar.tsx's use of
                lucide-react's Droplet). PLACEHOLDER: replace with a real
                brand asset before public launch. */}
            <svg
              width={icon.size - icon.padding * 2}
              height={icon.size - icon.padding * 2}
              viewBox="0 0 24 24"
              fill="#FFFFFF"
            >
              <path d="M12 2C12 2 5 10.5 5 15a7 7 0 0 0 14 0c0-4.5-7-13-7-13z" />
            </svg>
          </div>
        </div>
      ),
      { width: icon.size, height: icon.size },
    );
    const buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync(join(OUT_DIR, icon.file), buffer);
    console.log(`wrote ${icon.file}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Run via `pnpm --filter frontend exec tsx scripts/generate-pwa-icons.tsx`
(the file needs a `.tsx` extension, not `.ts`, since it contains JSX —
name it `generate-pwa-icons.tsx`). Output PNGs are committed to
`frontend/public/icons/` like any other static asset — the script itself
is a one-time generator, not part of the build or runtime.

## 4. Service worker

`frontend/public/sw.js` (plain JS — service workers cannot be TypeScript
or ES modules without a bundler step this project doesn't have for
`public/`; kept deliberately small and dependency-free):

```js
const CACHE_NAME = 'nawira-shell-v1';
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

function isStaticAsset(url) {
  return url.pathname.startsWith('/_next/static/');
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept API calls — no offline data reads in this pass, and
  // this must not interfere with CSRF/refresh handling in lib/api.ts.
  if (url.pathname.startsWith('/api/')) return;
  if (event.request.method !== 'GET') return;

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            return response;
          }),
      ),
    );
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(
          () =>
            caches.match(event.request).then((cached) => cached || caches.match(OFFLINE_URL)),
        ),
    );
  }
});
```

Versioning: bumping `CACHE_NAME` (e.g. `nawira-shell-v2`) on a future
change is how old caches get evicted — the `activate` handler already
deletes any cache key that doesn't match the current `CACHE_NAME`. No
build-time precache manifest exists to keep in sync (deliberate, see §1)
— static assets and navigated pages are cached opportunistically as the
user visits them, not precached at install.

## 5. Registration + update flow

`frontend/src/components/pwa/PwaRegister.tsx` (new, client component,
mounted once in the root `app/layout.tsx` alongside the existing
`AuthProvider`/`ToastProvider`):

```tsx
'use client';

import { useEffect, useState } from 'react';
import { ServiceWorkerUpdateBanner } from './ServiceWorkerUpdateBanner';

export function PwaRegister(): React.JSX.Element | null {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').then((registration) => {
      if (registration.waiting) setWaitingWorker(registration.waiting);

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
          }
        });
      });
    });

    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  }, []);

  if (!waitingWorker) return null;

  return (
    <ServiceWorkerUpdateBanner
      onReload={() => waitingWorker.postMessage({ type: 'SKIP_WAITING' })}
    />
  );
}
```

`frontend/src/components/pwa/ServiceWorkerUpdateBanner.tsx` (new) — a
persistent, dismissible banner (fixed to the bottom of the viewport,
above `MobileBottomNav` z-index where relevant), distinct from
`ToastContext` because a toast auto-dismisses after 3s and this must
stay visible until the user acts or dismisses it:

```tsx
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
    <div className="fixed bottom-4 left-1/2 z-[200] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3 shadow-lg">
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
```

## 6. Offline fallback route

`frontend/src/app/offline/page.tsx` (new, static page, no auth gate —
must render even when every fetch would fail): a simple honest message
("Tu es hors ligne. Reconnecte-toi pour continuer.") with no data
dependency, styled consistently with `error.tsx`'s existing fallback
pattern. This is what the service worker's `fetch` handler falls back to
for an uncached navigation while offline (§4).

## 7. Root layout wiring

`frontend/src/app/layout.tsx` — add `<PwaRegister />` as a sibling
inside the existing `<AuthProvider><ToastProvider>{children}</ToastProvider></AuthProvider>`
tree (exact placement: outside `{children}`, so it mounts once for the
whole app regardless of route, matching how `ToastProvider`'s own toast
container already renders as a fixed-position overlay alongside
`{children}`).

## 8. Testing

Service workers have no real runtime under Vitest/jsdom — there is no
`self.addEventListener('fetch', ...)` to unit-test in that environment.
Honest testing plan:
- No unit tests for `sw.js` itself (it's plain browser-runtime JS with
  no build step, not TypeScript, not imported by anything Vitest can
  reach).
- `ServiceWorkerUpdateBanner` gets a normal Vitest/Testing-Library
  component test (renders, "Recharger" calls `onReload`, dismiss hides
  it) — this part IS a normal React component.
- `PwaRegister` is thin glue around `navigator.serviceWorker` — not
  unit-tested (mocking the entire Service Worker registration lifecycle
  for a ~20-line effect has poor cost/value; a real browser check
  verifies it, see below).
- **Real verification** (manual, browser-driven, part of the
  implementation plan's acceptance criteria, not automated): Chrome
  DevTools → Application tab confirms the manifest is valid and icons
  load, Lighthouse's PWA audit reports installable, toggling "Offline"
  in the Network tab and reloading `/app/today` (after one prior online
  visit) serves the cached shell instead of a browser error page, and
  navigating to a never-visited route while offline shows `/offline`.

## 9. Decisions log

- Split E4 into "PWA shell" (this spec) + a deferred "offline mutation
  sync" epic — confirmed with user (2026-09-17): the two have
  materially different risk profiles (installability is self-contained;
  health-data sync/conflict-resolution is cross-cutting and
  correctness-sensitive).
- Scope this pass to installability + faster repeat loads only, no
  offline data reads — confirmed with user: PRD §28.5's "consultation du
  calendrier déjà synchronisé" offline is deferred alongside the sync
  epic, not built here.
- Hand-written service worker, no Workbox/`next-pwa` — confirmed with
  user: matches this codebase's existing pattern of hand-rolling
  infrastructure it can fully reason about (circuit breaker,
  leader-lease, outbox) rather than adding a general-purpose caching
  library and composing a second build-time webpack plugin.
- Placeholder icons via `next/og`, explicitly flagged as pre-launch
  placeholders — confirmed with user: no real NAWIRA icon asset exists
  anywhere in the repo today; generating an honest, clearly-labeled
  placeholder is preferable to blocking this phase on a design asset
  that doesn't exist yet.

## 10. Out of scope reminder

The next epic (not part of this spec) is the offline mutation queue:
IndexedDB-backed local writes with UUID/version/sync_state, a persistent
retry queue with exponential backoff, last-write-wins conflict
resolution, `prediction_version`-based staleness invalidation, and the
`Hors ligne / Synchronisation… / Synchronisé / Échec de synchronisation`
UI states — all deferred, all requiring their own brainstorm → spec →
plan cycle given the correctness/security stakes of queuing health-data
mutations offline.
