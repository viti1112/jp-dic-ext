/** Self-contained snapshot, not a live join to the dictionary - a card still reviews correctly even if the dictionary data changes later. */
export interface SrsCard {
  id: number;
  entryId: number;
  headword: string;
  reading: string;
  glosses: string;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  dueAt: number;
  lastReviewedAt: number | null;
}

export type NewSrsCard = Omit<SrsCard, 'id'>;

/** Mirrors Anki's four review buttons; mapped to SM-2's 0-5 quality scale in scheduler.ts. */
export type ReviewQuality = 'again' | 'hard' | 'good' | 'easy';
