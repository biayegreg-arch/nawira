# Mobile audit — Group A (shared foundations)

Rules: docs/mobile-first-conventions.md. No props/API changes; class/markup only.

| File | Problems found | Fix applied |
|---|---|---|
| app/layout.tsx | No `viewport` export; no horizontal-overflow safety | `viewport` (device-width, initialScale 1, viewportFit cover, themeColor #6c43c1 from manifest); `overflow-x-hidden` on body |
| app/app/layout.tsx | Inline `minHeight:100vh`; `pb-20` ignores safe-area; main lacked `min-w-0` | `min-h-dvh`; `pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0`; `min-w-0` |
| app/admin/layout.tsx | Inline `100vh` (x2); main padding p-4 -> p-8 jump; `min-w-0` missing | `min-h-dvh`; `p-4 sm:p-6 lg:p-8`; `min-w-0` |
| app/onboarding/layout.tsx | none (auth gate only) | - |
| ui/Button | min height only implicit | `min-h-11` |
| ui/Field | input `text-sm` (iOS zoom), no width safety | `text-base md:text-sm`, `w-full min-w-0` |
| ui/ChipGroup | height implicit | `min-h-11` |
| ui/Badge, Skeleton, InitialsAvatar, AnimatedNumber | none (non-interactive, >=12px) | - |
| nav/MobileBottomNav | no z-index; link height implicit; | `z-40`; `min-h-11 justify-center` (safe-area already present) |
| app/AppTopBar | py-3 + gap-4 crowded at 360; greeting could overflow | `gap-2 py-2` (lg restores), `min-w-0 truncate` on greeting |
| app/GlobalSearch | 36px icon button; 16px rule broken (`text-sm` inputs); 11px group label; result rows <44px; `max-h-96` too tall with keyboard | `h-11 w-11`; `text-base`; `text-xs`; `min-h-11`; `max-h-[60dvh] sm:max-h-96`; `inset-x-4`; min-w-0 |
| app/NotificationBell | 36px button; 320px panel anchored right of bell overflowed 360px viewport; 10px badge; mark-all link small | `h-11 w-11`; panel `fixed inset-x-4 top-16` on mobile, `sm:absolute sm:w-80`; badge `text-xs h-5`; `min-h-11` link; `max-h-[60dvh]` |
| app/UserMenu | 36px avatar button; w-64 panel; rows ~40px | `h-11 w-11`; `fixed inset-x-4 top-16 max-h-[calc(100dvh-5rem)] overflow-y-auto` mobile / `sm:absolute sm:w-64`; rows `min-h-11` |
| app/LogoutModal | close 36px; buttons <44px; p-6 heavy; no scroll cap | `h-11 w-11`; `min-h-11`; `p-4 sm:p-6`; `max-h-[85dvh] overflow-y-auto` |
| app/LogoutButton | none (className from caller) | - |
| app/AdminAccessBanner | text side lacked min-w-0 | `min-w-0` |
| app/OfflineDataBanner | none | - |
| app/SyncStatusIndicator | text pills + long "Échec de synchronisation" crowd the 360px top bar; error button <44px | label text `sr-only sm:not-sr-only` (icon-only on mobile, copy unchanged for AT/desktop); retry button `min-h-11 min-w-11` + aria-label; `shrink-0` |
| app/ComingSoonPage | py-24 excessive; link <44px | `py-16 sm:py-24`; `md:text-2xl`; link `min-h-11` |
| app/AppSidebar (desktop) | 10/11px text below 12px floor | `text-xs` |
| admin/AdminSidebar (desktop) | 10/11px text | `text-xs` |
| admin/AdminTopBar | h1 + back link + logout overflowed 360px; targets <44px | `flex-wrap gap-y`, `min-w-0`, link/button `min-h-11` |
| admin/AdminMobileNav | select `text-sm` (iOS zoom) | `text-base min-h-11` |
| admin/RecordDetailModal | `85vh`; close 36px; p-5; 11px pre | `85dvh`; `h-11 w-11`; `p-4 sm:p-5`; `text-xs`; title `break-words` |
| admin/UserDetailModal | NO scroll (tall content clipped on small screens); inputs `text-sm`; buttons <44px; close 36px | panel `flex max-h-[85dvh] flex-col`, body `overflow-y-auto`; inputs `text-base md:text-sm py-3`; buttons `min-h-11`; delete confirm `flex-col sm:flex-row`; `min-w-0/break-words` |
| admin/AdminListSkeleton, AdminComingSoonPanel | none (inline style only for dynamic values) | - |
| onboarding/OnboardingLayout | `min-h-screen`; py-8 fixed; no safe-area | `min-h-dvh`; `pt-6 md:pt-8`, bottom pad with safe-area |
| onboarding/OptionCard | text column lacked min-w-0 | `min-w-0 break-words` |
| pwa/ServiceWorkerUpdateBanner | sat behind bottom nav (bottom-4); buttons small | `bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-4`; `min-h-11`, close `h-11 w-11`; `min-w-0` |
| pwa/PwaRegister | none (logic only) | - |
| app/globals.css | `animate-scale-in` / `fade-in-up` end state `transform: scale(1)/translateY(0)` with fill `both` keeps a transform -> becomes containing block for `fixed` descendants (LogoutModal opened from UserMenu was positioned/clipped inside the 256px menu panel, and the new mobile fixed popovers would be too) | final keyframe `transform: none` |

## Deliberately left
- AppSidebar/AdminSidebar link rows (py-2.5, ~40px): desktop-only (`lg:`) sidebars, pointer UI.
- OnboardingLayout `max-w-sm` kept (already centered; widening would alter all onboarding pages, which are Group other).
- Popover `top-16` assumes top bar height ~60px (py-2 + 44px controls); top bar is non-sticky so it scrolls away — panel is `fixed`, still opens at viewport top-16 (acceptable).
- Body `overflow-x-hidden` is a safety net only; page-level overflow bugs still belong to the page groups.
- Nothing above the bar's 56px: top bar is 60px on mobile (44px controls required), non-sticky.
- Bottom nav labels at `text-xs` (floor) kept; 5 items fit 360px.
