# E4 (part 3) — Offline Read Cache Design

## 1. Scope

Completes PRD Epic E4 for good — the last piece of §28.5 Offline:
"consultation du calendrier déjà synchronisé" and "consultation de
l'historique local autorisé." Parts 1 (PWA shell) and 2 (offline write
queue) are shipped; this closes the epic with zero remaining PRD gaps.

**In scope:** every `GET` call already made by the 6 pages that read
cycle/journal/fertility/profile data —
`/api/cycles`, `/api/predictions/current`, `/api/daily-logs/today`,
`/api/daily-logs/recent`, `/api/fertility-signals/today`,
`/api/fertility-signals/recent`, `/api/profile` — cached read-through in
IndexedDB, served from cache when a request fails with a genuine network
error (offline), never on a real HTTP error. Affected pages:
`/app/today`, `/app/calendar`, `/app/cycles`, `/app/log`,
`/app/baby`, `/app/baby/add-lh-test`.

**Out of scope:**
- **No new object store or dependency beyond E4 part 2's precedent.**
  Reuses the same hand-rolled IndexedDB approach in
  `frontend/src/lib/offline/db.ts` — a second object store (`readCache`,
  keyed by endpoint string) alongside part 2's `mutations` store, via an
  `onupgradeneeded` version bump (1 → 2).
- **No cache invalidation policy / TTL expiry.** PRD asks for viewing
  "déjà synchronisé" data while offline — it does not ask for the app to
  ever refuse to show data because it's "too old." Every successful live
  fetch overwrites the cached entry for that endpoint, so the cache is
  always exactly "the last time this device successfully talked to the
  server" — displayed via a relative timestamp (reusing the existing
  `frontend/src/lib/time-ago.ts`, already used by `NotificationBell`), not
  enforced as a freshness cutoff.
- **No per-parameter cache keys.** All 7 endpoints above are single-value
  per authenticated user with no query string in this app (`/today`,
  `/recent`, `/current` — confirmed by reading every call site) — the
  endpoint string alone is already a correct, collision-free cache key.
  A future paginated/filterable endpoint would need a different key
  scheme; not needed here.
- **No offline writes added or changed.** Part 2's queue is untouched.
