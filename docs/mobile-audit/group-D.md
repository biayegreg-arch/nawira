# Mobile audit — Group D (core tracking app)

Rules: docs/mobile-first-conventions.md. Class-only changes; no copy/logic changes.

| Page / component | Problems | Fixes |
|---|---|---|
| today/page | h1 no md scale; single column stretched at md; grid `1fr` min-content overflowed 1280 (scrollW 1339); p-6 cards heavy at 360 | h1 `md:text-3xl leading-tight`; `mx-auto max-w-3xl lg:max-w-none`; grid `minmax(0,1fr)`; `sm:p-6` gutters, p-4/p-5 on mobile |
| MoodSelector | 5 `flex-1` buttons ~48px wide, labels ("Humeur basse") overflowed | `grid-cols-3 sm:grid-cols-5`, `min-h-16 min-w-0`, centered wrapping label |
| PeriodLogCta | secondary button 42px, CTA 44px, wrapper shrank | `min-h-12` primary, `min-h-11` secondary, wrapper `w-full`, icons `shrink-0`, row only at xl |
| MiniCalendar, PredictionCards, ProjetBebeCard | "Voir tout"/links < 44px, text `min-w-0` missing, xs body | `min-h-11` links, `min-w-0 flex-1`, body `text-sm` |
| log/page | no centered column at md, h1 no scale | `mx-auto max-w-2xl lg:max-w-none`, h1 scale, gutters |
| DailyLogForm | inputs 14px (iOS zoom), slider 16px hit area, sleep field fixed 160px, textarea not full width, temp row could overflow, CTA 44px, p-6 cards | `text-base md:text-sm`, `h-11` slider, full-width sleep field, `w-full` textarea, wrap on temp row, CTA `min-h-12`, `p-4 sm:p-6` (bottom-nav clearance already in app layout: `pb-[calc(5rem+safe-area)]`) |
| LogProgressBar | inner horizontal scroll (5 nowrap steps) | wraps; dividers `sm:` only |
| PeriodTodayCard | Oui/Non 42px | grid 2 cols, `min-h-11`, `p-4 sm:p-6` |
| PeriodRangeForm | two date inputs side by side in 138px each; h3 text-sm; CTA 44px | 1 col base / 2 sm, h3 `text-base`, CTA `min-h-12` |
| CycleContext / PhaseTip / RecentEntries | h3 text-sm, xs body, text not truncating | h3 `text-base`, `text-sm` rows/body, `min-w-0 break-words` |
| calendar/page + MonthGrid + Legend | 36px cells with xs numbers, fixed size, today hit area 36px, legend gap, link 20px tall | cells `aspect-square w-full max-w-10 sm:max-w-11 text-sm`, `min-w-0` columns, today hit area expanded via `before:-inset-1` (48px), legend `gap-y-2`, h1 scale, link `min-h-11`, card `p-4` |
| cycles/page + CycleListItem | h1 no scale, breadcrumb no wrap, back link 20px, row text not `min-w-0` | wrap breadcrumb, `min-h-11`, h1 scale, `min-w-0 flex-1 break-words`, `text-sm` |
| insights/page | h1 scale, single column stretched at md, CTA 40px, decorative ✨ eats width, p-8 empty | `max-w-3xl lg:max-w-none`, `min-h-11/12` CTAs, ✨ `hidden sm:block`, `p-6 sm:p-8` |
| CycleScoreCard | ring + 3 dimension rows squeezed in 144px at 360; title xl | ring stacks on top (`flex-col sm:flex-row`), score `text-3xl`, title `text-lg md:text-xl`, `p-4 sm:p-6`, `text-sm` insights |
| Symptom/Mood/Comparison/Analytics cards | h2 text-lg at base, rows without `min-w-0`, xs body, link 40px | h2 `text-base md:text-lg`, `min-w-0 flex-1 gap-2`, `text-sm` body, `min-h-11` link, `p-4 sm:p-6` |

## Verification
Playwright (mobile emulation, DPR 2) on `next dev -p 3111`, `/api/auth/me` + data endpoints (`/api/cycles`, `predictions/current`, `daily-logs/today|recent`, `fertility-signals/today`, `insights`) mocked in `scratchpad/d-shot.mjs` (SCEN=full|empty|error; worst-case: 12 symptoms per phase, 4 cycles incl. outlier, 5 recent entries with 8 symptoms). All 5 pages x 3 states x {375, 360}: scrollWidth == innerWidth, zero off-screen elements, h1 24px (30px at 768/1280). 768 and 1024/1280: no overflow, content column constrained. Screenshots reviewed: today, log, insights (360, full). Sub-44px measured items are only disabled (non-interactive) calendar day buttons (28px mini, 40px full); the clickable "today" cell has a 48px hit area. Sidebar links at lg are 40px (layout, out of scope).

## Left
- Error states render only the message box (no h1) as before; fits 375.
- Disabled calendar days not enlarged (not tappable).
- Not visually reviewed by eye: empty/error/768/1280 screenshots (measurements only).
