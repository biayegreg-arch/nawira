# Calendar — Banani → Next.js

## Source
- Banani screen ID: `acguXQuGeGbU/screens/Calendar.jsx`
- Fetched: 2026-09-07

## Backend contract
- `GET /api/cycles` → `{ cycles: [{startDate, endDate, length, isOutlier}], todayLogged: boolean }`
- `GET /api/predictions/current` → `{ prediction: {...} | null }`

Both read-only for this screen — **no writes, no edit/delete on any day**
(confirmed decision from the Phase 3 brainstorm: Calendar is read-only
this phase).

## Scope decisions vs. the raw Banani fetch

| Banani component | Decision | Why |
|---|---|---|
| Header "Exporter"/"Partager" buttons | **Dropped.** | No export/share backend exists; decorative dead buttons are worse than omission. |
| `FullMonthCalendar`'s fertile/ovulation day-types + legend | **Dropped.** | Same reasoning as `dashboard-aujourdhui.md` — E5, no data source. |
| `FullMonthCalendar`'s 2-month hardcoded data (`Septembre 2026`, `Octobre 2026`) | **Replaced with real, navigable months** driven by `GET /api/cycles`, defaulting to the current month, with prev/next navigation (confirmed requirement from the spec). | Banani's mock only ever shows 2 fixed months; the real screen must show any month. |
| `FullMonthCalendar`'s "À propos de ce calendrier" info notes | **Kept, trimmed.** Keep the first note (explains the color legend) verbatim; drop the second ("ajouter/modifier un événement" — implies an edit feature that doesn't exist this phase) and third ("enregistre tes données quotidiennement" — implies daily journaling, E4, not this phase's CTA). | The kept note is still accurate; the other two describe features this phase doesn't ship. |
| Day click → (implied) event editor | **No-op this phase.** Days are visually informative only; tapping/clicking does nothing (no `CycleDetailFull`, no edit modal). | Matches "read-only" decision. |

## Structure map (after adaptation)
1. **Header** — "Calendrier" title + one-line subtitle (kept from Banani, French copy unchanged).
2. **Legend** — Règles (observed) / Prédit (predicted) / Aujourd'hui. 3 entries instead of Banani's 4 (dropped Fertile/Ovulation, added Prédit).
3. **Month grid** — one month at a time (not Banani's hardcoded 2), prev/next nav in the header row, using the shared `MonthGrid` primitive from `dashboard-aujourdhui.md`.
4. **Info note** — the single kept "À propos" paragraph.

## Component breakdown
- **NEW** `frontend/src/app/(app)/calendar/page.tsx` — page component, month-navigation state, data fetching.
- **NEW** `frontend/src/components/calendar/MonthGrid.tsx` — the shared month-grid primitive (also used by Home's `MiniCalendar`). Props: `{ year: number; month: number; dayTypes: Record<string, 'observed' | 'predicted' | 'today'>; size: 'compact' | 'full' }` — `size` controls cell dimensions (Home's mini version vs. Calendar's full version) without duplicating the grid-building logic.
- **NEW** `frontend/src/components/calendar/CalendarLegend.tsx` — the 3-entry legend, reused as-is by both `size` variants.
- **REUSE** `Button`/icons (`ChevronLeft`/`ChevronRight` from `lucide-react`, already a dependency) for month navigation.

## Deriving `dayTypes` from the API response
- **observed:** every date within `[startDate, endDate ?? today]` for each `Cycle` row whose `startDate`/`endDate` falls in the displayed month (the open cycle's "end" for display purposes is capped at today, since it has no real `endDate` yet).
- **predicted:** exactly one day — `prediction.expectedPeriodStart`, if a prediction exists and that date falls in the displayed month.
- **today:** the current UTC date, if it falls in the displayed month.
- Precedence when a date matches more than one type (e.g. today falls on an observed day): `today` wins visually (matches Banani's own precedence, where `dayTypes` object literal keys let `today` overwrite the others in their mock).

## Token mapping
No new tokens. `observed` uses `rose`/`rose-soft` (Banani's `pink`/`pink-100`, exact hex match already in `globals.css`), `predicted` uses `primary-light`/`primary-soft` (a distinct-but-related shade so it doesn't read as identical to `today`'s `primary`), `today` uses `primary`.

## Tailwind translation notes
- Day cell: Banani's inline `borderRadius: '50%'` + `fontWeight` → `rounded-full font-semibold` (`today`/`observed`/`predicted`) vs. `font-normal` (no type).
- Full-size cell `w-9 h-9` (Banani's `FullMonthCalendar`), compact cell `w-7 h-7` (Banani's `MiniCalendar`) — exactly the two sizes Banani itself uses, mapped to the `size` prop.

## Responsive plan (MANDATORY)
- **Base (375px):** Single month card, full width, 7-column grid intact
  (calendars don't reflow to fewer columns — they stay 7-wide and shrink
  cell size instead). Legend wraps to 2 rows if needed
  (`flex-wrap`, already how Banani's own legend is built). Prev/next
  nav buttons ≥48px tap targets.
- **md (768px):** Same single-column layout, wider side padding, legend
  fits on one row.
- **lg (1024px+):** `max-w-4xl` container (matches Banani's own
  constraint), sidebar+topbar from the app shell.

## Interactions / state
- **Month navigation:** prev/next arrows, client-side state (`useState<{year, month}>`), no new API call needed — `GET /api/cycles` is fetched once (no pagination, per the backend's own documented design) and the full result is filtered/re-rendered per displayed month. `GET /api/predictions/current` fetched once too.
- **Loading:** skeleton month grid while both GETs are in flight.
- **Empty state:** if `cycles` is `[]` (brand-new user, nothing logged yet), show the grid with only `today` marked, no error — this is a normal, expected first-use state.
- **Error state:** same inline banner pattern as Home.

## Copy / i18n
Header title/subtitle, legend labels ("Règles", "Prédit", "Aujourd'hui"), the kept info note, month names (French, `Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })` rather than hardcoding a name list like Banani's mock does — this is the one place translating Banani's mock data into real logic actually simplifies the code).

## Implementation checklist
- [ ] Build `MonthGrid` + `CalendarLegend` primitives (shared with Home)
- [ ] Build `calendar/page.tsx` with month-nav state
- [ ] Derive `dayTypes` from the two GET responses per the precedence rule above
- [ ] Loading/empty/error states
- [ ] 375px / 768px / 1280px checks
- [ ] Verify month navigation works at least 2 months forward/back manually
- [ ] Compare 1280px against the Banani desktop mockup (header, legend, single-month card, info note)

## Open questions for user
None beyond the ones already raised in `app-shell.md`/`dashboard-aujourdhui.md` — this screen's adaptations follow directly from decisions already confirmed earlier in the Phase 3 brainstorm (read-only, no fertility, observed vs. predicted).
