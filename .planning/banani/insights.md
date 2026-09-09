# Analytics (`/app/insights`) — Banani → Next.js/Tailwind

## Source
- Banani screen: `Analytics` (`screenSize: "desktop"`), composed of 5 shared components:
  `CycleScoreCard`, `SymptomStatistics`, `MoodDistributionChart`, `CycleComparisonCard`,
  `AnalyticsRecommendations`.
- Fetched: 2026-09-06 (batch), re-fetched + structurally extracted in full: 2026-09-09.

## System context (Step 0 answers)

1. **Route**: `/app/insights` (already exists as a `ComingSoonPage` placeholder —
   `frontend/src/app/app/insights/page.tsx`). Sidebar/mobile-nav label "Analyses" already wired.
2. **Auth**: gated, same `useUser()` + `hasProfile` pattern as every other `/app/*` page.
3. **Reads**: `GET /api/insights` (Phase 6, `frontend/src/app/api/insights/route.ts` →
   `deriveInsights()`) returns `{ eligible, cycleScoreToday, insights: Insight[], meta }`.
   Also reads `GET /api/predictions/current` (existing Phase 3/5 endpoint, already consumed
   elsewhere e.g. `PredictionCard`) for `prediction.confidence` (LOW/MEDIUM/HIGH).
4. **Writes**: none — read-only screen.
5. **Nav**: entry via sidebar/bottom-nav "Analyses". "Voir tous les cycles" → real link to
   `/app/cycles` (already shipped). No other nav-out.
6. **Reuse**: `Icon`-equivalent is `lucide-react` (already the project convention). No existing
   card/chip component fits directly — building 5 new domain components in
   `frontend/src/components/insights/`.
7. **Empty/loading/error**: Banani shows none of these. `eligible: false` (not enough cycle/log
   history) is a normal 200, not an error — needs a real empty-state design (see below).
8. **Side effects**: none.

## Real-data mapping decisions (confirmed with user via AskUserQuestion, 2026-09-09)

### 1. CycleScoreCard — "real data throughout"
- **Headline ring**: `CYCLE_SCORE_TREND.data.current` (avg score of the in-progress cycle) when
  present → label "Score moyen de ce cycle". Falls back to `cycleScoreToday` when
  `CYCLE_SCORE_TREND` isn't in `insights` (not `eligible`) → label "Ton score aujourd'hui". If
  both are `null`, the ring is replaced with a small "Pas encore assez de données" placeholder
  (no fabricated number, ever).
- **3 dimension bars** — each independently gated on its own real source (not all-or-nothing):
  - **Régularité du cycle**: from `CYCLE_VARIABILITY` insight. `REGULAR`→"Élevée" (fertility
    green), `SOMEWHAT_VARIABLE`→"Moyenne" (gold), `IRREGULAR`→"Faible" (error red). Bar width:
    `clamp(100 - stddev * 10, 15, 100)`. Absent (no `CYCLE_VARIABILITY`, <2 complete cycles) →
    row shows "Pas encore assez de cycles" instead of a bar.
  - **Prévisibilité**: from `prediction.confidence` (`GET /api/predictions/current`). `HIGH`→
    "Élevée"/90%, `MEDIUM`→"Moyenne"/60%, `LOW`→"Faible"/30% (fixed widths — confidence is
    categorical, not continuous). Absent (`prediction: null`) → "Pas encore de prédiction".
  - **Complétude des données**: heuristic off `meta.dailyLogsAnalyzed` (always available,
    independent of `eligible`): `<10`→"Faible"/25%, `10-29`→"Bonne"/65%, `≥30`→"Excellente"/95%.
    Labeled explicitly as a proxy, never framed as a precise percentage.
- **"Points clés" (key insights)** — 1-3 real bullets instead of Banani's 3 hardcoded ones,
  built conditionally:
  - `CYCLE_VARIABILITY.label === 'REGULAR'` → "Ton cycle est régulier avec une durée moyenne de
    {AVG_CYCLE_LENGTH.average} jours." (only if `AVG_CYCLE_LENGTH` present too — it always is
    alongside `CYCLE_VARIABILITY`, same eligibility gate).
  - `CYCLE_VARIABILITY.label !== 'REGULAR'` → "Certains cycles montrent des variations de durée.
    Continue à observer." (warning icon, matches Banani's copy — now conditionally real).
  - `meta.dailyLogsAnalyzed >= 10` → "Tu enregistres tes données régulièrement, ce qui améliore
    les prédictions." else → "Ajoute plus de données pour affiner tes analyses."
  - If `eligible === false` and `dailyLogsAnalyzed < 10`: single bullet only, no fabricated
    3-bullet list.
- **"Voir le rapport détaillé" button** — dropped entirely (no detail-report route exists
  anywhere; no fake affordance, matches the HelpCenter/Calendar precedent).

### 2. MoodDistributionChart — "extend the backend"
- New insight type `MOOD_DISTRIBUTION` added to `compute-insights.ts`. Real `DailyLog.mood`
  enum (`VERY_GOOD | GOOD | TIRED | STRESSED | LOW`, from `frontend/src/components/log/
  DailyLogForm.tsx`'s `MOOD_OPTIONS`) maps **exactly** to Banani's 5 mock rows, same French
  labels, same fixed display order (Très bien → Humeur basse, not sorted by count — matches
  Banani, which also doesn't sort by count).
- Gate: reuse `MIN_DAILY_LOGS_FOR_SYMPTOMS` (5) — same threshold as `TOP_SYMPTOMS`, same
  underlying data source (`dailyLogs`).
- Shape: `{ type: 'MOOD_DISTRIBUTION', evidenceCount, data: { distribution: Array<{ mood:
  MoodValue; count: number; percentage: number }> } }`, always all 5 mood values present (count
  0 renders a 0%-width bar, not omitted — keeps the list visually stable).
- No "trend" — none existed in the mock's own data model either (single-period snapshot).

### 3. AnalyticsRecommendations — "data-aware rule-based tips"
- Rule-based, evaluated in this fixed priority order, capped at 3 shown, each independently
  gated on real data (never fabricated):
  1. **Regularity rule**: if `CYCLE_VARIABILITY.label !== 'REGULAR'` → tracking-consistency tip
     (icon `activity`, purple).
  2. **Top-symptom rule**: if `TOP_SYMPTOMS` has a top entry in some phase with `frequency >=
     0.4` → phase-aware wellness tip naming that real symptom + real phase (icon depends on
     symptom category — see Symptom icon map below; e.g. fatigue → rest tip, cramps/pain →
     comfort tip, bloating → hydration tip).
  3. **Mood rule**: if `MOOD_DISTRIBUTION` shows `TIRED + STRESSED + LOW` combined `percentage
     >= 40` → mental-wellbeing tip (icon `moon`, purple).
  4. **Fallback (not eligible / no rule fired)**: 1-2 generic, non-personalized tips from a
     small fixed set (same cautious, hedged copy discipline as `/app/baby/tips`'s
     `conception-tips-full.ts` and `/app/today`'s `DailyTip` — "peut aider" not "aide"),
     explicitly captioned as general until more data exists.
- Same visual shell as Banani (icon + alternating purple/pink bg + title + body + "→" link),
  but the "→" links are dropped (no target page exists for any of them — "Voir les détails" /
  "Conseils santé" / "Guide de bien-être" all pointed nowhere in the mock and still point
  nowhere for real; keeping a dead link button would be a fake affordance).
- Disclaimer footer kept verbatim ("Ces recommandations sont basées sur ton historique...").

### 4. Filter tabs — "drop"
- The 3 tabs ("6 derniers mois" / "Dernière année" / "Tout le temps") are removed entirely.
  `/api/insights` has no date-range param; adding one is out of scope for this pass.

## Additional real-data reconciliation (my own calls, not asked — mechanical translations)

- **CycleComparisonCard**: Banani's 3 hardcoded calendar-month rows → 2 real cards, forced by
  the actual `CYCLE_COMPARISON` shape (`current`/`previous`, no calendar-month concept):
  - **"Cycle actuel"** (only rendered if `current !== null`, i.e. an open cycle exists): "Jour
    {daysElapsed}" badge (gold, "en cours" styling — matches Banani's Octobre row), body line
    using `periodLengthSoFar`/`symptomCount`/`avgCycleScore` (whichever are non-null), icon
    `info`.
  - **"Cycle précédent"**: `length` jours badge (purple, "completed" styling — matches Banani's
    Août/Septembre rows), body line using `periodLength`/`symptomCount`/`avgCycleScore`, icon
    `calendar`.
  - No calendar-month names (real cycles don't align to calendar months) and no "Fertile: X
    jours" (no fertile-day-count field in this insight) — dropped, not fabricated.
  - Footer button "Voir tous les cycles" → **real** `<Link href="/app/cycles">` (that screen
    already ships from the `CycleDetailFull` pass).
  - Whole card gated: if `CYCLE_COMPARISON` insight absent (not eligible), show one small
    "Pas encore assez de cycles complétés" note instead of the card body.
- **SymptomStatistics**: Banani's flat 5-item list → real data is phase-bucketed
  (`byPhase: Record<CyclePhase, ...>`). Redesigned as a phase chip-row (Règles / Phase
  folliculaire / Ovulation / Phase lutéale — reusing this project's existing phase-label
  convention from `CycleContextCard.tsx`/`PhaseTipCard.tsx`), defaulting to whichever phase has
  the highest `daysLogged` (most representative), showing that phase's real top-3
  `{symptom, count, frequency}` rows. **Trend arrows dropped** — no real trend metric exists
  (Banani's up/down/stable was pure mock, no historical-comparison data anywhere in this
  insight). Bar fill = `frequency * 100`. Symptom icon map (extends Banani's partial mapping to
  all 12 real `SYMPTOM_OPTIONS` values):
  `CRAMPS→heart, HEADACHE→cloud-rain, BLOATING→wind, NAUSEA→frown, ACNE→star,
  TENDER_BREASTS→heart-pulse, FATIGUE→zap, BACK_PAIN→align-justify, CONSTIPATION→circle-slash,
  DIARRHEA→droplets, FOOD_CRAVINGS→cookie, LIBIDO_CHANGE→flame`.
  Gated on `TOP_SYMPTOMS` presence (needs ≥5 daily logs); absent → "Pas encore assez de
  données" note.
- **Premium CTA block** — real `<Link href="/app/billing">`, same pattern as every prior screen
  (Subscription, ProjetBebe). Kept as-is otherwise (copy, 👑/✨ emoji, layout).
- Dead imports (`UserAvatar`, unused `Icon` in `Analytics.jsx`/`MoodDistributionChart.jsx`) —
  not carried over.

## Component breakdown

- **NEW** `frontend/src/lib/server/insights/mood-distribution.ts` — pure function computing the
  `MOOD_DISTRIBUTION` insight (or inline it in `compute-insights.ts` alongside the others,
  matching that file's existing single-file style for all 6 current insight types — decided:
  **inline in `compute-insights.ts`**, no new file, for consistency with how
  `AVG_CYCLE_LENGTH`/`TOP_SYMPTOMS`/etc. are all computed in one place today).
- **MODIFY** `frontend/src/lib/server/insights/compute-insights.ts` — add `MOOD_DISTRIBUTION` to
  `InsightType`, add `MoodDistributionInsight` interface, add to the `Insight` union, compute it
  inside `deriveInsights()` gated on `dailyLogs.length >= MIN_DAILY_LOGS_FOR_SYMPTOMS`.
- **MODIFY** `frontend/src/lib/server/insights/compute-insights.test.ts` — add test cases for
  the new insight type (present/absent gating, count/percentage correctness, fixed ordering).
- **NEW** `frontend/src/components/insights/CycleScoreCard.tsx` — ring + 3 dimension bars + key
  insights. Fetches nothing itself (receives `InsightsResult` + `prediction` as props from the
  page).
- **NEW** `frontend/src/components/insights/SymptomStatistics.tsx` — phase chip-row + top-3 list.
- **NEW** `frontend/src/components/insights/MoodDistributionChart.tsx` — 5-row distribution list.
- **NEW** `frontend/src/components/insights/CycleComparisonCard.tsx` — current/previous cards +
  real link to `/app/cycles`.
- **NEW** `frontend/src/components/insights/AnalyticsRecommendations.tsx` — rule-evaluation +
  render, pure function `deriveRecommendations(insights, moodInsight)` colocated in the same
  file (client-safe, no server-only import needed — pure data transform).
- **REPLACE** `frontend/src/app/app/insights/page.tsx` — fetches `GET /api/insights` +
  `GET /api/predictions/current` in parallel, loading/error handling, composes the 5 cards +
  premium CTA, renders the top-level `eligible: false` empty state when `insights.length === 0`
  **and** `cycleScoreToday === null` (i.e., truly nothing to show yet — partial data still
  renders whichever cards have real data, per each card's own internal gating above).

## Token mapping (Banani → project, already-established `globals.css` tokens — no new tokens
needed, this screen introduces zero new hex values beyond what `Subscription`/`ProjetBebe`
already added)

| Banani inline hex | Project token/class |
|---|---|
| `#6C43C1` | `text-primary` / `bg-primary` |
| `#8058D4` | `--color-primary-500` (already in `globals.css`) |
| `#B79AE8` | `--color-primary-300` |
| `#EEE7FA` | `--color-primary-100` / `bg-primary-faint`-equivalent |
| `#F8F5FD` | `--color-primary-50` |
| `#D968A6` / `#FDF5F9` | `text-pink` / `--color-pink-50` |
| `#4F9D78` | `text-fertility` (success-ish green, already used) |
| `#D9A441` / `#FBF1D8` | `text-amber`/gold (already used in `CycleContextCard`) |
| `#C94B5F` | `text-error`/rose |
| `#F9FAFB` | `bg-gray-50`-equivalent |
| `rounded-pill` | already a project radius token (`--radius-pill`) |

## Responsive plan (mandatory — Banani is desktop-only, `screenSize: "desktop"`)

- **Base (375px)**: single column throughout. Header stacks normally. Grid
  (`CycleScoreCard`+`CycleComparisonCard` / `SymptomStatistics`+`MoodDistributionChart`)
  collapses to one column, natural document order: CycleScoreCard → SymptomStatistics →
  MoodDistributionChart → CycleComparisonCard → AnalyticsRecommendations → Premium CTA. SVG ring
  scales down slightly (`w-28 h-28` vs `w-32 h-32`) to avoid crowding on narrow screens. Phase
  chip-row in `SymptomStatistics` becomes horizontally scrollable (same `overflow-x-auto` pattern
  as Assistant's `TopicsChipRow`).
- **md (768px+)**: 2-column grid begins (`grid-cols-2`), matching Banani's layout.
  `SymptomStatistics` phase chips no longer need scrolling (fit in one row).
  `AnalyticsRecommendations` and the Premium CTA stay full-width below the grid at every size.
- **lg (1024px+)/xl**: matches Banani's desktop mockup as fetched — max-width container
  consistent with every other `/app/*` page (no new container convention needed).
- Touch targets ≥48px on all interactive elements (phase chips, the one real "Voir tous les
  cycles" link).

## Interactions / states

- **Loading**: skeleton or simple centered spinner while both `GET` calls are in flight (same
  pattern as `/app/baby`, `/app/cycles`).
- **Error**: toast + inline retry, matching existing page-level error conventions.
- **Not eligible at all** (`insights.length === 0 && cycleScoreToday === null`): full-page empty
  state — icon + "Pas encore assez de données" + a real CTA link to `/app/log` ("Commence à
  enregistrer tes données quotidiennes pour débloquer tes analyses"), matching the tone of
  `/app/baby`'s and `/app/cycles`'s existing empty states.
- **Partial eligibility** (some insights present, others not): each card/section handles its own
  gate independently as specified above — never an all-or-nothing page.
- Phase chip-row: keyboard-focusable buttons, visible focus ring, `aria-pressed` for the
  selected phase.

## Copy / i18n

All strings inline in the new components (matches this project's established convention —
`constants.ts` is not used for per-screen copy; see `DailyLogForm.tsx`/`assistant/page.tsx`
precedent). No English anywhere.

## Implementation checklist

- [ ] Extend `compute-insights.ts` with `MOOD_DISTRIBUTION` + tests, `pnpm test` green
- [ ] Build `CycleScoreCard.tsx` (ring, 3 bars, key insights, per-source gating)
- [ ] Build `SymptomStatistics.tsx` (phase chips, top-3 list, icon map)
- [ ] Build `MoodDistributionChart.tsx`
- [ ] Build `CycleComparisonCard.tsx` (current/previous, real `/app/cycles` link)
- [ ] Build `AnalyticsRecommendations.tsx` (rule engine + fallback tips)
- [ ] Replace `frontend/src/app/app/insights/page.tsx` (parallel fetch, loading/error/empty
      states, composition)
- [ ] 375px check — single column, no horizontal scroll, phase chips scroll correctly
- [ ] 768px check — 2-column grid
- [ ] 1280px check — matches Banani desktop layout
- [ ] Touch targets ≥48px
- [ ] Empty (`eligible:false`)/partial-eligibility/loading/error states all verified live
- [ ] Real browser round-trip: seeded test data covering both eligible and not-yet-eligible
      states
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` green
- [ ] Commit, update `STATUS.md`

## Open questions for user

None outstanding — the 4 consequential decisions were confirmed via AskUserQuestion
(2026-09-09); all other deltas above are mechanical translations forced by the real API shape,
not judgment calls.
