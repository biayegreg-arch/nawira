/* global self, caches */

const CACHE_NAME = 'nawira-shell-v1';
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
        ),
      // Spec-correct form: keep the worker alive until claim() resolves.
      self.clients.claim(),
    ]),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
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
            if (response.ok) {
              // Best-effort cache write — failures (quota, opaque responses) are
              // intentionally swallowed rather than surfacing as unhandled rejections.
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put(event.request, clone))
                .catch(() => {});
            }
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
          // Never cache navigations with a query string: magic-link routes like
          // /verify-email?email=...&code=... and /reset-password?email=...&code=...
          // carry live auth secrets in the query — caching them persists a secret
          // to disk indefinitely with no eviction hook.
          if (response.ok && url.search === '') {
            // Best-effort cache write — failures (quota, opaque responses) are
            // intentionally swallowed rather than surfacing as unhandled rejections.
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, clone))
              .catch(() => {});
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached || caches.match(OFFLINE_URL)),
        ),
    );
    return;
  }

  // Anything reaching here is a GET request that's neither a static asset nor a
  // navigation (e.g. Next.js App Router RSC payload fetches like
  // `GET /app/calendar?_rsc=...` issued during client-side navigation/prefetch).
  // Intentionally falls through to default network handling — do not add a
  // catch-all cache branch here.
});
