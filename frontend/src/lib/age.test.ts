import { describe, it, expect } from 'vitest';
import { isAdult } from './age';

describe('isAdult', () => {
  it('returns true for someone who turned 18 exactly today', () => {
    const now = new Date();
    const birthDate = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate());
    expect(isAdult(birthDate.toISOString())).toBe(true);
  });

  it('returns false for someone who turns 18 tomorrow', () => {
    const now = new Date();
    const birthDate = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate() + 1);
    expect(isAdult(birthDate.toISOString())).toBe(false);
  });

  it('returns false for a 17-year-old', () => {
    const now = new Date();
    const birthDate = new Date(now.getFullYear() - 17, now.getMonth(), now.getDate());
    expect(isAdult(birthDate.toISOString())).toBe(false);
  });

  it('returns true for a 30-year-old', () => {
    const now = new Date();
    const birthDate = new Date(now.getFullYear() - 30, now.getMonth(), now.getDate());
    expect(isAdult(birthDate.toISOString())).toBe(true);
  });

  it('returns false for an invalid date string', () => {
    expect(isAdult('not-a-date')).toBe(false);
  });

  it('honors a custom minAge', () => {
    const now = new Date();
    const birthDate = new Date(now.getFullYear() - 21, now.getMonth(), now.getDate());
    expect(isAdult(birthDate.toISOString(), 21)).toBe(true);
    expect(isAdult(birthDate.toISOString(), 25)).toBe(false);
  });
});
