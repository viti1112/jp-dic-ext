/** A JMdict part-of-speech short code (e.g. "v5m", "adj-i") — see utils/dictionary/types.ts. */
export type PosTag = string;

export interface DeinflectRule {
  /** Human-readable name of the grammatical form, e.g. "negative-past". */
  name: string;
  /** Inflected suffix to strip from the end of the surface text. */
  kanaIn: string;
  /** What to append to the remainder to recover the (next-level) form. */
  kanaOut: string;
  /** The candidate's current tag must include at least one of these for this rule to apply. */
  tagsIn: PosTag[];
  /** Tag(s) assigned to the resulting form. */
  tagsOut: PosTag[];
}

export interface DeinflectCandidate {
  /** The reconstructed term — a dictionary-form candidate once `reasons` is non-empty. */
  term: string;
  /**
   * Part-of-speech tags the real dictionary entry for `term` must have, for
   * this candidate to be valid — except the sentinel `"any"` (only ever seen
   * on the depth-0, no-reasons candidate for the original input), which
   * means the class is unknown and validators should accept any tag. Use
   * `tagsMatch()` from `./deinflect.ts` rather than comparing `tags` directly,
   * so the sentinel doesn't need to be special-cased at every call site.
   */
  tags: PosTag[];
  /** Chain of rule names applied, most-recently-applied (outermost) first. */
  reasons: string[];
}
