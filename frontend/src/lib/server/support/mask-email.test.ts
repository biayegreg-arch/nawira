import { describe, it, expect } from 'vitest';
import { maskEmail } from './mask-email';

describe('maskEmail', () => {
  it('keeps the first local-part character and masks the rest before @domain', () => {
    expect(maskEmail('gregory@gmail.com')).toBe('g******@gmail.com');
  });

  it('pads short local parts to at least 3 mask characters', () => {
    expect(maskEmail('ab@test.local')).toBe('a***@test.local');
  });

  it('handles a single-character local part', () => {
    expect(maskEmail('a@test.local')).toBe('a***@test.local');
  });

  it('falls back to a generic mask for input with no @', () => {
    expect(maskEmail('not-an-email')).toBe('***');
  });

  it('falls back to a generic mask for an empty string', () => {
    expect(maskEmail('')).toBe('***');
  });
});
