import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { reviewCard } from './scheduler.ts';
import type { NewSrsCard, ReviewQuality, SrsCard } from './types.ts';

interface SrsSchema extends DBSchema {
  cards: {
    key: number;
    value: SrsCard;
    indexes: { dueAt: number; entryId: number };
  };
}

const DB_NAME = 'jp-dic-ext-srs';
const DB_VERSION = 1;

export type SrsDB = IDBPDatabase<SrsSchema>;

/** A separate database from the dictionary's - small, user-generated, mutable data with a completely different lifecycle than the bulk-seeded dictionary. */
export async function openSrsDB(dbName = DB_NAME): Promise<SrsDB> {
  return openDB<SrsSchema>(dbName, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore('cards', { keyPath: 'id', autoIncrement: true });
      store.createIndex('dueAt', 'dueAt');
      store.createIndex('entryId', 'entryId');
    },
  });
}

/**
 * Avoids adding the same dictionary entry twice; returns the existing card if
 * already present. Reads and (maybe) adds within a single readwrite
 * transaction - the same reason `reviewCardById` does - so two concurrent
 * calls for the same entry (e.g. a double-fired click) can't both see "not
 * found" and both insert a duplicate card.
 */
export async function addCardIfNew(db: SrsDB, card: NewSrsCard): Promise<SrsCard> {
  const tx = db.transaction('cards', 'readwrite');
  const existing = await tx.store.index('entryId').get(card.entryId);
  if (existing) {
    await tx.done;
    return existing;
  }

  // `add()` expects a value shaped like the store's SrsCard (with `id`), but
  // the whole point of autoIncrement is that `id` isn't set yet - the real
  // object passed at runtime is a NewSrsCard, which is fine for IndexedDB.
  const id = await tx.store.add(card as SrsCard);
  await tx.done;
  return { ...card, id };
}

export async function getDueCards(db: SrsDB, limit: number, now = Date.now()): Promise<SrsCard[]> {
  const range = IDBKeyRange.upperBound(now);
  const due: SrsCard[] = [];
  let cursor = await db.transaction('cards').store.index('dueAt').openCursor(range);
  while (cursor && due.length < limit) {
    due.push(cursor.value);
    cursor = await cursor.continue();
  }
  return due;
}

export async function countDueCards(db: SrsDB, now = Date.now()): Promise<number> {
  return db.countFromIndex('cards', 'dueAt', IDBKeyRange.upperBound(now));
}

/**
 * Reads the card, scores the review, and writes the result back within a
 * single readwrite transaction - IndexedDB serializes readwrite
 * transactions against the same store, so this is immune to the lost-update
 * race a separate get()-then-put() (two transactions) would have if the same
 * card were reviewed twice concurrently (e.g. a double-click, or two review
 * tabs open on the same due card).
 */
export async function reviewCardById(
  db: SrsDB,
  cardId: number,
  quality: ReviewQuality,
  now = Date.now(),
): Promise<SrsCard | null> {
  const tx = db.transaction('cards', 'readwrite');
  const card = await tx.store.get(cardId);
  if (!card) {
    await tx.done;
    return null;
  }

  const reviewed = reviewCard(card, quality, now);
  await tx.store.put(reviewed);
  await tx.done;
  return reviewed;
}
