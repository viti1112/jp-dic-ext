import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openDictionaryDB, seedIfEmpty, type DictionaryDB } from './db.ts';
import { lookupAtCursor } from './lookup.ts';
import type { DictionaryEntry } from './types.ts';

const FIXTURE_ENTRIES: DictionaryEntry[] = [
  { id: 1, kanji: ['読む'], readings: ['よむ'], priority: ['ichi1'], senses: [{ pos: ['v5m'], glosses: ['to read'] }] },
  { id: 2, kanji: ['読'], readings: ['よみ'], priority: [], senses: [{ pos: ['n'], glosses: ['reading (of a kanji)'] }] },
  { id: 3, kanji: ['犬'], readings: ['いぬ'], priority: ['ichi1'], senses: [{ pos: ['n'], glosses: ['dog'] }] },
  { id: 4, kanji: ['橋'], readings: ['はし'], priority: ['nf05'], senses: [{ pos: ['n'], glosses: ['bridge'] }] },
  { id: 5, kanji: ['箸'], readings: ['はし'], priority: ['nf19'], senses: [{ pos: ['n'], glosses: ['chopsticks'] }] },
];

let db: DictionaryDB;

beforeEach(async () => {
  db = await openDictionaryDB(`test-lookup-${Math.random()}`);
  globalThis.fetch = vi.fn(async () => ({ json: async () => FIXTURE_ENTRIES }) as Response);
  await seedIfEmpty(db, 'fake://dictionary.json', 'fake://version.json');
});

describe('lookupAtCursor', () => {
  it('prefers the longest match over a shorter accidental hit on a prefix', async () => {
    // "読" alone is entry #2 (n, "reading"); the full word starting here
    // deinflects to 読む (v5m) via polite-negative. Longest-match must win.
    const text = '読みません';
    const match = await lookupAtCursor(db, text, 0);
    expect(match?.matchedText).toBe('読みません');
    expect(match?.entries.map((e) => e.id)).toEqual([1]);
    expect(match?.reasons).toEqual(['polite-negative']);
  });

  it('falls back to a shorter match when the longer substring has no dictionary hit', async () => {
    // "読" + "x" has no entry; the engine must back off to length 1 and find 読.
    const match = await lookupAtCursor(db, '読x', 0);
    expect(match?.matchedText).toBe('読');
    expect(match?.entries.map((e) => e.id)).toEqual([2]);
    expect(match?.reasons).toEqual([]);
  });

  it('matches a plain dictionary-form word with an empty reasons chain', async () => {
    const match = await lookupAtCursor(db, '犬が好き', 0);
    expect(match?.matchedText).toBe('犬');
    expect(match?.reasons).toEqual([]);
    expect(match?.entries.map((e) => e.id)).toEqual([3]);
  });

  it('starts matching from cursorIndex, not from the start of the text', async () => {
    const text = 'xx読む';
    const match = await lookupAtCursor(db, text, 2);
    expect(match?.matchedText).toBe('読む');
    expect(match?.entries.map((e) => e.id)).toEqual([1]);
  });

  it('ranks homographs by frequency (橋 before 箸, per JMdict nf05 vs nf19)', async () => {
    const match = await lookupAtCursor(db, 'はし', 0);
    expect(match?.entries.map((e) => e.id)).toEqual([4, 5]);
  });

  it('respects maxLength', async () => {
    // 読みません is 5 chars; capping at 2 should prevent the length-5 match
    // from ever being tried, leaving only the length-1 match on 読.
    const match = await lookupAtCursor(db, '読みません', 0, 2);
    expect(match?.matchedText).toBe('読');
  });

  it('returns null without throwing when 0 characters remain at the cursor', async () => {
    const text = '読む';
    await expect(lookupAtCursor(db, text, text.length)).resolves.toBeNull();
  });

  it('returns null when nothing in the text matches anything', async () => {
    await expect(lookupAtCursor(db, 'xyz123', 0)).resolves.toBeNull();
  });
});
