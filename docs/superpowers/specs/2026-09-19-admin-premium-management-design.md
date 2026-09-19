# Admin Premium Management — Design Spec

## 0. Scope of this spec

The admin back-office (E11) lets a SUPERADMIN manage users, but has no way to grant, revoke,
or price premium access. This spec covers exactly three admin-facing capabilities, decided
during brainstorming:

1. **Grant / revoke a user's plan** (`FREE | PLUS | BABY`) from the admin panel, optionally
   time-bounded (auto-expires back to `FREE`).
2. **Admin-editable pricing** for the `PLUS` and `BABY` plans (FCFA amount only — plan name,
   promise, and feature list stay hardcoded product content, not admin-editable).
3. Surfacing both to the real `/app/billing` page, which today only displays hardcoded
   prices and has every purchase CTA permanently disabled ("Bientôt disponible").

**Explicitly out of scope for this spec** (confirmed during brainstorming):

- **No real payment flow.** No Bictorys recurring-charge integration, no self-service
  purchase, no renewal, no payment-failure handling. `/app/billing`'s CTAs stay disabled.
  This spec only makes the underlying `plan` field real and admin-controllable — a
  self-purchase flow is a separate, much larger future project.
- **No feature-gating enforcement.** `Profile.plan` becomes a real, admin-controlled value
  for the first time, but no route in the app is modified to actually *restrict* behavior
  based on it (cycle-history limits, Assistant access, basal-temperature tracking, etc. all
  stay universally available regardless of plan, exactly as today). Enforcing the
  FREE/PLUS/BABY entitlement matrix is a separate future project — auditing and modifying
  ~8-10 existing routes is real, separate work, and mixing "who has access" (this spec) with
  "what access unlocks" (a future spec) risks scope creep and regressions in shipped
  features.
- **No full plan-catalog editor.** Only the FCFA price is admin-editable. Name, promise, and
  feature list per plan remain in `frontend/src/components/billing/plans-data.ts` as static
  product content.

## 1. Context found during brainstorming

- `Profile.plan` (`frontend/prisma/schema.prisma`) already exists (`String @default("FREE")
  // FREE | PLUS | BABY`) but is **never mutated anywhere in the codebase** — no purchase
  flow, no webhook, no admin control. It is permanently stuck at `FREE` today.
- `frontend/src/app/app/billing/page.tsx` + `frontend/src/components/billing/{CurrentPlanCard,
  PremiumPlansGrid,plans-data}.tsx` already render the 3 plans with real PRD pricing
  (1000/2500 FCFA), but every "Subscribe" button is `disabled` and reads "Bientôt disponible"
  — the page's own FAQ copy says explicitly: *"Les offres payantes ne sont pas encore
  actives."* This page becomes the consumer of this spec's new public pricing endpoint but is
  otherwise untouched (still fully disabled CTAs).
- No server-side feature-gating exists anywhere keyed off `plan` — confirmed by grep across
  `frontend/src/lib/server/`.
- The official business-model reference (`NAWIRA_Modele_Economique_Reference_v2.md`, project
  memory) states prices "are hypotheses to validate via experimentation, not fixed prices"
  (§41-42) — this directly motivates making price admin-editable rather than a recompiled
  constant, independent of the admin-convenience angle.
- Admin conventions established across this session, reused as-is:
  - `requireAdmin('ADMIN')` / `requireSuperadmin()` middleware
  - `verifyCsrf(req)` on every mutating route
  - `logAdminAction(prisma | tx, {...})` on every admin mutation — non-negotiable per
    CLAUDE.md
  - Stable `{error: CODE, message}` error bodies
  - The `can: string[]` capability list from `GET /api/admin/me`
    (`CAPABILITIES_BY_ROLE`, currently a "locked" 12-item SUPERADMIN / 8-item ADMIN
    contract — already extended once this session for `users:delete`, same pattern applies)
- `frontend/src/lib/server/account/activity.ts` exports a closed `AccountActivityType`
  union (`LOGIN | PASSWORD_CHANGED | PASSWORD_SET | OAUTH_LINKED | DATA_EXPORTED |
  ACCOUNT_DELETED`) consumed by the user-facing `/settings` privacy/activity log (E8). This
  spec adds two new members: `PLAN_CHANGED`, `PLAN_EXPIRED`. The file's own docstring warns
  "do not rename an existing type once shipped" — additive-only change, no rename.
- Cron precedent: `frontend/src/app/api/cron/verification-cleanup/route.ts` is the template
  to follow — `verifyCronSecret(req)` gate, `withLease(redis, <name>, ttl, fn)` for
  multi-instance coordination, `runtime='nodejs'`, `maxDuration`, structured logging via
  `createLogger()`. `frontend/src/lib/server/observability/vercel-json-shape.test.ts` is a
  tripwire that asserts an **exact 7-item cron list** in `vercel.json` — adding an 8th cron
  requires updating that test's `toEqual` array and the "declares exactly 7" count to 8 (not
  a protected file, an intentional tripwire the project expects to grow).
- Money invariant (CLAUDE.md): FCFA amounts are always integers, never decimals — pricing
  input validation must enforce this.

## 2. Data model

```prisma
model Profile {
  // ...existing fields unchanged...
  plan          String    @default("FREE") // FREE | PLUS | BABY
  planExpiresAt DateTime? // null = permanent; set only via admin grant with an end date;
                          // cleared automatically by the plan-expiration cron on downgrade
}

model PricingPlan {
  id        String   @id @default(cuid())
  key       String   @unique // "PLUS" | "BABY" — FREE has no row (always 0 FCFA)
  priceFcfa Int      // integer FCFA, no decimals (CLAUDE.md money invariant)
  updatedAt DateTime @updatedAt
  updatedBy String?  // User.id of the admin who last changed it (denormalized convenience;
                      // the authoritative trail is still AdminAction)
}
```

A migration adds both fields/model and seeds `PricingPlan` with the two current values
(`PLUS` → 1000, `BABY` → 2500) so `/app/billing` keeps showing the same numbers until an
admin changes them — no visible behavior change on ship day.

## 3. Admin API surface

### 3.1 `PATCH /api/admin/users/[id]/plan`

SUPERADMIN-only (plan is an entitlement/privilege change, same tier as role — mirrors
`PATCH /api/admin/users/[id]/role`'s SUPERADMIN gate). `verifyCsrf` required.

Request body:

```json
{ "plan": "PLUS", "expiresAt": "2026-10-19T00:00:00.000Z" }
```

- `plan`: required, `'FREE' | 'PLUS' | 'BABY'`.
- `expiresAt`: optional ISO string. Only meaningful when `plan !== 'FREE'`. Must be a
  future date — a past/now date is rejected (`VALIDATION_FAILED`), not silently treated as
  "already expired". Omitted or `null` = permanent (no auto-downgrade).
- Providing `expiresAt` together with `plan: 'FREE'` is rejected as `VALIDATION_FAILED` (an
  expiry date is meaningless for a free plan — reject rather than silently ignore, so a
  confused caller finds out immediately).
- Setting `plan: 'FREE'` always writes `planExpiresAt: null` regardless of what was
  previously stored — revoking access must never leave a stale expiry date behind that a
  later re-grant could accidentally inherit.

Behavior:

- 404 `USER_NOT_FOUND` if the target doesn't exist.
- Idempotent no-op (200, no `AdminAction`/`AccountActivity` write) when the new `plan` AND
  `expiresAt` are unchanged from the current row — mirrors the status-change route's
  `T-03-06-08` audit-log-noise mitigation.
- On an actual change: single `prisma.$transaction` — update `Profile.plan` +
  `Profile.planExpiresAt`, then `logAdminAction(tx, { actorId, action: 'user.plan_change',
  targetType: 'User', targetId: id, metadata: { from, to, expiresAt } })`, then
  `logAccountActivity(tx, { userId: id, type: 'PLAN_CHANGED', metadata: { from, to,
  expiresAt } })` (per the confirmed decision: the user's own privacy/activity log shows
  this too, not just the internal admin audit trail).
- Response: `200 { "profile": { "plan": "PLUS", "planExpiresAt": "2026-10-19T00:00:00.000Z" } }`.

### 3.2 `GET /api/admin/pricing-plans`

`requireAdmin('ADMIN')` (read access for both tiers, matching every other admin list route).

Response: `200 { "plans": [{ "key": "PLUS", "priceFcfa": 1000, "updatedAt": "...", "updatedBy":
"admin@example.com" | null }, { "key": "BABY", "priceFcfa": 2500, ... }] }`. `updatedBy` is
resolved from `User.email` via a join for display (falls back to `null` if the admin account
was since deleted — never hard-fails the read).

### 3.3 `PATCH /api/admin/pricing-plans/[key]`

SUPERADMIN-only, `verifyCsrf` required. `key` path param restricted to `'PLUS' | 'BABY'` (404
`PLAN_NOT_FOUND` for anything else, including `'FREE'`).

Request body: `{ "priceFcfa": 1200 }` — Zod: positive integer, `min(0)`, `max(1_000_000)` as
a sanity ceiling (matches the project's general pattern of generous-but-bounded validation
rather than unbounded numeric input).

- Idempotent no-op if unchanged (same reasoning as 3.1).
- On change: `prisma.pricingPlan.update` (`priceFcfa`, `updatedBy: actorId`) +
  `logAdminAction(prisma, { action: 'pricing.update', targetType: 'PricingPlan', targetId:
  key, metadata: { from, to } })`. No `AccountActivity` write — this isn't a per-user event.
- Response: `200 { "plan": { "key": "PLUS", "priceFcfa": 1200, "updatedAt": "...", "updatedBy":
  "..." } }`.

### 3.4 `GET /api/pricing` (new, public, no auth)

Unauthenticated — pricing is not sensitive, and gating it behind login would block a future
pre-signup pricing page. `runtime='nodejs'` still required (project-wide invariant) even
though this route touches no auth/session state. No rate limiting beyond the existing global
IP limiter (read-only, cheap, no PII).

Response: `200 { "plans": [{ "key": "PLUS", "priceFcfa": 1000 }, { "key": "BABY", "priceFcfa":
2500 }] }`. Deliberately excludes `updatedAt`/`updatedBy` (internal admin metadata, no reason
to expose it publicly).

### 3.5 Capability list changes (`GET /api/admin/me`)

`CAPABILITIES_BY_ROLE`'s locked contract grows from 12→15 (SUPERADMIN) and 8→9 (ADMIN):

- `pricing:read` — both ADMIN and SUPERADMIN.
- `users:plan` — SUPERADMIN only.
- `pricing:write` — SUPERADMIN only.

The route's own docstring (`CAPABILITY LIST CONTRACT (D-ADMIN-04 — locked)`) gets updated in
the same edit, same as the `users:delete` precedent earlier this session.

## 4. Admin UI

### 4.1 `UserDetailModal.tsx` — new "Plan" section

A section distinct from the existing "Rôle" section (conceptually different — role is an
app-permission tier, plan is a monetization tier — even though both render as a `<select>`),
gated on `admin.can.includes('users:plan')`:

- `<select>`: `FREE | PLUS | BABY`, current value pre-selected.
- When the selected value ≠ `FREE`: a date input appears for `expiresAt` (optional — leaving
  it blank means permanent). Selecting `FREE` hides/clears the date input.
- A single "Enregistrer" button (unlike Role, which mutates on every `onChange` — plan needs
  an explicit save because of the paired `expiresAt` field, so an immediate `onChange` mutate
  would fire before the date is chosen).
- Success → toast + `onUpdated` callback patches the local row.
- Error codes mapped to French: `VALIDATION_FAILED` (expiry date in the past, or given with
  `FREE`), `USER_NOT_FOUND`.

### 4.2 New `/admin/pricing` page + nav entry

`admin-nav.ts` gains a 9th entry (`{ href: '/admin/pricing', label: 'Tarifs', icon: Tag,
available: true }`). Page layout matches the project's established list-page conventions but
is simpler (2 static rows, no pagination):

- Two cards (Plus, Projet Bébé), each showing the current FCFA price, last-updated
  timestamp + admin email, and — gated on `can.includes('pricing:write')` — an inline
  editable number input + "Enregistrer" button (no separate detail modal needed, the whole
  page is small enough to edit in place).
- ADMIN (non-SUPERADMIN) sees the same two cards read-only, no input/button rendered.
- Skeleton loading state on initial fetch, matching every other admin page shipped this
  session (shimmer, no spinner/plain text).

## 5. Expiration cron

New `frontend/src/app/api/cron/plan-expiration/route.ts`, structurally identical to
`verification-cleanup/route.ts`:

```ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let processed = 0;

    await withLease(redis ?? undefined, 'plan-expiration', LEASE_TTL_MS, async () => {
      const expired = await prisma.profile.findMany({
        where: { planExpiresAt: { lt: new Date() }, plan: { not: 'FREE' } },
        select: { userId: true, plan: true },
      });

      for (const p of expired) {
        await prisma.profile.update({
          where: { userId: p.userId },
          data: { plan: 'FREE', planExpiresAt: null },
        });
        await logAccountActivity(prisma, {
          userId: p.userId,
          type: 'PLAN_EXPIRED',
          metadata: { from: p.plan },
        });
      }

      processed = expired.length;
      log.info('plan-expiration tick', { processed, requestId: ctx.requestId });
    });

    return NextResponse.json(
      { ok: true, processed },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

No `AdminAction` write — no admin actor initiated this, it's a system event, matching the
`ACCOUNT_ACTIVITY`-only precedent for system-driven state changes. Scheduled hourly
(`0 * * * *`, matching `verification-cleanup`'s cadence — plan expiry isn't time-critical to
the minute). Added to `vercel.json`'s `crons` array and to
`vercel-json-shape.test.ts`'s exact-7 → exact-8 assertion (test file update, not a protected
file).

## 6. Error handling summary

| Code | Route | Cause |
|---|---|---|
| `USER_NOT_FOUND` | `PATCH .../plan` | target id doesn't exist |
| `VALIDATION_FAILED` | `PATCH .../plan` | invalid `plan` enum value; `expiresAt` in the past; `expiresAt` given with `plan: 'FREE'` |
| `PLAN_NOT_FOUND` | `PATCH .../pricing-plans/[key]` | `key` isn't `PLUS` or `BABY` |
| `VALIDATION_FAILED` | `PATCH .../pricing-plans/[key]` | `priceFcfa` not a positive integer, or exceeds the 1,000,000 ceiling |

## 7. Testing plan

Full unit-test coverage mirroring this session's `DELETE /api/admin/users/[id]` tests:

- `PATCH /api/admin/users/[id]/plan`: CSRF failure, non-SUPERADMIN rejection, 404, validation
  failures (past date, date+FREE), idempotent no-op (asserts no `AdminAction`/
  `AccountActivity` write), successful change (asserts both writes with correct metadata),
  rate-limit passthrough.
- `GET` / `PATCH /api/admin/pricing-plans[/[key]]`: read for both roles, write SUPERADMIN-only,
  invalid key, invalid price, idempotent no-op, successful update.
- `GET /api/pricing`: no-auth 200, correct shape, excludes admin-only fields.
- `plan-expiration` cron: `verifyCronSecret` gate, downgrades only expired non-FREE profiles,
  clears `planExpiresAt`, writes `PLAN_EXPIRED` activity, leaves permanent (`planExpiresAt:
  null`) and not-yet-expired profiles untouched, lease coordination (mirrors
  `verification-cleanup`'s own lease test if one exists — check before writing a new pattern).

## 8. Out-of-scope confirmation (restated)

No self-service purchase, no Bictorys recurring billing, no feature-gating enforcement, no
full plan-catalog editor (name/promise/features stay static). Each is a legitimate, separate
future project that this spec's data model (`Profile.plan`, `Profile.planExpiresAt`,
`PricingPlan`) does not block or need to be redesigned for.
