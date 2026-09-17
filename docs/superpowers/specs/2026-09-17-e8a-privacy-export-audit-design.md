# E8 Part A — Data Export & Privacy/Security Audit Log — Design Spec

## 0. Scope of this spec

E8 (PRD §21: "Privacy & security — Export, delete, audit, hardening — P0") is split into two
sub-projects by risk, decided during brainstorming:

- **Part A (this spec):** data export (droit à la portabilité) + a user-facing
  privacy/security audit log. Both are read-only from the user's data perspective — the only
  writes are logging rows, nothing destructive.
- **Part B (separate spec, brainstormed after this one ships):** account deletion
  (droit à l'effacement) + general hardening. Deliberately deferred — deletion is
  irreversible and interacts with financial-record retention constraints (§1 below), so it
  gets its own dedicated design pass.

Nothing in this spec deletes, anonymizes, or mutates existing domain data. The only new
writes are `AccountActivity` rows (an append-only security/audit log).

## 1. Context found during brainstorming

- A `Consent` model already exists (`frontend/prisma/schema.prisma`), tracking
  `type` (`ACCOUNT | HEALTH_DATA | ASSISTANT_HISTORY | NOTIFICATIONS | ANALYTICS`),
  `version`, `grantedAt`, `revokedAt` — matches PRD §12's C01-C05. No read endpoint exists
  for it yet (only written during onboarding).
- `Withdrawal.userId` and `AdminAction.actorId` are `onDelete: Restrict` in the schema — a
  hard `User` delete is already blocked at the database level for anyone with withdrawal or
  admin-action history. This confirms the PRD's own QA case (§20: "Suppression compte →
  Données supprimées/**anonymisées** selon politique") anticipated anonymization over literal
  deletion — relevant context for Part B, not actioned here.
- No export/deletion/audit code exists anywhere in the codebase today — this is greenfield.
- `/settings` (`frontend/src/app/settings/page.tsx`) already exists (password/OAuth-linking
  UI, shipped in a prior session) and is the natural home for this spec's UI, though page
  design itself is fork-owned per CLAUDE.md's headless-by-design stance — this spec covers
  the API surface only.
- `frontend/src/lib/server/oauth/google.ts` and its route handlers
  (`frontend/src/app/api/auth/oauth/google/{start,callback}/route.ts`) are PROTECTED files
  per CLAUDE.md. The user explicitly approved, during brainstorming, adding exactly one
  non-invasive `logAccountActivity(...)` call inside the callback route's existing success
  path — no other line in that file changes. This is called out again in Task-level detail
  in the implementation plan so the executing agent doesn't have to re-derive consent.

## 2. Data export

### Endpoint

`GET /api/account/export` — `requireAuth`, no request body, no CSRF (GET is exempt per this
project's CSRF policy — only mutating verbs require `x-csrf-token`).

Response: `200`, `Content-Type: application/json`,
`Content-Disposition: attachment; filename="nawira-export-<YYYY-MM-DD>.json"`, body is a
single JSON object assembled in one read-only Prisma query batch (`Promise.all`, no
transaction needed — this is a snapshot read, not a write that needs isolation):

```json
{
  "exportedAt": "2026-09-17T12:00:00.000Z",
  "user": { "id": "...", "email": "...", "name": "...", "createdAt": "..." },
  "profile": { "...": "Profile row, or null" },
  "consents": [{ "type": "HEALTH_DATA", "version": 1, "grantedAt": "...", "revokedAt": null }],
  "periodEvents": [ "..." ],
  "cycles": [ "..." ],
  "dailyLogs": [ "..." ],
  "symptomLogs": [ "..." ],
  "fertilitySignals": [ "..." ],
  "predictions": [ "..." ],
  "insights": [ "..." ],
  "notifications": [ "..." ],
  "notificationPreferences": { "...": "or null" },
  "orders": [{ "id": "...", "amount": 1000, "currency": "XOF", "status": "PAID", "createdAt": "...", "paidAt": "..." }],
  "withdrawals": [{ "id": "...", "amount": 1000, "currency": "XOF", "status": "COMPLETED", "createdAt": "..." }],
  "assistantConversations": [ "..." ]
}
```

Field-level rules:
- `orders`/`withdrawals`: only user-facing fields (id, amount, currency, status, timestamps,
  destination method type if present). Never include `providerChargeId`, `providerPayoutId`,
  `idempotencyKey`, or any provider secret — those are internal correlation IDs, not personal
  data the user needs back, and leaking them widens the replay/lookup surface.
  `metadata`/`destination.accountName`/`destination.phone` are included (the user's own
  payout details, self-evidently theirs).
- `assistantConversations` (with nested `messages`): included **only if** the user currently
  has an active (non-revoked) `Consent` row of `type: 'ASSISTANT_HISTORY'`. If no such
  consent, the key is present but an empty array — the export shape stays stable regardless
  of consent state, only the content is gated. This mirrors the app's existing behavior
  (conversations aren't persisted at all without that consent, per E9/assistant work earlier
  this project — if there's nothing in the DB, the query returns `[]` naturally; the explicit
  consent check here is defense-in-depth documentation, not a second gate the code must
  invent from nothing).
- `AccountActivity` and `AdminAction` rows are **not** included in the export itself — they
  live in the separate `GET /api/account/privacy` endpoint (§3). The export is "your data";
  the privacy page is "what happened to your account," a different question with different
  pagination/volume needs.

### Rate limit

New helper `frontend/src/lib/server/account/export-rate-limit.ts`, modeled directly on
`frontend/src/lib/server/middleware/rate-limit-by-userid.ts` (admin's per-userId limiter) —
same `RedisRateLimitStore` usage, same fail-open-dev/fail-closed-prod semantics, different
constants:

```ts
const EXPORT_PREFIX = 'rl:export:userid:';
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_HITS = 3;
```

`enforceExportRateLimit(userId: string): Promise<NextResponse | null>` — same signature shape
as `enforceAdminRateLimit`, same 429 body shape (`{ error: 'TOO_MANY_REQUESTS', message }`,
`Retry-After`/`X-RateLimit-*` headers), same `RATE_LIMIT_BACKEND_UNAVAILABLE` 503 in
production when Redis is absent. This is a new, separate file — not a parameterized version
of the admin one, matching this codebase's established pattern of small purpose-built rate
limiters (see `rate-limit-by-email.ts` vs `rate-limit-by-userid.ts`: two files, not one
generic one).

### Side effect

On a successful export (after assembling the response, before returning it), call
`logAccountActivity(prisma, { userId: auth.user.sub, type: 'DATA_EXPORTED', ip, userAgent })`
(§3's helper).

## 3. Privacy & security audit log

### New Prisma model

```prisma
model AccountActivity {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      String // LOGIN | PASSWORD_CHANGED | PASSWORD_SET | OAUTH_LINKED | DATA_EXPORTED
  ip        String?
  userAgent String?
  metadata  Json?
  createdAt DateTime @default(now())

  @@index([userId, createdAt])
}
```

`onDelete: Cascade` (not `Restrict`/`SetNull` like the financial/audit models) — this is a
user-facing convenience log, not a compliance-retention record; if the account is ever
deleted (Part B), its own activity history should go with it. Add the reciprocal relation
field to `User`:

```prisma
  accountActivity        AccountActivity[]
```

placed alongside the other one-to-many relations in `model User` (after `adminActions`, before
the multi-tenancy block).

### Logging helper

New file `frontend/src/lib/server/account/activity.ts`, directly mirroring
`frontend/src/lib/server/admin/audit.ts`'s shape:

```ts
/**
 * User-facing account activity log. Call after any security-relevant
 * self-service action so the /settings privacy page can show it back to
 * the user ("was this really me?").
 *
 *   await logAccountActivity(prisma, {
 *     userId: auth.user.sub,
 *     type: 'PASSWORD_CHANGED',
 *     ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
 *     userAgent: req.headers.get('user-agent') ?? undefined,
 *   });
 *
 * Type naming: stable uppercase strings, the /settings UI switches on them
 * directly — do not rename an existing type once shipped.
 */
import type { Prisma, PrismaClient } from '@prisma/client';

export type AccountActivityType =
  | 'LOGIN'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_SET'
  | 'OAUTH_LINKED'
  | 'DATA_EXPORTED';

export interface AccountActivityInput {
  userId: string;
  type: AccountActivityType;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export type AccountActivityClient = Pick<PrismaClient, 'accountActivity'>;

export async function logAccountActivity(
  prisma: AccountActivityClient,
  input: AccountActivityInput,
): Promise<void> {
  await prisma.accountActivity.create({
    data: {
      userId: input.userId,
      type: input.type,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      metadata: (input.metadata ?? null) as unknown as Prisma.InputJsonValue,
    },
  });
}
```

### Call sites (5 total)

1. **`POST /api/auth/login`** (`frontend/src/app/api/auth/login/route.ts`, NOT protected) —
   after step 8 (`recordSuccess` + `setAuthCookies`), before returning the `200`:
   `type: 'LOGIN'`.
2. **`POST /api/auth/set-password`** (NOT protected) — after the password hash is persisted
   and cookies re-issued: `type: 'PASSWORD_SET'`.
3. **`POST /api/auth/change-password`** (NOT protected) — after the new hash is persisted:
   `type: 'PASSWORD_CHANGED'`.
4. **`GET /api/auth/oauth/google/callback`** (PROTECTED — user-approved single-line addition
   only) — after the existing find-or-create-user + cookie-issuing success path, add exactly
   one line: `await logAccountActivity(prisma, { userId: user.id, type: 'OAUTH_LINKED', ip, userAgent })`
   using whatever `ip`/`userAgent`/`prisma`/`user` bindings already exist at that point in the
   function — do not introduce new variables or restructure control flow to fit this in. If
   the existing success path has no single point covering both "first-time link" and
   "returning OAuth login," log at whichever point the file already treats as "authentication
   succeeded" (mirroring where `setAuthCookies` is called) — do not distinguish
   link-vs-login for this pass, `OAUTH_LINKED` covers both (login via an already-linked
   Google account is, functionally, using that link).
5. **`GET /api/account/export`** (this spec, §2) — `type: 'DATA_EXPORTED'`.

`ip`/`userAgent` extraction at each non-protected call site:
```ts
const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
const userAgent = req.headers.get('user-agent') ?? undefined;
```

Fire-and-forget is **not** acceptable here (unlike, say, a best-effort cache write) — always
`await` the call before returning the response, but never let a logging failure block the
actual auth/export success response. Wrap in a try/catch that logs a warning
(`log.warn('account activity log failed', { err, userId, type })`) and continues — a missing
activity-log row is a minor gap, but failing a login because the audit insert failed would be
a real availability regression.

### Read endpoint

`GET /api/account/privacy` — `requireAuth`, no CSRF (GET).

```json
{
  "consents": [{ "type": "HEALTH_DATA", "version": 1, "grantedAt": "...", "revokedAt": null }],
  "activity": [{ "type": "LOGIN", "createdAt": "...", "ip": "...", "userAgent": "..." }]
}
```

`consents`: full history for the user (`prisma.consent.findMany({ where: { userId }, orderBy: { grantedAt: 'desc' } })`)
— consent history is inherently small (≤5 types × a handful of grant/revoke cycles), no
pagination needed.

`activity`: most recent 50 rows (`take: 50, orderBy: { createdAt: 'desc' }`) — capped, no
pagination in this pass (YAGNI; a heavy user hitting 50 rows of login/password/export events
is already an edge case, and this is a "recent activity" glance view, not a full audit export
— the full history remains queryable directly via Prisma/admin tooling if ever needed for a
support request).

## 4. Testing

- `frontend/src/lib/server/account/activity.test.ts` — unit tests for `logAccountActivity`,
  mirroring `frontend/src/lib/server/admin/audit.test.ts`'s structure (mock Prisma client,
  assert `create` called with the right shape, including the `null` defaults for
  omitted `ip`/`userAgent`/`metadata`).
- `frontend/src/lib/server/account/export-rate-limit.test.ts` — mirrors whatever test
  structure exists for `rate-limit-by-userid.ts` (check for a companion test file at
  implementation time; if none exists, write one covering: under-limit passes, over-limit
  returns 429 with correct headers, Redis-absent dev vs prod behavior).
- `frontend/src/app/api/account/export/route.test.ts` — auth required (401 without),
  correct JSON shape with all expected top-level keys, `assistantConversations` empty when
  no `ASSISTANT_HISTORY` consent, populated when consent present, rate-limit enforcement
  (4th call in a window returns 429), `Content-Disposition` header present, an
  `AccountActivity` row with `type: 'DATA_EXPORTED'` is created on success.
- `frontend/src/app/api/account/privacy/route.test.ts` — auth required, returns both
  `consents` and `activity`, activity capped at 50 and ordered newest-first.
- Extend existing route tests to assert an `AccountActivity` row is created on success:
  `frontend/src/app/api/auth/login/route.test.ts` (add one assertion to an existing
  success-path test, don't duplicate the whole test),
  `frontend/src/app/api/auth/set-password/route.test.ts`,
  `frontend/src/app/api/auth/change-password/route.test.ts`, and — if a test file exists —
  `frontend/src/app/api/auth/oauth/google/callback/route.test.ts` (check at implementation
  time; if the protected callback route has no existing test file, do not create one as part
  of this spec — adding test infrastructure for a protected file is out of scope here, note
  it as a gap rather than inventing new protected-file test coverage unprompted).

## 5. Explicitly out of scope (Part B)

Account deletion, PII anonymization, cascading-delete orchestration around the
`Withdrawal`/`AdminAction` `onDelete: Restrict` constraints, and general "hardening" (rate-limit
gaps, security headers, dependency audit, session invalidation policy, or whatever else Part
B's own brainstorming settles on) — none of it is touched by this spec or its implementation
plan.
