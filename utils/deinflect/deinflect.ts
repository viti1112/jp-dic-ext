import { DEINFLECT_RULES } from './rules.ts';
import type { DeinflectCandidate } from './types.ts';

/** Sentinel meaning "we don't know the surface word's conjugation class yet" — matches any rule. */
const ANY_TAG = 'any';

const MAX_DEPTH = 8;

/**
 * Checks whether `candidateTags` (from a `DeinflectCandidate`) are
 * compatible with `realTags` (a real dictionary entry's part-of-speech
 * tags, or a rule's `tagsIn`) — honoring the `"any"` sentinel so callers
 * don't have to special-case the depth-0/no-reasons candidate themselves.
 */
export function tagsMatch(candidateTags: string[], realTags: string[]): boolean {
  return candidateTags.includes(ANY_TAG) || candidateTags.some((tag) => realTags.includes(tag));
}

/**
 * Produces every dictionary-form candidate reachable from `word` by
 * repeatedly stripping inflectional suffixes, together with the
 * part-of-speech tags the real dictionary entry must have for that
 * candidate to be valid. `word` itself is always included (depth 0, no
 * reasons) since it may already be a dictionary form.
 *
 * This only returns candidates — it does not check them against the
 * dictionary. The caller is expected to keep only candidates for which
 * `tagsMatch(candidate.tags, realEntry.pos)` holds.
 */
export function deinflect(word: string): DeinflectCandidate[] {
  const results: DeinflectCandidate[] = [];
  const seen = new Set<string>();

  function visit(candidate: DeinflectCandidate, depth: number): void {
    const key = `${candidate.term}|${candidate.tags.join(',')}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(candidate);

    if (depth >= MAX_DEPTH) return;

    for (const rule of DEINFLECT_RULES) {
      if (!candidate.term.endsWith(rule.kanaIn)) continue;
      if (!tagsMatch(candidate.tags, rule.tagsIn)) continue;

      const stem = candidate.term.slice(0, -rule.kanaIn.length) + rule.kanaOut;
      visit({ term: stem, tags: rule.tagsOut, reasons: [rule.name, ...candidate.reasons] }, depth + 1);
    }
  }

  visit({ term: word, tags: [ANY_TAG], reasons: [] }, 0);
  return results;
}
