# Cycles history (replaces CycleDetailFull) — Banani → Next.js/Tailwind

## Source
- Banani screen ID: `acguXQuGeGbU/screens/CycleDetailFull.jsx` (+ shared `CycleDetailView.jsx`, reuses `MiniCalendar.jsx`/`PredictionCards.jsx` already fetched for `/app/today`)
- Fetched: 2026-09-07

## Why this isn't a translation of the source
`CycleDetailView` (the screen's entire differentiating content) is built around the 4 cycle phases (menstruelle/folliculaire/ovulation/lutéale) and the fertile window — content explicitly out of scope until E5. Stripping the fertility framing leaves nothing of the source screen to reproduce. Confirmed with the user: replace with a genuinely useful, in-scope screen — a **cycle history list** — rather than force a diminished version of the Banani mockup.

## Route
`/app/cycles` — "Historique des cycles". Entry points: a "Voir l'historique" link added to `PredictionCard` (`/app/today`) and to the Calendar page's info note area.

## Structure map
- Header with back-to-dashboard breadcrumb (kept from Banani's header pattern — the one part of the source that does translate).
- List of past cycles (most recent first): start date, end date (or "en cours" if still open), length in days, an "atypique" badge when `isOutlier`.
- "Pourquoi cette estimation ?" card — reuses the *real* confidence-driving facts (not Banani's fabricated ones): whether the user logs regularly (derived: ≥1 cycle with real data), how many complete cycles are recorded, and the current prediction's confidence label (LOW/MEDIUM/HIGH → French).

## Component breakdown
- **NEW** `frontend/src/app/app/cycles/page.tsx` — fetches `GET /api/cycles` + `GET /api/predictions/current` (already used elsewhere, no new backend). Renders the list + confidence card.
- **NEW** `frontend/src/components/cycles/CycleListItem.tsx` — one row: date range, length, outlier badge.
- **REUSE** `formatFrenchDate`-style date formatting (currently duplicated inline in `PredictionCard.tsx` — extract to `frontend/src/lib/format-date.ts` since this is now the 2nd consumer, satisfying the skill's "rule of three is a floor" — 2 real occurrences with a 3rd imminent is enough to extract now).
- **MODIFY** `frontend/src/components/today/PredictionCard.tsx` — add a "Voir l'historique de mes cycles" link to `/app/cycles` (only when a cycle exists).

## Token mapping
Already present (`primary`, `rose`, `green` for the outlier badge — reuse `amber`/`amber-soft` for "atypique" to distinguish from the rose "observed" color already used elsewhere).

## Responsive plan
- **375px**: single column list, cards full width, confidence card stacks below the list.
- **1024px+**: `max-w-3xl` container matching the Banani header's intent (no two-column split needed — `MiniCalendar`/`PredictionCards` sidebar from the source is redundant with `/app/today` and `/app/calendar`, which already show that data).

## Interactions / state
- Loading: skeleton, same pattern as other `/app/*` screens.
- Empty: "Tu n'as pas encore de cycle enregistré." when `cycles.length === 0` (same guarantee as `/app/today`: no cycles ⇒ no prediction either).
- Error: same red-banner pattern.
- Read-only — no mutations, no CSRF.

## Copy
French inline JSX.

## Implementation checklist
- [ ] `format-date.ts` extraction (+ update `PredictionCard.tsx` to use it)
- [ ] `CycleListItem.tsx`, `app/app/cycles/page.tsx`
- [ ] Link from `PredictionCard.tsx` and the Calendar page
- [ ] 375/768/1280 check, typecheck/lint/build

## Open questions for user
None — replacement approach confirmed above.
