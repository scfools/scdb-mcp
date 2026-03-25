import { describe, it, expect } from 'vitest';
import { checkAuth, requireAuth } from '../src/auth.js';

describe('auth', () => {
  it('returns true when identity is in authorized_publishers', () => {
    const publishers = [
      { identity: 'abc123', label: 'sc-fools', addedAt: BigInt(0) },
    ];
    expect(checkAuth('abc123', publishers)).toBe(true);
  });

  it('returns false when identity is not in authorized_publishers', () => {
    const publishers = [
      { identity: 'abc123', label: 'sc-fools', addedAt: BigInt(0) },
    ];
    expect(checkAuth('def456', publishers)).toBe(false);
  });

  it('returns false with empty publishers list', () => {
    expect(checkAuth('abc123', [])).toBe(false);
  });

  it('requireAuth returns error message when not authorized', () => {
    const result = requireAuth('def456', false);
    expect(result).toContain('def456');
    expect(result).toContain('not authorized');
  });

  it('requireAuth returns null when authorized', () => {
    expect(requireAuth('abc123', true)).toBeNull();
  });
});
