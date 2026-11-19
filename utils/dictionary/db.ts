import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { DictionaryEntry } from './types.ts';

interface DictionarySchema extends DBSchema {
  entries: {
    key: number;
    value: DictionaryEntry;
    indexes: { kanji: string; readings: string };
  };
  /** A single row keyed `'version'`, holding the hash from the last-seeded dictionary/version.json - see `seedIfEmpty()`. */
  meta: {
    key: string;
    value: string;
  };
}

const DB_NAME = 'jp-dic-ext';
const DB_VERSION = 2;

export type DictionaryDB = IDBPDatabase<DictionarySchema>;

/** `dbName` defaults to the real extension database; tests pass a unique name per test to avoid cross-test pollution. */
export async function openDictionaryDB(dbName = DB_NAME): Promise<DictionaryDB> {
  return openDB<DictionarySchema>(dbName, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const store = db.createObjectStore('entries', { keyPath: 'id' });
        store.createIndex('kanji', 'kanji', { multiEntry: true });
        store.createIndex('readings', 'readings', { multiEntry: true });
      }
      if (oldVersion < 2) {
        db.createObjectStore('meta');
      }
    },
  });
}

/**
 * Bulk-loads the bundled JMdict JSON, and reloads it whenever the bundled
 * copy has actually changed - not just on first run. `versionUrl` points at
 * a tiny `version.json` (written by `scripts/jmdict/parse-jmdict.ts`
 * alongside the ~40 MB dictionary itself) holding a hash of that file;
 * checking this small file on every startup, rather than re-downloading and
 * re-hashing the full dictionary every time, is what makes "did the bundled
 * dictionary change" cheap enough to check unconditionally. Without this, a
 * user who already has entries seeded would never pick up a newer JMdict
 * shipped in a later version of the extension without deleting the database
 * themselves - `existingCount > 0` alone used to short-circuit every seed
 * after the first, version or no version.
 * `dictionaryUrl`/`versionUrl` are resolved by the caller (e.g.
 * `browser.runtime.getURL('/dictionary/jmdict-en.json')`) so this module has
 * no WXT/extension-API dependency and can be tested as plain code. Returns
 * the resulting entry count either way, so callers don't need a second
 * `count()` round-trip.
 */
export async function seedIfEmpty(db: DictionaryDB, dictionaryUrl: string, versionUrl: string): Promise<number> {
  const existingCount = await db.count('entries');

  let latestVersion: string | undefined;
  try {
    const versionResponse = await fetch(versionUrl);
    latestVersion = ((await versionResponse.json()) as { version?: string }).version;
  } catch {
    // version.json missing or unreachable - if we already have entries, keep using them rather
    // than treating an unrelated network hiccup as "the dictionary must be stale, reseed it".
  }

  if (existingCount > 0 && latestVersion !== undefined) {
    const storedVersion = await db.get('meta', 'version');
    if (storedVersion === latestVersion) return existingCount;
  } else if (existingCount > 0) {
    return existingCount;
  }

  const response = await fetch(dictionaryUrl);
  const entries: DictionaryEntry[] = await response.json();

  const tx = db.transaction(['entries', 'meta'], 'readwrite');
  await tx.objectStore('entries').clear(); // drop whatever version (if any) was seeded before
  for (const entry of entries) {
    tx.objectStore('entries').put(entry);
  }
  if (latestVersion !== undefined) {
    await tx.objectStore('meta').put(latestVersion, 'version');
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
