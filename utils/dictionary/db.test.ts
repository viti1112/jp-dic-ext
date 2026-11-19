import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lookupExact, openDictionaryDB, seedIfEmpty, type DictionaryDB } from './db.ts';
import type { DictionaryEntry } from './types.ts';

const FIXTURE_ENTRIES: DictionaryEntry[] = [
  { id: 1, kanji: ['読む'], readings: ['よむ'], priority: ['ichi1'], senses: [{ pos: ['v5m'], glosses: ['to read'] }] },
  { id: 2, kanji: ['橋'], readings: ['はし'], priority: ['nf05'], senses: [{ pos: ['n'], glosses: ['bridge'] }] },
  { id: 3, kanji: ['箸'], readings: ['はし'], priority: ['nf19'], senses: [{ pos: ['n'], glosses: ['chopsticks'] }] },
];

function mockFetch(entries: DictionaryEntry[], version: string | undefined) {
  return vi.fn(async (input: string | URL | Request) =>
    String(input).includes('version')
      ? ({ json: async () => ({ version }) }) as Response
      : ({ json: async () => entries }) as Response,
  );
}

let db: DictionaryDB;

beforeEach(async () => {
  // A fresh database name per test avoids cross-test pollution from idb's persistence.
  db = await openDictionaryDB(`test-${Math.random()}`);
});

describe('seedIfEmpty', () => {
  it('loads entries from the given URL on first run and returns the resulting count', async () => {
    globalThis.fetch = mockFetch(FIXTURE_ENTRIES, 'v1');
    const count = await seedIfEmpty(db, 'fake://dictionary.json', 'fake://version.json');
    expect(count).toBe(3);
    expect(await db.count('entries')).toBe(3);
  });

  it('is a no-op (and does not re-fetch the dictionary) once already seeded with the same version', async () => {
    globalThis.fetch = mockFetch(FIXTURE_ENTRIES, 'v1');
    await seedIfEmpty(db, 'fake://dictionary.json', 'fake://version.json');

    const fetchSpy = vi.fn(async () => ({ json: async () => ({ version: 'v1' }) }) as Response);
    globalThis.fetch = fetchSpy;
    const count = await seedIfEmpty(db, 'fake://dictionary.json', 'fake://version.json');

    expect(count).toBe(3);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // only the (tiny) version check, not the dictionary itself
    expect(fetchSpy).toHaveBeenCalledWith('fake://version.json');
  });

  it('reseeds when the bundled dictionary has a newer version than what was stored', async () => {
    globalThis.fetch = mockFetch(FIXTURE_ENTRIES, 'v1');
    await seedIfEmpty(db, 'fake://dictionary.json', 'fake://version.json');

    const updatedEntries = [...FIXTURE_ENTRIES, { id: 4, kanji: [], readings: ['あたらしい'], priority: [], senses: [] }];
    globalThis.fetch = mockFetch(updatedEntries, 'v2');
    const count = await seedIfEmpty(db, 'fake://dictionary.json', 'fake://version.json');

    expect(count).toBe(4);
    expect(await db.count('entries')).toBe(4); // old rows cleared, not just appended to
  });

  it('keeps already-seeded entries if version.json is unreachable, rather than treating that as "stale"', async () => {
    globalThis.fetch = mockFetch(FIXTURE_ENTRIES, 'v1');
    await seedIfEmpty(db, 'fake://dictionary.json', 'fake://version.json');

    const fetchSpy = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    globalThis.fetch = fetchSpy;
    const count = await seedIfEmpty(db, 'fake://dictionary.json', 'fake://version.json');

    expect(count).toBe(3);
  });
});

describe('lookupExact', () => {
  beforeEach(async () => {
    globalThis.fetch = mockFetch(FIXTURE_ENTRIES, 'v1');
    await seedIfEmpty(db, 'fake://dictionary.json', 'fake://version.json');
  });

  it('finds an entry by its kanji form', async () => {
    const results = await lookupExact(db, '読む');
    expect(results.map((e) => e.id)).toEqual([1]);
  });

  it('finds an entry by its reading when no kanji matches', async () => {
    const results = await lookupExact(db, 'よむ');
    expect(results.map((e) => e.id)).toEqual([1]);
  });

  it('finds all homographs sharing a reading, deduped, without double-counting a kanji+reading double match', async () => {
    const results = await lookupExact(db, 'はし');
    expect(new Set(results.map((e) => e.id))).toEqual(new Set([2, 3]));
    expect(results).toHaveLength(2);
  });

  it('returns an empty array for text matching nothing', async () => {
    expect(await lookupExact(db, '存在しない言葉')).toEqual([]);
  });
});
