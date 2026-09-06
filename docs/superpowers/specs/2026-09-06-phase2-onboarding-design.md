# Phase 2 — NAWIRA onboarding (OB01-11) + Profile/Consent capture

Status: approved by user 2026-09-06, ready for implementation planning.
Scope: this document covers **Phase 2 only** — the onboarding flow that
creates a user's `Profile` and `Consent` rows (both added to the schema in
Phase 1: `docs/superpowers/specs/2026-09-06-phase1-data-model-design.md`).
Phase 3 (cycle/fertility prediction engine, Home/Calendar wiring) is a
separate, later brainstorm → spec → plan cycle. Nothing here computes a
real cycle prediction — that's explicitly deferred (see "OB11 scope"
below).

## Context

NAWIRA's signup → verify-email flow already exists and issues auth
cookies (`frontend/src/app/signup/page.tsx`, `login/page.tsx`,
`verify-email/page.tsx`). Both `login` and `verify-email` currently
hardcode `router.push('/app/today')` on success — a route that doesn't
exist yet (Phase 3 dependency), documented in
`.planning/banani/STATUS.md` as an expected, temporary 404. Phase 2 slots
the onboarding flow in between "session established" and "reaching the
app": a user with no `Profile` row should land on `/onboarding` instead of
`/app/today`.

No Banani source exists for the 11 onboarding screens (OB01-11) —
confirmed via a fresh MCP fetch during brainstorming; `.planning/banani/STATUS.md`'s
"Gap vs PRD" section already flagged this. These screens are designed
here from the PRD text alone, mobile-first, using the design tokens
already established in `frontend/src/app/globals.css` (DM Sans, the
purple/rose/green/amber palette) and the primitives already built
(`Button`, `LinkButton`, `Field` in `frontend/src/components/ui/`).

Source of truth for behavior requirements: `NAWIRA_PRD_WEB_APP_PWA_v2.0.md`
§5 (onboarding screens), §12 (consent), §3.1 (entitlements, referenced for
`Profile.plan`), referenced by section number throughout.

## Decisions locked in during brainstorming

1. **OB11 shows a generic welcome, not a computed estimate.** The PRD
   frames OB11 as showing "jour du cycle, prochaines règles, fertile si
   calculable" — but computing that requires the §7.2 prediction algorithm,
   which is Phase 3's job. Building even the simplest branch of that
   algorithm here would create logic Phase 3 then has to find and absorb.
   OB11 instead shows a welcome message + explains what happens next, and
   its final CTA ("Voir mon tableau de bord") points at `/app/today` —
   which already 404s today for the same reason after login/verify-email,
   so this doesn't introduce a new broken state, just extends an existing,
   already-accepted one.
2. **Client-only state through OB08; nothing reaches the server before
   consent is granted.** The PRD's own consent model (§12, C02: "Traiter
   les données de cycle/santé pour fournir le service") implies consent
   must exist before health-adjacent data (goal, cycle length, tracked
   concerns) is processed/stored. OB03-OB08's answers live in React state
   + `sessionStorage` (refresh-resilient, not persisted server-side) until
   OB09's "Accepter," which submits everything in one transactional call.
   This is a legal-sequencing decision, not just an implementation
   convenience — reversing it would mean the app stores health data before
   asking permission.
3. **One atomic submission endpoint, not one call per step.** `POST
   /api/onboarding/complete` creates the `Profile` row and every granted
   `Consent` row in a single Prisma transaction, fired once at OB09. Matches
   the pattern already established elsewhere in this codebase for
   multi-row writes that must succeed or fail together (e.g. signup's
   User+VerificationCode+outbox transaction).
4. **OB10 (notification intensity) gets one new `Profile` field, not real
   notification wiring.** The existing generic `NotificationPreferences`
   model is a per-event-type `{email, inApp}` map with no NAWIRA event
   types defined yet (those arrive with a much later Notifications epic).
   Wiring OB10 into it now would be plumbing with no consumer. Instead,
   `Profile` gets `notificationLevel String @default("NORMAL") //
   NORMAL | DISCREET | NONE` — a second small additive migration on top of
   Phase 1's schema (same pattern as Phase 1's own post-review fix
   migration `6_nawira_phase1_fixes`), just recording the user's stated
   preference for whenever real notification-sending exists.
5. **Routing: one Next.js route per screen**, not a single stateful
   wizard component. Matches this codebase's existing convention
   (`/signup`, `/login`, `/verify-email` are already separate pages) and
   gives working browser back/forward + refresh resilience for free.
6. **Consent copy is drafted here, flagged for legal review** — not
   blocked on external legal sign-off before implementation, consistent
   with how the Landing page's copy concerns were handled (draft
   something honest and reasonable, flag it, don't stall shipping on it).

## Screen-by-screen spec

Each screen is a route under `/onboarding/<slug>`. All screens share an
`OnboardingLayout` (`frontend/src/components/onboarding/OnboardingLayout.tsx`)
rendering a step-progress indicator and a "Retour" link to the previous
step. Session/consent state persists across steps via a single
`sessionStorage` key (`onboarding-draft`), read/written by a small
`useOnboardingDraft()` hook — not written to the server until OB09.

| # | Route | PRD ref | Content | CTA | State captured |
|---|---|---|---|---|---|
| OB01 | *(not a route)* | Splash | Handled by the existing root/auth redirect logic (`hasProfile` check in `AuthContext` / login-verify redirect), not a screen of its own — the PRD's "routage session" behavior. | — | — |
| OB02 | `/onboarding/welcome` | Bienvenue | "Comprends ton cycle. Apprends à connaître ton corps." | Commencer | none |
| *(not in PRD's OB table — added here, see "Out of scope" below)* | `/onboarding/birth-date` | — | Single date-of-birth field. Client validates ≥18 years old on blur; blocks `Continuer` with an inline "NAWIRA n'est pas encore disponible pour les moins de 18 ans" message if under 18 (not a silent rejection) | Continuer (disabled until a valid ≥18 date is entered) | `birthDate: string` (ISO date) — the only required field in the whole client-side draft, since `Profile.birthDate` is non-nullable |
| OB03 | `/onboarding/goal` | Objectif | 3 option cards: Suivre mes règles / Comprendre mon cycle / Projet bébé | Continuer (disabled until a choice is made — "choix obligatoire" per PRD) | `goal: 'PERIOD_TRACKING' \| 'UNDERSTAND_CYCLE' \| 'TRYING_TO_CONCEIVE'` |
| OB04 | `/onboarding/last-period` | Dernières règles | A date picker + a "Je ne sais pas" option | Continuer (never blocks — "pas de blocage si inconnue") | `lastPeriodDate: string \| null` (ISO date or null) |
| OB05 | `/onboarding/period-length` | Durée règles | Chip-select: 3,4,5,6,7+ / inconnue | Continuer | `usualPeriodLength: number \| null` — "7+" stores literal `7` (informational field, not used in exact math anywhere in Phase 1-3's algorithm) |
| OB06 | `/onboarding/cycle-length` | Durée cycle | Chip-select: 26...32+, irrégulier, inconnue — **never pre-select or default to 28** | Continuer | `usualCycleLength: number \| null` — both "irrégulier" and "inconnue" map to `null` (the schema has no way to distinguish "known to vary" from "never tracked"; accepted as a documented simplification since Phase 3 can ask more precisely later if the distinction turns out to matter for confidence scoring — not a schema change now) |
| OB07 | `/onboarding/concerns` | À suivre | Multi-select chips: douleur, humeur, fatigue, sommeil, SPM, irrégularité, ovulation | Continuer | `trackedConcerns: string[]` |
| OB08 | `/onboarding/baby-project` | Projet Bébé | Only shown if `goal === 'TRYING_TO_CONCEIVE'` (skipped otherwise — router redirects straight to OB09); short static education copy about temperature/mucus/LH tracking, no data entry here | Continuer | none (education only) |
| OB09 | `/onboarding/consent` | Confidentialité | Consent summary: 2 required toggles (pre-checked, cannot be unchecked — ACCOUNT, HEALTH_DATA) + up to 3 optional toggles (unchecked by default — ASSISTANT_HISTORY, ANALYTICS, MARKETING) | **Accepter** — fires `POST /api/onboarding/complete` (see below); disabled while the request is in flight; on failure, show the error inline and let the user retry (no data has been lost — it's all still in `sessionStorage`) | writes `Profile` + `Consent[]` rows server-side |
| OB10 | `/onboarding/notifications` | Notifications | 3 option cards: Normales / Discrètes / Aucune | Continuer — calls `PATCH /api/profile` (new, minimal — see below) to set `notificationLevel`, and grant/skip the `NOTIFICATIONS` consent in the same request (see below — self-review caught this: PRD's C04 consent type must actually get recorded, it can't be implied by `notificationLevel` alone) | `notificationLevel: 'NORMAL' \| 'DISCREET' \| 'NONE'` |
| OB11 | `/onboarding/ready` | Premier résultat | Generic welcome ("Ton profil est prêt !") + 2-3 lines explaining that estimates appear once a first period is logged — **no computed numbers** (see Decision 1) | "Voir mon tableau de bord" → `/app/today` (404 until Phase 3, same as login/verify-email today) | none |

**Skip logic for OB08:** implemented as a redirect at the top of
`/onboarding/baby-project/page.tsx` — if `sessionStorage`'s draft doesn't
have `goal === 'TRYING_TO_CONCEIVE'`, `redirect` (client-side
`router.replace`) straight to `/onboarding/consent`. This keeps the route
list linear and skippable without a separate "wizard router" abstraction.

## Data model changes (small addition on top of Phase 1)

`Profile.notificationLevel String @default("NORMAL") // NORMAL | DISCREET | NONE`
— added via a new additive migration, not by editing the already-applied
Phase 1 migrations. No other schema changes.

## API endpoints

### `POST /api/onboarding/complete`

New route. Auth required (`requireAuth`), CSRF required (`verifyCsrf`).
Body (Zod-validated):

```ts
{
  birthDate: string,                // ISO date
  goal: 'PERIOD_TRACKING' | 'UNDERSTAND_CYCLE' | 'TRYING_TO_CONCEIVE',
  lastPeriodDate: string | null,   // ISO date, nullable
  usualPeriodLength: number | null,
  usualCycleLength: number | null,
  trackedConcerns: string[],
  consents: {
    ACCOUNT: true,        // always true — required, enforced server-side too
    HEALTH_DATA: true,    // always true — required, enforced server-side too
    ASSISTANT_HISTORY: boolean,
    ANALYTICS: boolean,
    MARKETING: boolean,
  },
}
```

Server-side, in one Prisma transaction:
1. Reject (400) if a `Profile` already exists for this user — onboarding
   is one-time; re-running it is not this endpoint's job (a future
   `/settings` edit flow would be a separate, later addition).
2. Reject (400, code `UNDER_MINIMUM_AGE`) if `birthDate` is less than 18
   years before today — re-checked server-side per Phase 1's Decision 3;
   never trust the client-side check alone.
3. Reject (400) if `consents.ACCOUNT` or `consents.HEALTH_DATA` is not
   `true` — these are non-negotiable per the PRD, never trust the client
   to have enforced this in the UI alone.
4. Create the `Profile` row (including `birthDate`).
5. Create one `Consent` row per key in the body where the value is
   `true`, each with `version: 1` (the current copy's version — bump this
   constant whenever consent wording changes materially).
6. Return `{ ok: true }`.

**`lastPeriodDate` is written as a `PeriodEvent` row**, not stored on
`Profile` (which has no field for it) — step 4 above should be read as
"create `Profile`, and if `lastPeriodDate` is non-null, also create a
`PeriodEvent(date: lastPeriodDate, flow: 'MEDIUM')` row in the same
transaction." See "Cross-phase boundary note" below for why this is the
right call despite `PeriodEvent` otherwise being Phase 3's table.

### `PATCH /api/profile` (new, minimal)

Auth + CSRF required. Body: `{ notificationLevel: 'NORMAL' | 'DISCREET' | 'NONE' }`.
In one transaction: updates `notificationLevel` on the caller's existing
`Profile` row (404 if none exists — OB10 always runs after OB09 in this
flow, so a missing `Profile` here means the client skipped a step, not a
valid state to silently handle), and:
- if `notificationLevel !== 'NONE'` and no `Consent(type: NOTIFICATIONS)`
  row exists yet for this user, create one (`version: 1`) — this is the
  PRD's C04 consent, actually recorded, not merely implied;
- if `notificationLevel === 'NONE'`, do not create one (and this endpoint
  never revokes an existing one — there's no path to reach `NONE` after
  already having chosen otherwise in this one-time onboarding flow, so
  revocation logic is out of scope here, not silently skipped).

### `GET /api/auth/me` (existing route, extended)

Add `hasProfile: boolean` to the response — one additional
`prisma.profile.findUnique({ where: { userId }, select: { userId: true } })`
alongside the existing user lookup. `AuthContext`'s `User` type gains
`hasProfile: boolean`.

## Cross-phase boundary note — resolved, not left open

**`lastPeriodDate` (OB04) has nowhere to land in the current schema.**
The natural home is a `PeriodEvent` row (`flow` would need a value —
OB04 doesn't ask about flow intensity, just a date), but `PeriodEvent` is
described in the Phase 1 spec as Phase 3's territory ("`Cycle` rows are
derived from contiguous runs of these by Phase 3's logic"). Writing a
`PeriodEvent` row from Phase 2 would mean Phase 2 starts touching a table
whose read/write logic Phase 3 owns.

**Recommendation:** write it as a `PeriodEvent` row anyway (`date:
lastPeriodDate, flow: 'MEDIUM'` as a reasonable unconfirmed default —
correctable later once real logging exists), inside the same
`POST /api/onboarding/complete` transaction, but ONLY if
`lastPeriodDate` is non-null (OB04 allows "Je ne sais pas"). This is
the one piece of Phase 2 that reaches into a Phase-3-owned table, but the
alternative — inventing a duplicate `Profile.lastPeriodDate` field that
Phase 3 would then have to reconcile with `PeriodEvent` — is worse. Flag
this row as `flow: 'MEDIUM'`-defaulted (not user-confirmed) so Phase 3's
prediction algorithm can treat it accordingly if that distinction ever
matters; no schema change needed for that flag now (out of scope — revisit
only if Phase 3 actually needs to distinguish it).

This recommendation is written into the plan as the actual behavior;
flagging it here because it's a genuine cross-phase boundary call, not
because it's still undecided.

## What's explicitly out of scope for Phase 2

- Any prediction/cycle-length computation (Phase 3).
- Real notification sending or per-event-type preference wiring (later
  Notifications epic) — `Profile.notificationLevel` just records the
  choice.
- **A `/settings`-based way to edit onboarding answers after the fact** —
  not part of this phase. (Note: `Profile.birthDate` — the age gate — is
  NOT out of scope: `frontend/src/app/signup/page.tsx` never collects it,
  and `Profile.birthDate` is non-nullable, so onboarding is the only place
  left to ask. It's the unlisted extra screen right after OB02 in the
  table above — flagged there as a real gap the Phase 1 spec created,
  resolved here rather than deferred, since `POST /api/onboarding/complete`
  literally cannot create a `Profile` row without it.)

## Testing

Vitest unit tests for `POST /api/onboarding/complete` (mocked Prisma,
following this repo's established pattern — see
`src/app/api/auth/signup/route.test.ts` for the shape) covering: rejects
without auth, rejects without CSRF, rejects a second submission if
`Profile` exists, rejects if required consents are false even when the
client claims otherwise, creates `Profile` + `Consent` rows in one
transaction on success, writes a `PeriodEvent` row when `lastPeriodDate`
is provided and skips it when null. Same pattern for `PATCH /api/profile`
and the extended `GET /api/auth/me`. Frontend: no new test infra needed —
this repo doesn't have component tests for pages (checked: none of
`signup`/`login`/`verify-email` have a `.test.tsx`); manual browser
verification at 375/768/1280px per the existing convention from Phase
0's landing/auth pages, same as prior work in this project.
