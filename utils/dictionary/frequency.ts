/**
 * Ranks a dictionary entry by how common the word is, using JMdict's own
 * ke_pri/re_pri tags (already merged into `DictionaryEntry.priority` by the
 * build pipeline) — no separate frequency dataset needed.
 *
 * This disambiguates between competing entries that share a surface form
 * (e.g. 橋/箸/端 all read はし) — it does NOT reorder senses within one
 * entry, since JMdict already lists those most-common-first by convention.
 *
 * - nf01-nf48: newspaper-frequency buckets, 500 words each, nf01 = most common.
 * - ichi1/spec1/gai1 (and their *2 variants): manually-curated "common word"
 *   lists without bucket-level granularity.
 * - No priority tags at all: treated as rare/unattested.
 *
 * Higher score = more common.
 */
export function frequencyScore(priority: string[]): number {
  const nfTag = priority.find((tag) => /^nf\d{2}$/.test(tag));
  if (nfTag) {
    const bucket = Number(nfTag.slice(2));
    return 1000 - bucket;
  }
  if (priority.some((tag) => tag.endsWith('1'))) return 500;
  if (priority.some((tag) => tag.endsWith('2'))) return 400;
  if (priority.length > 0) return 300;
  return 0;
}

export function sortByFrequency<T extends { priority: string[] }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => frequencyScore(b.priority) - frequencyScore(a.priority));
}
