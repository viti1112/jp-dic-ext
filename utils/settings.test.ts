import { describe, expect, it } from 'vitest';
import { isActivationHeld } from './settings.ts';

describe('isActivationHeld', () => {
  it('shift mode requires shiftKey, ignores altKey', () => {
    expect(isActivationHeld('shift', { shiftKey: true, altKey: false })).toBe(true);
    expect(isActivationHeld('shift', { shiftKey: false, altKey: true })).toBe(false);
  });

  it('alt mode requires altKey, ignores shiftKey', () => {
    expect(isActivationHeld('alt', { shiftKey: false, altKey: true })).toBe(true);
    expect(isActivationHeld('alt', { shiftKey: true, altKey: false })).toBe(false);
  });

  it('always mode ignores both modifiers', () => {
    expect(isActivationHeld('always', { shiftKey: false, altKey: false })).toBe(true);
  });
});
