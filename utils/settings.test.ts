import { describe, expect, it, vi } from 'vitest';
import { isActivationHeld } from './settings.ts';

const store = new Map<string, unknown>();

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      sync: {
        get: vi.fn(async (key: string) => ({ [key]: store.get(key) })),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) store.set(key, value);
        }),
      },
      onChanged: { addListener: vi.fn() },
    },
  },
}));

describe('getSettings', () => {
  it('returns defaults (including claudeApiKey) when nothing is stored', async () => {
    store.clear();
    const { getSettings, DEFAULT_SETTINGS } = await import('./settings.ts');
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back field-by-field for an invalid/corrupted stored value, instead of discarding the whole object', async () => {
    store.clear();
    const { getSettings, DEFAULT_SETTINGS } = await import('./settings.ts');
    store.set('settings', { activationMode: 'ctrl', deckName: '', reviewBackend: 'anki', claudeApiKey: 'sk-abc' });

    const settings = await getSettings();
    expect(settings.activationMode).toBe(DEFAULT_SETTINGS.activationMode); // invalid enum value
    expect(settings.deckName).toBe(DEFAULT_SETTINGS.deckName); // empty string rejected
    expect(settings.reviewBackend).toBe('anki'); // valid, kept as-is
    expect(settings.claudeApiKey).toBe('sk-abc'); // valid, kept as-is
  });
});

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
