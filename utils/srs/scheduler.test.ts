import { describe, expect, it } from 'vitest';
import { createCard, reviewCard } from './scheduler.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

describe('createCard', () => {
  it('starts at the standard SM-2 defaults, due immediately', () => {
    const card = createCard(1, '読む', 'よむ', 'to read', NOW);
    expect(card).toEqual({
      entryId: 1,
      headword: '読む',
      reading: 'よむ',
      glosses: 'to read',
      easeFactor: 2.5,
      intervalDays: 0,
      repetitions: 0,
      dueAt: NOW,
      lastReviewedAt: null,
    });
  });
});

describe('reviewCard', () => {
  it('first "good" review: 1-day interval, unchanged ease factor (q=4 is SM-2\'s neutral point)', () => {
    const card = createCard(1, '読む', 'よむ', 'to read', NOW);
    const next = reviewCard(card, 'good', NOW);
    expect(next.intervalDays).toBe(1);
    expect(next.repetitions).toBe(1);
    expect(next.easeFactor).toBeCloseTo(2.5, 5);
    expect(next.dueAt).toBe(NOW + DAY_MS);
    expect(next.lastReviewedAt).toBe(NOW);
  });

  it('second "good" review: 6-day interval', () => {
    const card = createCard(1, '読む', 'よむ', 'to read', NOW);
    const afterFirst = reviewCard(card, 'good', NOW);
    const afterSecond = reviewCard(afterFirst, 'good', NOW + DAY_MS);
    expect(afterSecond.intervalDays).toBe(6);
    expect(afterSecond.repetitions).toBe(2);
  });

  it('third+ "good" review: interval = round(previous interval * ease factor)', () => {
    const card = createCard(1, '読む', 'よむ', 'to read', NOW);
    const r1 = reviewCard(card, 'good', NOW);
    const r2 = reviewCard(r1, 'good', NOW);
    const r3 = reviewCard(r2, 'good', NOW);
    // r2: interval=6, easeFactor still 2.5 (q=4 is neutral) -> round(6 * 2.5) = 15
    expect(r3.intervalDays).toBe(Math.round(r2.intervalDays * r2.easeFactor));
    expect(r3.repetitions).toBe(3);
  });

  it('"again" (quality 0, a lapse): resets repetitions to 0 and interval to 1 day regardless of history', () => {
    const card = createCard(1, '読む', 'よむ', 'to read', NOW);
    const r1 = reviewCard(card, 'good', NOW);
    const r2 = reviewCard(r1, 'good', NOW);
    const lapsed = reviewCard(r2, 'again', NOW);
    expect(lapsed.repetitions).toBe(0);
    expect(lapsed.intervalDays).toBe(1);
  });

  it('"easy" increases the ease factor; "hard" decreases it', () => {
    const card = createCard(1, '読む', 'よむ', 'to read', NOW);
    const easy = reviewCard(card, 'easy', NOW);
    const hard = reviewCard(card, 'hard', NOW);
    expect(easy.easeFactor).toBeGreaterThan(card.easeFactor);
    expect(hard.easeFactor).toBeLessThan(card.easeFactor);
  });

  it('ease factor never drops below 1.3 even after repeated "again"s', () => {
    let card = createCard(1, '読む', 'よむ', 'to read', NOW);
    for (let i = 0; i < 20; i++) {
      card = reviewCard(card, 'again', NOW);
    }
    expect(card.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it('sets dueAt to now + intervalDays, and lastReviewedAt to now', () => {
    const card = createCard(1, '読む', 'よむ', 'to read', NOW);
    const next = reviewCard(card, 'good', NOW + 5000);
    expect(next.dueAt).toBe(NOW + 5000 + next.intervalDays * DAY_MS);
    expect(next.lastReviewedAt).toBe(NOW + 5000);
  });

  it('preserves an id field if present (works on both NewSrsCard and SrsCard)', () => {
    const card = { ...createCard(1, '読む', 'よむ', 'to read', NOW), id: 42 };
    const next = reviewCard(card, 'good', NOW);
    expect(next.id).toBe(42);
  });
});
