import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { CSSProperties } from 'react';

/** Merge Tailwind classes with conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format an integer amount with regular ASCII space as thousands separator. */
export function formatPrice(amount: number, currency: string = ''): string {
  // Some locales (e.g. fr-FR) emit non-breaking spaces (U+00A0) as the
  // grouping separator; normalise any whitespace to a regular space for
  // predictable output.
  const formatted = amount.toLocaleString('fr-FR').replace(/\s/g, ' ');
  return currency ? `${formatted} ${currency}` : formatted;
}

/**
 * Detect in-app browsers (Facebook, Instagram, TikTok). These WebViews
 * often block redirects to native payment apps.
 */
export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|Instagram|TikTok|musical_ly|BytedanceWebview/i.test(ua);
}

/** Detect specifically the TikTok WebView. */
export function isTikTokBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /TikTok|musical_ly|BytedanceWebview/i.test(ua);
}

/** Approximate a display name from an email's local-part — `User` has no name field yet. */
export function greetingName(email: string): string {
  const local = email.split('@')[0] ?? '';
  return local.charAt(0).toUpperCase() + local.slice(1);
}

/**
 * `animation-delay` for the Nth item in a staggered `.animate-fade-in-up`
 * list/grid reveal. Capped so a long list doesn't leave late items feeling
 * sluggish to appear (UX guideline: keep micro-interactions under ~300ms).
 */
export function staggerDelay(index: number, stepMs = 45, maxMs = 240): CSSProperties {
  return { animationDelay: `${Math.min(index * stepMs, maxMs)}ms` };
}
