import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lookupExact, openDictionaryDB, seedIfEmpty, type DictionaryDB } from './db.ts';
import type { DictionaryEntry } from './types.ts';

const FIXTURE_ENTRIES: DictionaryEntry[] = [
  { id: 1, kanji: ['読む'], readings: ['よむ'], priority: ['ichi1'], senses: [{ pos: ['v5m'], glosses: ['to read'] }] },
  { id: 2, kanji: ['橋'], readings: ['はし'], priority: ['nf05'], senses: [{ pos: ['n'], glosses: ['bridge'] }] },
  { id: 3, kanji: ['箸'], readings: ['はし'], priority: ['nf19'], senses: [{ pos: ['n'], glosses: ['chopsticks'] }] },
];

function mockFetchReturning(entries: DictionaryEntry[]) {
  return vi.fn(async () => ({ json: async () => entries }) as Response);
}

let db: DictionaryDB;

beforeEach(async () => {
  // A fresh database name per test avoids cross-test pollution from idb's persistence.
  db = await openDictionaryDB(`test-${Math.random()}`);
});

describe('seedIfEmpty', () => {
  it('loads entries from the given URL on first run and returns the resulting count', async () => {
    globalThis.fetch = mockFetchReturning(FIXTURE_ENTRIES);
    const count = await seedIfEmpty(db, 'fake://dictionary.json');
    expect(count).toBe(3);
    expect(await db.count('entries')).toBe(3);
  });

  it('is a no-op (and does not re-fetch) once already seeded', async () => {
    globalThis.fetch = mockFetchReturning(FIXTURE_ENTRIES);
    await seedIfEmpty(db, 'fake://dictionary.json');

    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    const count = await seedIfEmpty(db, 'fake://dictionary.json');

    expect(count).toBe(3);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('lookupExact', () => {
  beforeEach(async () => {
    globalThis.fetch = mockFetchReturning(FIXTURE_ENTRIES);
    await seedIfEmpty(db, 'fake://dictionary.json');
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
