import { describe, it, expect } from 'vitest';
import { applyPercentOff, normalizeCouponCode, COUPON_CODE_PATTERN } from './coupons';

describe('coupons helpers', () => {
  it('applies a percentage and rounds to an integer FCFA', () => {
    expect(applyPercentOff(1000, 20)).toBe(800);
    expect(applyPercentOff(1000, 100)).toBe(0);
    expect(applyPercentOff(2500, 33)).toBe(1675);
    expect(Number.isInteger(applyPercentOff(999, 33))).toBe(true);
  });

  it('normalizes codes to trimmed uppercase', () => {
    expect(normalizeCouponCode('  bienvenue10 ')).toBe('BIENVENUE10');
  });

  it('accepts sane codes and rejects bad ones', () => {
    expect(COUPON_CODE_PATTERN.test('WELCOME-10')).toBe(true);
    expect(COUPON_CODE_PATTERN.test('a b')).toBe(false);
    expect(COUPON_CODE_PATTERN.test('AB')).toBe(false);
  });
});
