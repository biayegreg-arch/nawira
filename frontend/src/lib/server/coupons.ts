import 'server-only';

/** Coupon codes are case-insensitive for users, stored uppercase. */
export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Integer FCFA after a percentage discount (CLAUDE.md: no decimals). */
export function applyPercentOff(priceFcfa: number, percentOff: number): number {
  return Math.round((priceFcfa * (100 - percentOff)) / 100);
}

export const COUPON_CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/;
