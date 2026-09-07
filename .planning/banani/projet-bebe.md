# ProjetBebe — Banani → Next.js (real-source rebuild, 2026-09-07)

## Source

- Banani screen ID: `acguXQuGeGbU/screens/ProjetBebe.jsx` ("NAWIRA — Projet Bébé")
- Fetched: 2026-09-07 (previous 3 attempts this session returned a stale `DashboardAujourdhui`
  selection — the earlier `ProjetBebe` build shipped without a real source. User then pasted a
  screenshot of the real screen and pointed out the divergence; this fetch retrieved the actual
  source.)
- Shared components fetched: `FertilityWindowCard.jsx`, `LHTestTracker.jsx`,
  `ConceptionStatistics.jsx`, `ConceptionTipsCard.jsx`, `NawiraSidebar.jsx` (already built),
  `TopBar.jsx` (already built).

## Structure map

- Header: 🌿 Projet Bébé + subtitle — unchanged from previous build.
- **Tab bar** (Aperçu / Calendrier de fertilité / Ressources) — Banani ships these as static
  buttons with no click handlers or alternate content; wired as real client-side tabs here.
- Aperçu tab: 2-col grid — left: `FertilityWindowCard` + (NEW, not in Banani) `OtherSignalsCard`;
  right: `LHTestTracker` + `ConceptionStatistics`.
- Calendrier de fertilité tab (NEW content, not in Banani mockup — the tab button existed but no
  screen showed its content): a read-only month grid with fertile/ovulation highlighting, reusing
  `/app/calendar`'s own `MonthGrid` + `buildDayTypes` + `CalendarLegend`, plus a link to the full
  `/app/calendar`.
- Ressources tab (NEW content, same reason): `ConceptionTipsCard`, moved here from Aperçu since
  Banani's tabs aren't actually wired in the source — grouping "conseils" under "Ressources" is a
  more natural real information architecture than stacking all 4 cards under one tab.
- Premium CTA (bottom, full-width) — kept, but `Essayer gratuitement` becomes a real `<Link
  href="/app/billing">` (existing "Bientôt disponible" placeholder) instead of a dead button — no
  Subscription model exists in Prisma (confirmed in STATUS.md), so a real purchase flow is out of
  scope for this pass. **Confirmed with user via AskUserQuestion.**

## Component breakdown

- **REWRITE** `FertilityWindowCard.tsx` — keep the existing 3-box grid (range / ovulation-estimate
  / confidence-label). Drop Banani's fabricated `74/100` confidence score — the backend only ever
  produces a LOW/MEDIUM/HIGH bucket (see `src/lib/server/cycles/prediction.ts`), no numeric score
  exists anywhere. **Confirmed with user via AskUserQuestion**: keep the label only, no invented
  number. `onAddSignal` now scrolls to `LHTestTracker`'s inline quick-add; `onSeeTips` switches to
  the Ressources tab and scrolls to `ConceptionTipsCard`.
- **NEW** `LHTestTracker.tsx` (`src/components/baby/LHTestTracker.tsx`) — Banani-faithful: today's
  LH status (color/copy per real `lhResult` enum value — `NEGATIVE | POSITIVE | PEAK |
  INCONCLUSIVE`, see mapping below), history list (reuses existing `GET
  /api/fertility-signals/recent`, already filtered server-side to `LH_TEST`), and an inline
  expand/collapse "Ajouter un test" quick-chip-select that submits just `lhResult` via the existing
  fetch-merge-PUT pattern.
- **NEW** `OtherSignalsCard.tsx` (`src/components/baby/OtherSignalsCard.tsx`) — temperature +
  cervical mucus only, trimmed from the old `TodaySignalsCard` (which bundled all 3 signal types).
  **Addition beyond Banani**, flagged: Banani's source has no UI for these two signal types
  anywhere, but `GET`/`PUT /api/fertility-signals/today` already supports them and the old
  `TodaySignalsCard` was their only entry point — removing it without a replacement would be a real
  functionality regression, not a design correction.
- **REWRITE** `ConceptionStatsCard.tsx` → renders as "Ton parcours de conception" (Banani's
  `ConceptionStatistics`), 4 icon-rows, **all backed by real, already-existing data — no new
  backend needed**:
  - "Projet Bébé activé / Depuis N mois" ← `GET /api/profile`'s `stats.monthsActive` (existing
    proxy: months since `Profile.createdAt`, same field already used on `/app/profile`).
  - "Fenêtres fertiles / N fenêtres optimales" ← `stats.cyclesCompleted` (each completed `Cycle`
    row corresponds to one fertile-window estimate produced for that cycle).
  - "Taux d'ovulation régulière / N%" ← computed client-side from the already-fetched `/api/cycles`
    list: `(cycles without isOutlier) / cycles.length`. Shows "Pas encore assez de données" when
    `cycles.length === 0` rather than a fabricated percentage.
  - "Données enregistrées / N/M jours" ← `stats.daysTracked` (days with a `PeriodEvent` or
    `DailyLog`) over the day-count since `Profile.createdAt` — both real.
- **REUSE** `ConceptionTipsCard.tsx` — unchanged, moved to the Ressources tab.
- **NEW** inline fertility mini-calendar (no new file — composed directly in the page's Calendrier
  de fertilité tab) — reuses `MonthGrid`, `CalendarLegend`, `buildDayTypes` from `/app/calendar`,
  read-only (`onDayClick` omitted — this isn't the journal-entry calendar).
- **REWRITE** `frontend/src/app/app/baby/page.tsx` — adds tab state
  (`'apercu' | 'calendrier' | 'ressources'`), fetches `/api/profile` in addition to the existing 4
  calls, wires the new components.
- **DELETE** `TodaySignalsCard.tsx` (fully superseded by `LHTestTracker` + `OtherSignalsCard`).

## Token mapping (Banani → project, already established)

Reuses the project's existing `@theme` tokens (`green`/`green-soft` for fertility, `amber`/`amber-soft`
for ovulation/gold, `primary`/`primary-soft` for confidence, `rose`/`rose-soft`, `purple`) — all
already defined in `globals.css` from the earlier Banani theme fetch. No new tokens needed.

## LH result → copy/color mapping (real enum, not fabricated)

| `lhResult` | Badge label | Badge color | Status copy |
|---|---|---|---|
| `PEAK` | Pic positif | gold (`amber-soft`/`amber`) | "L'ovulation arrive généralement 24 à 36 heures après un pic de LH." |
| `POSITIVE` | Positif | gold-light | "Un pic pourrait suivre dans les prochains jours — continue à tester." |
| `NEGATIVE` | Négatif | gray/purple soft | — (no claim) |
| `INCONCLUSIVE` | Non concluant | gray | "Réessaie plus tard dans la journée avec un nouveau test." |
| _(none today)_ | — | — | prompts "Ajouter un test" |

## Responsive plan

- **Base (375px)**: tabs become a horizontally scrollable row; Aperçu grid stacks to 1 column
  (`FertilityWindowCard`, `OtherSignalsCard`, `LHTestTracker`, `ConceptionStatsCard` in that order);
  mini-calendar and `ConceptionTipsCard` full-width; Premium CTA stacks (text above button above
  gift emoji).
- **lg (1024px+)**: Banani's 2-column grid on Aperçu; Premium CTA row layout (text+button left,
  emoji right) as shipped.

## Verified

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` — run after implementation.
- Real browser check at 375/768/1280px: tabs switch, LH quick-add round-trips, temperature/mucus
  round-trip preserved, stats card shows real numbers (or honest fallback with 0 cycles).
