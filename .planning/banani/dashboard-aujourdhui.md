# DashboardAujourdhui (Home) — Banani → Next.js

## Source
- Banani screen ID: `acguXQuGeGbU/screens/DashboardAujourdhui.jsx`
- Fetched: 2026-09-07

## Backend contract (Phase 3, already shipped)
- `GET /api/cycles` → `{ cycles: [{startDate, endDate, length, isOutlier}], todayLogged: boolean }`
- `GET /api/predictions/current` → `{ prediction: {confidence, expectedPeriodStart, expectedPeriodEnd, algorithmVersion, computedAt} | null }`
- `POST /api/period-events` → body `{ flow? }`, `{ ok: true }` on success, 404 `PROFILE_NOT_FOUND`, 400 `VALIDATION_FAILED`

## Scope decisions vs. the raw Banani fetch (this IS the design — read before coding)

The raw screen is a 3-column dashboard whose column-2/3 cards are built
around content Phase 3 explicitly does not have: fertility (E5), daily
mood/symptom logging (E4), trends/insights (E6), and a "Projet Bébé"
promo. Translating it 1:1 would ship fabricated fertility data and dead
buttons. Adaptation:

| Banani component | Decision | Why |
|---|---|---|
| `CycleCard` (ring) | **Rebuilt, not reused.** Keep only a single-arc progress ring showing "Jour N sur ~L jours" (N = today − current episode start + 1, L = the estimated cycle length reverse-derived from the current `Prediction`, if any). Drop the 4 phase-color arcs (menstrual/follicular/ovulation/luteal), the "Phase fertile" heading/paragraph, and the "Voir les détails" button (target screen `CycleDetailFull` isn't built). | Phase-arc segments encode fertility-window claims (§8, explicitly deferred and regulatory-sensitive) — not just a Cycle Score any of this phase's endpoints. |
| **NEW, not in Banani** — "Mes règles ont commencé" CTA | Add as a card directly under the cycle ring: button if `!todayLogged`, a neutral "Jour 1 de tes règles enregistré" chip if `todayLogged`. | This is the confirmed Phase 3 minimal logging action; Banani never designed it since it predates the backend. |
| `PredictionCards` | **Keep only the "Prochaines règles" card.** Drop "Ovulation estimée" and "Fenêtre fertile" entirely. | Fertility fields are deferred (E5); the API doesn't even return them (see contract above). |
| `MiniCalendar` | **Keep, but recolor.** Drop the `fertile`/`ovulation` day-types and their legend entries. Keep `menstrual` (renamed "observed" in code, from `GET /api/cycles`) and `today`. Add a `predicted` day-type (the single predicted period-start day from `GET /api/predictions/current`, if any) with its own legend entry, per the Phase 3 spec's "observed vs. predicted" requirement. Clicking a day does nothing this phase (no `CycleDetailFull`). | Matches the spec's confirmed calendar data contract; fertile/ovulation have no data source this phase. |
| `MoodSelector` | **Dropped entirely.** | Daily mood logging is E4 (full journal), explicitly out of scope — this phase ships exactly one logging action (period start). |
| `TrendsChart` | **Dropped entirely.** | 6-month trend analysis is E6 (Insights), explicitly out of scope. |
| `KeyDataCards` | **Dropped entirely.** | "Cycle moyen"/"Règles (moyenne)" could theoretically be derived from `GET /api/cycles`, but "Symptôme le plus fréquent"/"Meilleure phase" require E4/E6 data we don't have — a card that's half-real, half-fabricated is worse than no card. Flagged below for user veto in case you want the 2 real stats kept as a smaller card. |
| `DailyTip` | **Dropped entirely.** | Static, non-personalized content with no data dependency — fine to keep in principle, but it's decorative filler with no functional tie to this phase; simpler to omit than to source real "conseil du jour" copy. Flagged below. |
| `ProjetBebeCard` | **Dropped entirely.** | Fertility/baby-project promo — E5, explicitly out of scope. |
| Hero greeting banner (UserAvatar photo, quote overlay, italic tagline) | **Simplified.** Keep the gradient background + "Bonjour {name}" + supporting line. Drop the AI-generated `UserAvatar` photo (same reasoning as the landing page's own precedent — no such photo component, and a fabricated stock photo of "the user" is worse than none), the floating quote card, and the italic corner tagline (all purely decorative, all keyed to the now-removed photo's layout). | Matches this project's own precedent set on the landing page for AI-avatar placeholders. |

## Structure map (after adaptation)
1. **Greeting banner** — gradient card, "Bonjour {name} 👋" + one supporting sentence (static copy, not personalized beyond the name).
2. **Cycle + logging block** — single-arc ring ("Jour N sur ~L jours" or an empty state if no cycle data at all yet) + the period-logging CTA/chip.
3. **Prediction card** — "Prochaines règles" only, with a confidence-aware label; an empty-state card ("Continue à suivre ton cycle pour une première estimation.") when `prediction === null`.
4. **Mini calendar** — current month, observed + predicted + today, legend, "Voir tout" link → `/app/calendar`.

Single column on mobile (stacked in the order above); 2-column on desktop (`lg:`: left column = greeting + cycle/logging + prediction, right column = mini calendar) — Banani's 3-column grid doesn't survive the content cuts above (down to 4 blocks total), so a 2-column desktop split fits better than forcing 3 near-empty columns.

## Component breakdown
- **NEW** `frontend/src/app/(app)/today/page.tsx` — page component, data fetching.
- **NEW** `frontend/src/components/today/CycleRing.tsx` — the simplified single-arc SVG ring + day counter. Props: `{ currentDay: number | null; estimatedLength: number | null }`.
- **NEW** `frontend/src/components/today/PeriodLogCta.tsx` — the button/chip. Props: `{ todayLogged: boolean; onLog: () => Promise<void>; loading: boolean }`.
- **NEW** `frontend/src/components/today/PredictionCard.tsx` — Props: `{ prediction: Prediction | null }`.
- **NEW** `frontend/src/components/today/MiniCalendar.tsx` — shared with the Calendar page's month-grid logic (see `calendar.md`) via a common `frontend/src/components/calendar/MonthGrid.tsx` primitive (rule-of-three not needed — reuse is obvious from the first fetch since both screens show a month grid with the same day-type coloring).
- **REUSE** `Button` from `@/components/ui/Button.tsx`.

## Token mapping
No new tokens beyond `app-shell.md`'s. Ring colors: single arc in `primary` (`#6C43C1`), background track in `border` (`#E5E7EB`) — replacing Banani's 4-color phase arcs with the project's existing tokens only, no new hex values introduced for the fertility-removed content.

## Tailwind translation notes
- Ring SVG kept from Banani's markup shape (`viewBox="0 0 160 160"`, `r="64"`, `strokeWidth="14"`) but with one `stroke` arc instead of four — `stroke-dasharray`/`stroke-dashoffset` computed from `currentDay / estimatedLength` in JS, not hardcoded.
- Card shell: `rounded-lg border border-border bg-white p-5` (Banani's `bg-card` + `border-border` + `p-5`/`p-6` depending on card).

## Responsive plan (MANDATORY)
- **Base (375px):** Single column, full-width cards, ring sized down (`120px` instead of `160px` to fit comfortably with side padding), CTA button full-width.
- **md (768px):** Same single-column stack, slightly larger horizontal padding.
- **lg (1024px+):** 2-column grid (`lg:grid-cols-[1fr_320px]`) — left = greeting + cycle/logging + prediction, right = mini calendar, matching the "3-column → 2-column" simplification above.

## Interactions / state
- **Loading:** skeleton placeholders (simple pulsing gray blocks) for the ring/prediction/calendar while `GET /api/cycles` + `GET /api/predictions/current` are in flight (fetch both in parallel).
- **Empty state (no `Cycle` rows at all yet):** ring shows a neutral placeholder ("Commence à suivre ton cycle") instead of a day count; prediction card shows its own empty state (see table above).
- **Error state:** a simple inline error banner ("Impossible de charger tes données. Réessaie.") if either GET fails — no retry button needed for v1 (refresh the page).
- **Period-log CTA click:** `POST /api/period-events` (no body → defaults to `flow: MEDIUM`), on success refetch `GET /api/cycles` + `GET /api/predictions/current` (not optimistic — the recompute changes both, simplest correct approach is a refetch), on `PROFILE_NOT_FOUND` this shouldn't be reachable (the `(app)` layout already gates on `hasProfile`) so no special UI for it, on network error show a toast (`useToast` from `ToastContext`, already in the codebase).

## Copy / i18n
All new strings added to `frontend/src/lib/constants.ts` (existing pattern): greeting line, CTA label "Mes règles ont commencé", logged-chip text "Jour 1 de tes règles enregistré", prediction empty-state text, cycle empty-state text, confidence labels (e.g. LOW → "estimation approximative").

## Implementation checklist
- [ ] Build `MonthGrid` primitive (shared with Calendar)
- [ ] Build `CycleRing`, `PeriodLogCta`, `PredictionCard`, `MiniCalendar`
- [ ] Build `today/page.tsx`, wire to both GET endpoints + the POST
- [ ] Loading/empty/error states for all 3 data blocks
- [ ] 375px / 768px / 1280px checks
- [ ] Touch target ≥48px on the CTA button
- [ ] Compare 1280px against the Banani desktop mockup for the surviving blocks (greeting, prediction card, mini calendar)

## Open questions for user
1. **`KeyDataCards`' two real stats** ("Cycle moyen", "Règles (moyenne)", both derivable from `GET /api/cycles`) — drop entirely (my default above) or keep as a small 2-stat card?
2. **`DailyTip`** — drop entirely (my default), or keep as a static (non-personalized, hardcoded) wellness tip card?
3. **Confirm the CycleCard rebuild** — a single neutral-purple arc + "Jour N sur ~L jours", no phase segments, no fertility framing, no "Voir les détails" button. This is the biggest structural departure from the Banani source in this screen.
