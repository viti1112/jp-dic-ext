import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('appendAnkiLog / getAnkiLog', () => {
  beforeEach(() => {
    store.clear();
    vi.resetModules();
  });

  it('prepends the newest entry and caps at 20', async () => {
    const { appendAnkiLog, getAnkiLog } = await import('./anki-log.ts');
    for (let i = 0; i < 22; i++) await appendAnkiLog(`term${i}`);

    const log = await getAnkiLog();
    expect(log).toHaveLength(20);
    expect(log[0]?.term).toBe('term21'); // most recent first
  });

  it('two concurrent appends do not lose one to a lost update', async () => {
    const { appendAnkiLog, getAnkiLog } = await import('./anki-log.ts');
    await Promise.all([appendAnkiLog('a'), appendAnkiLog('b')]);

    const terms = (await getAnkiLog()).map((e) => e.term);
    expect(terms).toContain('a');
    expect(terms).toContain('b');
  });

  it('a failed write does not permanently break later appends', async () => {
    const { browser } = await import('wxt/browser');
    const { appendAnkiLog, getAnkiLog } = await import('./anki-log.ts');

    vi.mocked(browser.storage.local.set).mockRejectedValueOnce(new Error('quota exceeded'));
    await expect(appendAnkiLog('first')).rejects.toThrow('quota exceeded');

    // A prior rejected link in the chain must not silently no-op every call after it.
    await appendAnkiLog('second');
    expect((await getAnkiLog()).map((e) => e.term)).toEqual(['second']);
  });
});
