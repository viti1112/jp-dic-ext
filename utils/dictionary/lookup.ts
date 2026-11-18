import { deinflect, tagsMatch } from '../deinflect/deinflect.ts';
import type { DictionaryDB } from './db.ts';
import { lookupExact } from './db.ts';
import { sortByFrequency } from './frequency.ts';
import type { DictionaryEntry } from './types.ts';

export interface LookupMatch {
  /** The substring of the input text that was matched (before deinflection). */
  matchedText: string;
  /** Deinflection chain applied to reach a dictionary form, e.g. ["past", "negative"]; empty if `matchedText` was already a dictionary form. */
  reasons: string[];
  /** Matching dictionary entries, most-common first. */
  entries: DictionaryEntry[];
}

const DEFAULT_MAX_LENGTH = 20;

/**
 * Longest-match lookup: Japanese has no spaces between words, so starting at
 * `cursorIndex`, this tries substrings of decreasing length and returns the
 * longest one that deinflects to a real dictionary entry — never settling
 * for a short accidental match (e.g. a single kanji) when a longer
 * conjugated word is actually there.
 */
export async function lookupAtCursor(
  db: DictionaryDB,
  text: string,
  cursorIndex: number,
  maxLength = DEFAULT_MAX_LENGTH,
): Promise<LookupMatch | null> {
  const upperBound = Math.min(maxLength, text.length - cursorIndex);

  for (let length = upperBound; length >= 1; length--) {
    const substring = text.slice(cursorIndex, cursorIndex + length);
    const match = await matchSubstring(db, substring);
    if (match) return { matchedText: substring, ...match };
  }

  return null;
}

async function matchSubstring(
  db: DictionaryDB,
  substring: string,
): Promise<{ reasons: string[]; entries: DictionaryEntry[] } | null> {
  const seenEntryIds = new Set<number>();
  const matchedEntries: DictionaryEntry[] = [];
  let reasons: string[] | null = null;

  for (const candidate of deinflect(substring)) {
    const entries = await lookupExact(db, candidate.term);
    for (const entry of entries) {
      if (seenEntryIds.has(entry.id)) continue;
      const entryTags = entry.senses.flatMap((sense) => sense.pos);
      if (!tagsMatch(candidate.tags, entryTags)) continue;

      seenEntryIds.add(entry.id);
      matchedEntries.push(entry);
      reasons ??= candidate.reasons;
    }
  }

  if (matchedEntries.length === 0) return null;
  return { reasons: reasons ?? [], entries: sortByFrequency(matchedEntries) };
}
