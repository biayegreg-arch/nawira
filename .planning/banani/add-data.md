# AddData ("Ajouter des données") — Banani → NAWIRA stack

## Source

**Real Banani source now available** (fetched 2026-09-07, superseding the
earlier no-source build): `AddDataPage.jsx` (`acguXQuGeGbU/screens/AddDataPage.jsx`),
composing `DataEntryForm.jsx`, `NawiraSidebar.jsx`, `TopBar.jsx`. This
replaces the previous no-Banani-source version built from the Phase 4 spec
alone — the Banani editor selection issue from earlier in the session
(stuck on `DashboardAujourdhui`) is resolved.

## Reconciliation — Banani vs. PRD LOG01 (§6.3) vs. already-shipped backend

Banani's `DataEntryForm` and the PRD's LOG01 table don't fully agree, and
neither can override the actual persisted data model. Rulings:

- **Keep all 4 already-shipped sections Banani's mockup omits** (Douleur,
  Énergie, Sommeil are core PRD LOG01 rows, not Projet-Bébé-gated — dropping
  them to match one Banani screenshot would be a regression, not a fix).
- **Règles**: Banani shows Oui/Non + 3-level intensity (Légère/Normale/
  Abondante). Restyled to match that two-step visual, but keeps all 4 real
  backend values (PRD's "aucun/spotting/léger/moyen/abondant" — dropping
  Spotting to match Banani's simplified 3-level mockup would lose real
  data capture). Non → flow stays `'NONE'` (client sentinel, no API call).
  Oui reveals: Spotting / Léger / Moyen / Abondant.
- **Symptômes**: Banani's mockup shows 6 illustrative options (Fatigue,
  Maux de tête, Ballonnements, Douleurs, Acné, Rien) — restyled to Banani's
  icon+label 2-column grid, but kept the full real 12-symptom backend enum
  (Banani's set reads as placeholder demo content, same pattern already
  established for fake landing-page stats/testimonials).
- **Température basale**: Banani's mockup includes a temperature quick-entry
  section directly on this screen — added here too (`GET`/`PUT
  /api/fertility-signals/today`, temperature field only). This is an
  intentional second entry point alongside `/app/baby`'s fuller
  `TodaySignalsCard` — same underlying row, same date, no conflict.
- **"Vie intime" section — NOT built.** Real Banani UI element with no
  backing field anywhere (not in `DailyLog`, not in the PRD's LOG01 table,
  not in any spec). Building the control without persistence would be a
  fake feature (violates this project's established "no fake content/features"
  precedent). **Open question for user**, flagged below — needs a product
  decision (new field + migration) before it can ship.
- **Date navigator (prev/next chevrons) — NOT built.** The backend only
  supports today (`/api/daily-logs/today`, `/api/fertility-signals/today` —
  both hard-coded to `todayUtcDate()`, no date param). Rendering
  interactive-looking chevrons that do nothing on click would be a fake
  affordance. Kept the static "Aujourd'hui — {date} — Jour N de ton cycle"
  header text (all 3 values are real), dropped the chevron buttons.
- **Progress indicator strip** (Règles/Symptômes/Humeur/Température/Notes,
  checkmark when filled) — kept, computed live from real form state, not
  decorative.
- **Right sidebar** (`Contexte du cycle` / tip / `Dernières saisies`) — kept,
  wired to real data:
  - Contexte du cycle: phase label derived from `/api/cycles` +
    `/api/predictions/current` (today vs. period dates vs. fertile window),
    jour du cycle, prochaines règles, ovulation estimée (all already-shipped
    fields, PRD §8.1 range framing preserved).
  - Conseil pour ta phase: one short, phase-keyed, non-diagnostic tip — same
    discipline as `ConceptionTipsCard`/HelpCenter.
  - Dernières saisies: **new backend endpoint** `GET /api/daily-logs/recent`
    (last 3 logs strictly before today) — needed because no endpoint existed
    to list past logs; without it this card would have to be faked.

## Component breakdown

- **REWORK** `src/components/log/DailyLogForm.tsx` — restructured into
  Banani's card-per-section visual style (icon+title header per card,
  matching `FertilityWindowCard`/`ConceptionTipsCard` conventions), all
  fields unchanged except Règles' two-step visual.
- **NEW** `src/components/log/CycleContextCard.tsx` — sidebar phase/stats card.
- **NEW** `src/components/log/PhaseTipCard.tsx` — sidebar phase-keyed tip.
- **NEW** `src/components/log/RecentEntriesCard.tsx` — sidebar recent-logs list.
- **NEW** `src/components/log/LogProgressBar.tsx` — the 5-step progress strip.
- **REUSE** `ChipGroup`, `Button`, `useUser`, `useToast`, `api`/`ApiError`.
- **NEW backend** `GET /api/daily-logs/recent` (`frontend/src/app/api/daily-logs/recent/route.ts`).

## Token mapping (Banani `/style.css` → project `globals.css`)

Confirmed already-matching (no changes needed): `primary` #6C43C1,
`primary-soft`(=primary-100) #EEE7FA, `rose`(=pink) #D968A6,
`rose-soft`(=pink-100) #F9E4EF, `green`(=fertility) #4F9D78,
`green-soft` #E2F3EA, `amber`(=gold) #D9A441, `amber-soft` #FBF1D8,
`purple`(=primary-500) #8058D4, `border`(=gray-200) #E5E7EB,
`muted-foreground`(=gray-500) #6B7280, `body`(=gray-700) #374151,
`sidebar-from`/`sidebar-to` #5B35A8/#4A2A95.

**New token needed**: Banani's tip-card background `primary-50` #F8F5FD has
no equivalent in `globals.css` — added as `--color-primary-faint`.

**Minor pre-existing drift, not fixed this pass** (flagged, not blocking):
`--color-primary-light` is `#a78be8` in our theme vs. Banani's current
`primary-300` `#B79AE8` — a one-character-per-channel difference from an
earlier session's transcription, low visual impact, not used in this screen.

## Responsive plan

- **Base (375px)**: single column throughout — sidebar cards (context/tip/
  recent) stack below the form, not beside it. Progress strip becomes a
  horizontally scrollable row (`overflow-x-auto`) rather than wrapping.
- **md (768px)**: still single column (matches `/app/settings`/`/app/cycles`
  precedent) — the 2-column form+sidebar split needs more width than tablet
  portrait comfortably gives a form this dense.
- **lg (1024px)+**: 2-column — `flex-1 max-w-2xl` form + `w-72` sidebar,
  matching Banani's desktop layout exactly.

## Interactions / state

- Same as before (chip hover/focus, loading skeleton, error banner, submit
  toast, no redirect after save) — unchanged, already verified conventions.
- Progress strip recomputes on every keystroke/toggle (derived from local
  form state, no extra fetch).

## Implementation checklist

- [ ] `GET /api/daily-logs/recent` + test
- [ ] `--color-primary-faint` token
- [ ] `LogProgressBar`, `CycleContextCard`, `PhaseTipCard`, `RecentEntriesCard`
- [ ] `DailyLogForm` rework (card style, Règles two-step, + Température section)
- [ ] `/app/log` page: fetch cycles+predictions+recent+signals alongside daily-log/today
- [ ] 375 / 768 / 1280px checks
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
- [ ] Real browser save round-trip

## Open questions for user

- **"Vie intime" (rapports sexuels Oui/Non)** — real Banani UI element, no
  backing field in `DailyLog`, not in PRD LOG01. Needs a product decision
  (new persisted field + migration) before it can ship honestly. Not built
  this pass.
