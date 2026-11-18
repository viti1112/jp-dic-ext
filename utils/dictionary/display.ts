import type { DictionaryEntry } from './types.ts';

export interface EntryDisplayFields {
  headword: string;
  /** Empty string for an entry with no reading at all (shouldn't happen in practice - JMdict always has at least one - but keeps this total). */
  reading: string;
  /** One string per sense (each sense's own glosses already joined); callers choose their own separator between senses. */
  glosses: string[];
}

/** The "what to show for this entry" extraction shared by Anki export (utils/anki.ts) and the mini-SRS (utils/srs/). */
export function entryDisplayFields(entry: DictionaryEntry, maxSenses = 3): EntryDisplayFields {
  const headword = entry.kanji[0] ?? entry.readings[0] ?? '';
  const reading = entry.readings[0] ?? '';
  const glosses = entry.senses.slice(0, maxSenses).map((sense) => sense.glosses.join('; '));
  return { headword, reading, glosses };
}
