# NAWIRA — Mobile-first conventions

Target: **375px wide first** (iPhone SE/13 mini, small Android at 360px must also work),
then layer `sm:` (640) → `md:` (768) → `lg:` (1024) → `xl:` (1280). Unprefixed classes ARE the mobile layout.
Never write desktop-first and override downward.

## Layout
- Page gutter: `px-4` on mobile, `sm:px-6`, `lg:px-8`. Vertical rhythm `py-6 md:py-8`.
- **No horizontal scroll at 360px, ever.** Nothing wider than the viewport: no fixed `w-[NNNpx]`
  larger than ~320px without `max-w-full`; wide content (tables, code, long tokens) goes inside
  `overflow-x-auto` or is reflowed into stacked cards on mobile. Use `min-w-0` on flex/grid children that hold text,
  `break-words` / `truncate` for emails, ids and long strings.
- Grids: base `grid-cols-1` (or `grid-cols-2` only for compact tiles/chips), add `sm:`/`md:`/`lg:` columns upward.
  Flex rows that hold 2+ groups of content: base `flex-col`, `sm:flex-row` (or `flex-wrap`).
- Forms, auth cards and single-column content are **centered**: wrapper `mx-auto w-full max-w-md` (auth/onboarding)
  or `max-w-2xl` (settings/profile forms), inside a `px-4` gutter; vertically centered only when the page is short
  (`min-h-dvh flex items-center justify-center`), otherwise top-aligned with `py-6`.
- Use `min-h-dvh` (not `h-screen`/`100vh`) for full-height screens. Respect safe areas on fixed bars:
  bottom nav / sticky CTAs use `pb-[env(safe-area-inset-bottom)]`; content above a fixed bottom nav has matching bottom padding.
- Modals/sheets: full-width bottom sheet or `max-w-[calc(100vw-2rem)]` on mobile, inner content scrolls (`max-h-[85dvh] overflow-y-auto`).

## Typography (mobile base, scale up)
- Page title (h1): `text-2xl font-bold md:text-3xl` (never bare `text-3xl+` at base). Hero/landing h1: `text-3xl md:text-5xl` max at base 3xl.
- Section title (h2): `text-lg md:text-xl`. Card title (h3): `text-base md:text-lg`.
- Body: `text-sm md:text-base` (min readable 14px). Secondary/caption: `text-xs` (12px) is the floor — nothing smaller than 12px.
- Big stat numbers: `text-3xl md:text-4xl` max at base. Add `leading-tight` on large headings, `text-balance` on centered headings.
- **Inputs, selects, textareas: `text-base` (16px)** at mobile so iOS Safari does not zoom on focus (`md:text-sm` allowed).

## Touch
- Every tappable element **≥ 44×44px** (`min-h-11`, buttons `h-11`/`py-3`; icon buttons `h-11 w-11`). Primary CTAs `h-12`.
- ≥ 8px (`gap-2`) between adjacent tap targets. No hover-only affordances.
- Primary form CTA is full width on mobile (`w-full sm:w-auto`), unless it sits in an inline toolbar.
- Focus ring stays visible (`focus-visible:ring-2`).

## Components / media
- Images/SVG: `max-w-full h-auto`; decorative mockups must shrink or hide (`hidden sm:block`) rather than overflow.
- Tables: on mobile either `overflow-x-auto` wrapper with `min-w-[…]` on the table, or a stacked-card list under `md:hidden` + table `hidden md:table`. Prefer stacked cards for admin lists with ≤5 key fields.
- Long text rows in flex: text side `min-w-0 flex-1`, action side `shrink-0`.
- Sticky/fixed headers ≤ 56px tall on mobile; nothing overlapping content (account for them with padding).

## Verification checklist per page (do all of them)
1. 375px and 360px: no horizontal scroll; nothing clipped; forms centered; h1 ≤ 2xl.
2. Every form field/button meets the touch-size and 16px-input rules.
3. Loading, empty and error states also fit at 375px.
4. 768px and 1280px still look intentional (no huge stretched inputs: constrain with `max-w-*`).
