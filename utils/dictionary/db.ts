import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { DictionaryEntry } from './types.ts';

interface DictionarySchema extends DBSchema {
  entries: {
    key: number;
    value: DictionaryEntry;
    indexes: { kanji: string; readings: string };
  };
}

const DB_NAME = 'jp-dic-ext';
const DB_VERSION = 1;

export type DictionaryDB = IDBPDatabase<DictionarySchema>;

export async function openDictionaryDB(): Promise<DictionaryDB> {
  return openDB<DictionarySchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore('entries', { keyPath: 'id' });
      store.createIndex('kanji', 'kanji', { multiEntry: true });
      store.createIndex('readings', 'readings', { multiEntry: true });
    },
  });
}

/**
 * Bulk-loads the bundled JMdict JSON on first run; a no-op after that.
 * `dictionaryUrl` is resolved by the caller (e.g. `browser.runtime.getURL('/dictionary/jmdict-en.json')`)
 * so this module has no WXT/extension-API dependency and can be tested as plain code.
 * Returns the resulting entry count either way, so callers don't need a second `count()` round-trip.
 */
export async function seedIfEmpty(db: DictionaryDB, dictionaryUrl: string): Promise<number> {
  const existingCount = await db.count('entries');
  if (existingCount > 0) return existingCount;

  const response = await fetch(dictionaryUrl);
  const entries: DictionaryEntry[] = await response.json();

  const tx = db.transaction('entries', 'readwrite');
  for (const entry of entries) {
    tx.store.put(entry);
  }
  await tx.done;
  return entries.length;
}

/** Looks up entries whose kanji or reading forms match `text` exactly. */
export async function lookupExact(db: DictionaryDB, text: string): Promise<DictionaryEntry[]> {
  const [byKanji, byReading] = await Promise.all([
    db.getAllFromIndex('entries', 'kanji', text),
    db.getAllFromIndex('entries', 'readings', text),
  ]);

  const seenIds = new Set<number>();
  const results: DictionaryEntry[] = [];
  for (const entry of [...byKanji, ...byReading]) {
    if (seenIds.has(entry.id)) continue;
    seenIds.add(entry.id);
    results.push(entry);
  }
  return results;
}
