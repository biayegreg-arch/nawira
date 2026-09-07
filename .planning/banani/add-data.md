# AddData ("Journal quotidien") — no Banani source → NAWIRA stack

## Source

No Banani screen available. The selection in the Banani editor stayed on
`DashboardAujourdhui` (already shipped) across two fetch attempts; the
user confirmed (2026-09-07) to build this screen directly from the
already-approved design spec instead of waiting further, matching the
project's existing precedent for Signup/Login/Verify-email (also built
without a Banani source, from a written contract).

Authoritative contract: `docs/superpowers/specs/2026-09-07-phase4-daily-journal-design.md`,
Section 4 ("UI — `/app/log`").

## Structure map

- **Flow section**: 5 single-select chips (Aucun/Spotting/Léger/Moyen/Abondant).
  Always defaults to "Aucun" on load — there is no endpoint that returns
  today's actual `PeriodEvent.flow` (spec's Flow Integration section is
  explicit: "no new endpoint"), only `GET /api/cycles`'s `todayLogged`
  boolean. If `todayLogged` is true, an inline note tells the user a flow
  is already logged and re-selecting a value corrects it (matches spec
  §1's "correcting a mistaken value already works via upsert").
- **Pain section**: 0–10 range slider (`painLevel`) + free-text input
  (`painLocation`), always both visible (not gated on painLevel > 0).
- **Mood section**: 5 single-select chips (`mood`).
- **Energy section**: 5 single-select chips (`energy`).
- **Sleep section**: 4 single-select chips (`sleepQuality`) + optional
  number input, step 0.5, 0–24 (`sleepHours`).
- **Symptoms section**: 12 multi-select chips (`symptoms`).
- **Note section**: optional textarea, max 1000 chars, live counter.
- **Submit**: one "Enregistrer" button. Always `PUT /api/daily-logs/today`;
  additionally `POST /api/period-events` only if flow ≠ "Aucun" — two
  independent calls, matching spec exactly (the already-reviewed
  `period-events` transaction stays untouched).

## Component breakdown

- **NEW** `src/components/ui/ChipGroup.tsx` — generic single/multi toggle
  chip row. Takes `options`, `selectedValues: string[]`, `onToggle: (v) =>
  void`; the caller's state-update decides single vs. multi selection
  (single: replace-or-clear; multi: push/remove). Reused 6 times (flow,
  mood, energy, sleep quality, symptoms) — well past the rule-of-three
  floor.
- **NEW** `src/components/log/DailyLogForm.tsx` — the whole form body
  (all 6 sections + submit), receiving initial values as props and an
  `onSubmit` callback; kept separate from the page component so the page
  only handles data-fetching/loading/error/toast wiring.
- **NEW** `src/app/app/log/page.tsx` — fetch orchestration: `GET
  /api/daily-logs/today` + `GET /api/cycles` (for `todayLogged` only) on
  mount, loading skeleton, error banner, wires `DailyLogForm`'s submit to
  the two API calls.
- **REUSE** `Button` (`src/components/ui/Button.tsx`), `useUser`,
  `useToast`, `api`/`ApiError` — same as every other `/app/*` screen.

## Token mapping

No Banani tokens to map (no source fetched). Uses only already-established
project tokens: `primary`/`primary-soft`, `rose`/`rose-soft` (flow chips,
matching `PeriodLogCta`'s existing rose treatment for period-related UI),
`border`, `navy`, `muted-foreground`.

## Responsive plan

- **Base (375px)**: single column, full-width chip rows wrap naturally,
  full-width submit button, generous vertical spacing between sections
  (`flex flex-col gap-6`).
- **md (768px)+**: max-width container (`max-w-2xl mx-auto`) so form
  fields don't stretch edge-to-edge on tablet/desktop — matches
  `/app/cycles`' and `/app/settings`' existing max-width pattern.
- **lg (1024px)+**: same as md; this is a form, not a dashboard — no
  multi-column layout benefit, consistent with how `/app/settings`
  stayed single-column at desktop too.

## Interactions / state

- Chip hover: `hover:bg-gray-50` (unselected only, matches `OptionCard`).
- Focus rings: native on slider/number/textarea inputs; chips get
  `focus-visible` browser default (no custom outline removal).
- Touch targets: chips sized `px-4 py-3` (≥44px, matches `Button`'s `md`
  and `Field`'s input height convention already established).
- Loading: skeleton block, matches `/app/cycles` (`h-64 animate-pulse`).
- Error (GET failed): red banner, matches `/app/today`/`/app/cycles`.
- Submit error: toast via `useToast`, form state preserved (no reset).
- Submit success: toast "Enregistré", re-fetch to reflect the saved
  state (no redirect — spec §4 explicit: user may want to review).

## Copy / i18n

All French, all inline in the components (short, static, screen-specific
labels — matches how `/app/today`/`/app/cycles` inline their own copy
rather than routing single-use strings through `constants.ts`):

- Flow: Aucun / Spotting / Léger / Moyen / Abondant
- Mood: Très bien / Bien / Fatiguée / Stressée / Humeur basse
- Energy: Très faible / Faible / Moyenne / Élevée / Très élevée
- Sleep quality: Mauvaise / Correcte / Bonne / Excellente
- Symptoms: Crampes / Maux de tête / Ballonnements / Nausées / Acné /
  Seins sensibles / Fatigue / Douleurs dorsales / Constipation /
  Diarrhée / Envies alimentaires / Changement de libido
- Section headings: "Saignements", "Douleur", "Humeur", "Énergie",
  "Sommeil", "Symptômes", "Note"

## Implementation checklist

- [ ] `ChipGroup` primitive
- [ ] `DailyLogForm` (6 sections + submit)
- [ ] `/app/log` page (fetch, loading, error, wire submit)
- [ ] 375px check
- [ ] 768px check
- [ ] 1280px check
- [ ] Touch targets ≥44px
- [ ] Loading/error states
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
- [ ] Real browser check (dev server, logged-in session)

## Open questions for user

None blocking — flow-prefill limitation (no GET exposing today's actual
flow value) is a direct, explicit consequence of the spec's own "no new
endpoint" decision, not a new ambiguity.
