# Phase 8 — Notifications métier (E9, PRD §11 N01-N04) Design

## 1. Scope

Backend-only. Builds the 4 rule-based notification triggers PRD §11
names as N01-N04 ("Règles", "Journal", "Résumé", "Fertilité"), delivered
through the already-shipped `createNotification`/`Notification`/
`NotificationBell` pipeline (Phase 2 + the full-app-audit pass). Today
that pipeline only fires two one-shot events (`welcomeNotification`,
`paymentReceived`) — this phase adds the first **recurring, cron-driven**
notifications.

**In scope:**
- `POST /api/cron/notification-triggers` — one new daily cron route,
  `Authorization: Bearer ${CRON_SECRET}` gated like every other cron.
- `frontend/src/lib/server/notifications/triggers.ts` — pure,
  independently-testable logic for the 4 trigger conditions.
- 4 new typed template functions in `notifications/templates.ts`
  (`periodReminder`, `journalReminder`, `weeklySummaryReady`,
  `fertilityWindowApproaching`), each with a NORMAL and a DISCREET copy
  variant lifted verbatim from PRD §11.
- `frontend/vercel.json` — one new schedule entry.
- In-app delivery only (`Notification` row + existing `NotificationBell`
  UI). No email, no browser push.

**Out of scope (explicit deviations, decided with the user before writing
this spec):**
- **No per-category notification preferences.** PRD §14's ideal data
  model (`notification_preferences: user_id, category, enabled,
  discreet, preferred_time`) doesn't exist anywhere yet — no per-user
  timezone is stored, no per-category Settings UI exists. This phase
  reuses the existing global `Profile.notificationLevel`
  (`NORMAL | DISCREET | NONE`), already wired into `/app/settings`. All
  4 categories obey the same global level. Per-category granularity is
  a real future feature, not built here.
- **No stored per-user timezone.** PRD §11 says notifications must be
  "sensibles au fuseau horaire". The pilot market is Sénégal (PRD §1,
  "Marché pilote: Sénégal"), which is UTC+0 year-round (no DST) — so a
  fixed UTC cron hour *is* the correct Dakar wall-clock hour today. This
  is documented as a pilot-market simplification, not a general
  solution; adding real per-user timezones is required before expanding
  beyond Sénégal.
- **No email or push channel.** Health-adjacent reminders (period,
  fertility) delivered by email or OS push risk exposing sensitive
  content outside the app (lock screen, inbox preview) — in-app-only
  avoids that entirely for this phase. `EmailQueue` already exists and
  a digest email for N03 could be added later per-category once
  per-category prefs exist.
- **No new Prisma model.** Idempotency is enforced entirely by
  `Notification.dedupeKey`'s existing unique constraint (see §3) — no
  "last sent" tracking table needed.
- **UI**: `NotificationBell` already renders arbitrary
  title/body/`readAt` generically — no changes needed. Per-type icons/
  styling are a cosmetic follow-up, not required for this phase.

## 2. Data model

No new tables, no migration. Reuses:
- `Profile.notificationLevel: String` (`NORMAL | DISCREET | NONE`,
  default `NORMAL`) — the single opt-out/discreet-mode lever for all 4
  triggers.
- `Profile.goal: String` (`PERIOD_TRACKING | UNDERSTAND_CYCLE |
  TRYING_TO_CONCEIVE`) — gates N04 (see §3).
- `Notification.dedupeKey: String @unique` — the idempotency mechanism
  for every trigger (see §3's dedupeKey column). `createNotification`
  already silently no-ops on a duplicate key (P2002 catch) — this phase
  adds zero new dedup infrastructure, only new deterministic keys.

## 3. Trigger conditions

All copy is verbatim from PRD §11. In `DISCREET` mode the **title** is
also replaced with the generic `"NAWIRA"` (not just the body) — PRD
§11: "Aucune donnée intime sur écran verrouillé en mode discret." Since
delivery is in-app only for this phase (no OS lock screen involved yet),
this is a forward-compatible precaution, applied consistently now so a
future push-notification channel doesn't need a second copy pass.
`notificationLevel === 'NONE'` skips every trigger for that user
entirely (checked once per user, not per-category — see §1).

| Code | Condition | dedupeKey | Title (NORMAL / DISCREET) | Body (NORMAL) | Body (DISCREET) |
|---|---|---|---|---|---|
| N01 Règles | `Prediction` exists AND `today === expectedPeriodStart - 3 days` | `period-reminder:{userId}:{expectedPeriodStart}` | "Règles à venir" / "NAWIRA" | "Tes règles sont estimées dans environ 3 jours." | "Ton rappel personnel est disponible." |
| N02 Journal | No `DailyLog` row for `today` at cron time | `journal-reminder:{userId}:{today}` | "Ton journal du jour" / "NAWIRA" | "Comment te sens-tu aujourd'hui ?" | "Un rappel NAWIRA est disponible." |
| N03 Résumé | `today` is a Monday (UTC) AND `deriveInsights(input).eligible === true` | `weekly-summary:{userId}:{mondayOfThisWeek}` | "Ton résumé est prêt" / "NAWIRA" | "Ton résumé de cycle est prêt." | "Ton nouveau résumé est disponible." |
| N04 Fertilité | `Profile.goal === 'TRYING_TO_CONCEIVE'` AND `Prediction.fertileWindowStart` exists AND `today === fertileWindowStart` | `fertility-reminder:{userId}:{fertileWindowStart}` | "Fenêtre fertile" / "NAWIRA" | "Ta fenêtre fertile estimée approche." | "Un rappel Projet Bébé est disponible." |

Dates in dedupeKeys are ISO `YYYY-MM-DD` strings (UTC date, matching the
existing `todayUtcDate()` convention from `lib/server/cycles/
date-utils.ts`). Because `expectedPeriodStart`/`fertileWindowStart` are
part of the key, a prediction that later shifts (new data recomputes it)
naturally allows a fresh N01/N04 notification for the new estimate —
intended behavior, not a dedup bug: the user's situation genuinely
changed.

N01/N04 fire **once**, on the exact boundary day, not every day the
condition remains superficially true (e.g. N01 does not re-fire on J-2
or J-1 — only the single J-3 day matches `expectedPeriodStart - 3 days
=== today`). N02 fires at most once per calendar day by construction
(dedupeKey includes `today`). N03 fires at most once per week (dedupeKey
includes the Monday date; the `today is Monday` guard means it is only
even attempted once per week per user, the dedupeKey is a second,
redundant safety net consistent with how every other trigger already
works).

## 4. Cron mechanics

`frontend/src/app/api/cron/notification-triggers/route.ts`, following
the exact shape of the existing `verification-cleanup` cron
(`verifyCronSecret` → `withRequestContext` → `withLease` → do the work →
`NextResponse.json({ ok: true, processed })`).

**Schedule:** daily, `0 18 * * *` (18:00 UTC = 18:00 Dakar, see §1).
One new `frontend/vercel.json` entry alongside the existing 6 crons.

**Query shape** (avoids N+1 across the whole user base):

```ts
const profiles = await prisma.profile.findMany({
  where: { notificationLevel: { not: 'NONE' } },
  select: { userId: true, notificationLevel: true, goal: true },
});
const userIds = profiles.map((p) => p.userId);

const predictions = await prisma.prediction.findMany({
  where: { userId: { in: userIds } },
});
const todayLogs = await prisma.dailyLog.findMany({
  where: { userId: { in: userIds }, date: todayUtcDate() },
  select: { userId: true },
});
```

N01/N02/N04 are then pure in-memory checks per profile against these 3
pre-fetched collections (`triggers.ts` exports one pure function per
trigger, each taking already-fetched rows — no Prisma calls inside
`triggers.ts` itself, keeping it unit-testable without mocking Prisma).

N03 is the one exception: computing `deriveInsights(...).eligible`
needs each user's full `Cycle`/`DailyLog`/`PeriodEvent` history (the
same 3-query shape `GET /api/insights` already uses), which cannot be
batched the same way. This only runs when `today` is a Monday, and only
for the subset of profiles not already excluded by `notificationLevel`.
**Documented scaling limitation** (same category as the existing
in-memory `CircuitBreaker` — see CLAUDE.md): at pilot scale (Sénégal,
early-stage user count) one findMany-per-eligible-user once a week is
acceptable within Vercel's cron `maxDuration`; a larger user base would
need this moved to a paginated/queued job. Not built now — YAGNI at
current scale.

Every notification is created via the existing `createNotification`
(never `prisma.notification.create` directly, per CLAUDE.md's
invariant) — looped one call per eligible (user, trigger) pair, not a
bulk `createMany`, since `createNotification`'s per-row dedup catch is
itself the mechanism the loop depends on.

## 5. New files

- `frontend/src/lib/server/notifications/triggers.ts` — 4 pure
  functions: `checkPeriodReminder`, `checkJournalReminder`,
  `checkWeeklySummary`, `checkFertilityReminder`. Each returns a
  `CreateNotificationInput | null` given already-fetched rows + `today`.
- `frontend/src/lib/server/notifications/templates.ts` — append
  `periodReminder`, `journalReminder`, `weeklySummaryReady`,
  `fertilityWindowApproaching`, each `(userId, level: 'NORMAL' |
  'DISCREET', ...args) => CreateNotificationInput`, following the exact
  shape of the existing `welcomeNotification`/`paymentReceived`.
- `frontend/src/app/api/cron/notification-triggers/route.ts` — the cron
  handler wiring `triggers.ts` + `templates.ts` + `createNotification`.
- Test files: `triggers.test.ts` (all 4 conditions, boundary dates,
  `NONE`/`DISCREET` gating, `TRYING_TO_CONCEIVE` gating for N04),
  `route.test.ts` for the cron (auth, lease, correct calls into
  `createNotification`, dedup no-op on a second run same day).

## 6. Decisions log

- Global `notificationLevel` reused instead of building PRD §14's
  per-category model — confirmed with user via AskUserQuestion
  (2026-09-16): avoids a new Prisma model + new Settings UI for a v1
  pass; per-category granularity deferred.
- All 4 triggers built together, not phased — confirmed with user:
  PRD groups them in one P0 epic, and the incremental cost per trigger
  once the cron/query scaffolding exists is low.
- In-app only, no email/push — confirmed with user: avoids exposing
  health-adjacent content (période, fertilité) outside the app for
  sensitive-data reasons.
- Single combined daily cron over 4 separate cron routes — confirmed
  with user: no cadence differs between triggers, one leader-lease and
  one `vercel.json` entry is simpler to operate.
- N04 gated to `Profile.goal === 'TRYING_TO_CONCEIVE'` — confirmed with
  user: avoids presuming a conception interest for users tracking their
  cycle for other reasons, consistent with PRD §8.1's "never generalize/
  assume" stance.

## 7. Testing plan

- Unit: `triggers.ts` — one test per trigger's true/false boundary
  (exactly J-3 fires, J-2/J-4 don't; `DailyLog` present vs. absent;
  Monday vs. other weekdays combined with `eligible` true/false;
  `TRYING_TO_CONCEIVE` vs. other goals), plus `NONE`/`DISCREET`/`NORMAL`
  copy selection.
- Unit: `templates.ts` — each new function returns the exact PRD copy
  and a deterministic dedupeKey given the same inputs.
- Integration (route-level, mocked Prisma like every existing cron
  test): `route.test.ts` — 401 without `CRON_SECRET`, lease prevents
  double-run, a full profile+prediction+dailyLog fixture produces the
  expected `createNotification` calls, a second identical run produces
  zero new rows (dedupeKey collision).
- No live-browser verification needed — no UI changes ship in this
  phase (`NotificationBell` already renders whatever `Notification` rows
  exist).

## 8. Deferred / explicitly out of scope

- Per-category notification preferences + Settings UI (PRD §14's full
  `notification_preferences` shape).
- Real per-user timezone storage (needed before expanding past Sénégal).
- Email digest for N03 (weekly résumé) or any push-notification channel.
- Batching/pagination for the N03 per-user `deriveInsights` computation
  at scale beyond pilot-market size.
- Per-notification-type icons/styling in `NotificationBell`.
