import type { NewSrsCard, ReviewQuality } from './types.ts';

const INITIAL_EASE_FACTOR = 2.5;
const MIN_EASE_FACTOR = 1.3;
const DAY_MS = 24 * 60 * 60 * 1000;

/** SM-2's 0-5 quality scale, collapsed to four buttons the way most simplified SM-2 reviewers do. */
const QUALITY_SCORE: Record<ReviewQuality, number> = {
  again: 0,
  hard: 3,
  good: 4,
  easy: 5,
};

export function createCard(
  entryId: number,
  headword: string,
  reading: string,
  glosses: string,
  now = Date.now(),
): NewSrsCard {
  return {
    entryId,
    headword,
    reading,
    glosses,
    easeFactor: INITIAL_EASE_FACTOR,
    intervalDays: 0,
    repetitions: 0,
    dueAt: now,
    lastReviewedAt: null,
  };
}

/**
 * The SM-2 algorithm (SuperMemo 2), as originally published: quality < 3 is
 * a lapse (reset repetitions, review again tomorrow); quality >= 3 grows the
 * interval (1 day, then 6, then previous*easeFactor). The ease-factor update
 * applies either way. Generic over `T` so it works on both a not-yet-persisted
 * `NewSrsCard` and a fetched `SrsCard` (with its `id` preserved) without a cast.
 */
export function reviewCard<T extends NewSrsCard>(card: T, quality: ReviewQuality, now = Date.now()): T {
  const q = QUALITY_SCORE[quality];

  let repetitions: number;
  let intervalDays: number;
  if (q < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    if (card.repetitions === 0) intervalDays = 1;
    else if (card.repetitions === 1) intervalDays = 6;
    else intervalDays = Math.round(card.intervalDays * card.easeFactor);
    repetitions = card.repetitions + 1;
  }

  const easeFactor = Math.max(MIN_EASE_FACTOR, card.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  return {
    ...card,
    repetitions,
    intervalDays,
    easeFactor,
    dueAt: now + intervalDays * DAY_MS,
    lastReviewedAt: now,
  };
}
