# Projet Bébé (`/app/baby`) — built without a Banani source

## Source

Banani screen `ProjetBebe` was requested 3 times this session via
`mcp__banani__banani_get_selected_designs`; every fetch returned the stale
`DashboardAujourdhui` selection instead. User chose (AskUserQuestion, 2026-09-07):
**"Construire /app/baby sans source Banani"** — same resolution already used for
`/app/log` earlier this session.

Built from: the approved Phase 5 spec
(`docs/superpowers/specs/2026-09-07-phase5-fertility-window-design.md`, Section 6)
+ the already-shipped backend (`GET /api/predictions/current`,
`GET`/`PUT /api/fertility-signals/today`) + existing screen conventions
(`/app/today`, `/app/calendar`, `/app/log`).

## Scope decisions

- **FertilityWindowCard**: renders `fertileWindowStart`–`fertileWindowEnd` as a
  **range**, ovulation framed as "estimation" inside that range — never a single
  certain date (PRD §8.1: "présenter une plage, pas une certitude ponctuelle").
  Empty state when `prediction === null` (mirrors `PredictionCard`'s empty state).
- **TodaySignalsCard** (the `LHTestTracker` composition, broadened to cover all
  3 signal types): quick-entry widget for basal temperature / cervical mucus /
  LH test, wired to the already-shipped `GET`/`PUT /api/fertility-signals/today`.
  This is the one entry point for these signals right now — the spec's "extend
  `/app/log`" placement decision is about the *eventual* long-term home (still
  deferred, not built), but the backend for these 3 signals is fully shipped
  and otherwise has zero UI. Built here so the backend isn't orphaned.
- **ConceptionStatsCard** (`ConceptionStatistics`): derived, read-only stats —
  current cycle day, days until fertile window opens/closes — computed from
  data already fetched (`/api/cycles`, `/api/predictions/current`). No new
  backend.
- **ConceptionTipsCard**: static educational content, written fresh (not
  Banani copy — no Banani source used at all this pass). Non-diagnostic,
  cautious framing, explicit disclaimer — same discipline as `HelpCenter`'s
  FAQ content.
- No subscription/tier gate (matches spec §1 — nothing is gated anywhere yet).

## Components

- **NEW** `frontend/src/components/baby/FertilityWindowCard.tsx`
- **NEW** `frontend/src/components/baby/TodaySignalsCard.tsx`
- **NEW** `frontend/src/components/baby/ConceptionStatsCard.tsx`
- **NEW** `frontend/src/components/baby/ConceptionTipsCard.tsx`
- **REUSE** `frontend/src/components/ui/ChipGroup.tsx` — signal chip selectors
- **REUSE** `formatFrenchDate`, `cn`, `useUser`, `useToast`, `api`/`ApiError`

## Data flow

- `GET /api/predictions/current` → fertile window + confidence
- `GET /api/cycles` → current cycle day
- `GET /api/fertility-signals/today` → prefill today's signals
- `PUT /api/fertility-signals/today` → save signal edits (CSRF via `api()` wrapper)

## Responsive plan

- Base (375px): single column, cards stacked, chip rows wrap, full-width save button.
- lg (1024px+): 2-column grid — main column (window + tips) / side column (stats + today's signals), matching `/app/today`'s `lg:grid-cols-[1fr_320px]` pattern.

## States

- Loading: skeleton blocks (matches `/app/today`).
- Error: red banner (matches `/app/today`).
- No prediction yet: `FertilityWindowCard` empty state, stats card shows "—".

## Verification checklist

- [ ] `pnpm typecheck && pnpm lint && pnpm format`
- [ ] `pnpm test`
- [ ] Dev server check at 375 / 768 / 1280px
- [ ] Real save round-trip for signals (GET prefill → edit → PUT → reload confirms)
