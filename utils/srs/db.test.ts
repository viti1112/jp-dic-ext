import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { addCardIfNew, countDueCards, getDueCards, openSrsDB, updateCard, type SrsDB } from './db.ts';
import { createCard, reviewCard } from './scheduler.ts';

const NOW = 1_700_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

let db: SrsDB;

beforeEach(async () => {
  db = await openSrsDB(`test-srs-${Math.random()}`);
});

describe('addCardIfNew', () => {
  it('assigns an auto-incrementing id', async () => {
    const card = await addCardIfNew(db, createCard(1, '読む', 'よむ', 'to read', NOW));
    expect(card.id).toBeTypeOf('number');
    expect(card.entryId).toBe(1);
  });

  it('does not add the same entry twice - returns the existing card instead', async () => {
    const first = await addCardIfNew(db, createCard(1, '読む', 'よむ', 'to read', NOW));
    const second = await addCardIfNew(db, createCard(1, '読む', 'よむ', 'to read (dup)', NOW + 1000));
    expect(second.id).toBe(first.id);
    expect(second.glosses).toBe('to read'); // the original, not the "duplicate" attempt's data
    expect(await db.count('cards')).toBe(1);
  });

  it('adds a genuinely different entry as a separate card', async () => {
    await addCardIfNew(db, createCard(1, '読む', 'よむ', 'to read', NOW));
    await addCardIfNew(db, createCard(2, '書く', 'かく', 'to write', NOW));
    expect(await db.count('cards')).toBe(2);
  });
});

describe('getDueCards / countDueCards', () => {
  it('a freshly created card is due immediately', async () => {
    await addCardIfNew(db, createCard(1, '読む', 'よむ', 'to read', NOW));
    expect(await countDueCards(db, NOW)).toBe(1);
    expect((await getDueCards(db, 10, NOW)).map((c) => c.entryId)).toEqual([1]);
  });

  it('a card reviewed as "good" is not due until its new interval has passed', async () => {
    const card = await addCardIfNew(db, createCard(1, '読む', 'よむ', 'to read', NOW));
    const reviewed = reviewCard(card, 'good', NOW);
    await updateCard(db, reviewed);

    expect(await countDueCards(db, NOW)).toBe(0);
    expect(await countDueCards(db, NOW + reviewed.intervalDays * DAY_MS)).toBe(1);
  });

  it('respects the limit and returns the right cards by due time', async () => {
    for (let i = 1; i <= 5; i++) {
      await addCardIfNew(db, createCard(i, `word${i}`, `reading${i}`, `gloss${i}`, NOW));
    }
    const due = await getDueCards(db, 3, NOW);
    expect(due).toHaveLength(3);
  });

  it('excludes cards not yet due from both the list and the count', async () => {
    await addCardIfNew(db, createCard(1, '読む', 'よむ', 'to read', NOW));
    const future = await addCardIfNew(db, createCard(2, '書く', 'かく', 'to write', NOW + DAY_MS));

    expect(await countDueCards(db, NOW)).toBe(1);
    const due = await getDueCards(db, 10, NOW);
    expect(due.map((c) => c.entryId)).not.toContain(future.entryId);
  });
});

describe('updateCard', () => {
  it('persists the reviewed scheduling fields', async () => {
    const card = await addCardIfNew(db, createCard(1, '読む', 'よむ', 'to read', NOW));
    const reviewed = reviewCard(card, 'easy', NOW);
    await updateCard(db, reviewed);

    const stored = await db.get('cards', card.id);
    expect(stored?.repetitions).toBe(reviewed.repetitions);
    expect(stored?.easeFactor).toBeCloseTo(reviewed.easeFactor, 5);
    expect(stored?.dueAt).toBe(reviewed.dueAt);
  });
});
