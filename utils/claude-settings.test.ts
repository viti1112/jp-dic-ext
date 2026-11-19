import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getClaudeApiKey, setClaudeApiKey } from './claude-settings.ts';

const store = new Map<string, unknown>();

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store.get(key) })),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) store.set(key, value);
        }),
      },
    },
  },
}));

beforeEach(() => {
  store.clear();
});

describe('getClaudeApiKey / setClaudeApiKey', () => {
  it('returns an empty string when nothing is stored', async () => {
    expect(await getClaudeApiKey()).toBe('');
  });

  it('persists and reads back a saved key', async () => {
    await setClaudeApiKey('sk-ant-test');
    expect(await getClaudeApiKey()).toBe('sk-ant-test');
  });

  it('uses browser.storage.local, not .sync - a secret should never sync across devices', async () => {
    const { browser } = await import('wxt/browser');
    await setClaudeApiKey('sk-ant-test');
    expect(browser.storage.local.set).toHaveBeenCalled();
    expect((browser.storage as unknown as Record<string, unknown>).sync).toBeUndefined();
  });
});
