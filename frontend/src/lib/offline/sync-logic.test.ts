import { describe, it, expect } from 'vitest';
import { ApiError } from '@/lib/api';
import { backoffDelayMs, isNetworkError, MAX_SYNC_ATTEMPTS } from './sync-logic';

describe('backoffDelayMs', () => {
  it.each([
    [0, 1000],
    [1, 2000],
    [2, 4000],
    [4, 16_000],
    [5, 30_000],
    [10, 30_000],
  ])('attempt %i -> %ims', (attempts, expected) => {
    expect(backoffDelayMs(attempts)).toBe(expected);
  });
});

describe('isNetworkError', () => {
  it('is true for a status-0 ApiError (network failure)', () => {
    expect(isNetworkError(new ApiError(0, 'Network error'))).toBe(true);
  });

  it('is false for a real HTTP error status', () => {
    expect(isNetworkError(new ApiError(422, 'Invalid payload'))).toBe(false);
    expect(isNetworkError(new ApiError(500, 'Server error'))).toBe(false);
  });

  it('is false for a non-ApiError value', () => {
    expect(isNetworkError(new Error('boom'))).toBe(false);
    expect(isNetworkError('boom')).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});

describe('MAX_SYNC_ATTEMPTS', () => {
  it('is a small positive integer', () => {
    expect(MAX_SYNC_ATTEMPTS).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_SYNC_ATTEMPTS)).toBe(true);
  });
});
