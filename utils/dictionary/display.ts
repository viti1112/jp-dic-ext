import type { DictionaryEntry } from './types.ts';

export interface EntryDisplayFields {
  headword: string;
  /** Empty string for an entry with no reading at all (shouldn't happen in practice - JMdict always has at least one - but keeps this total). */
  reading: string;
  /** One string per sense (each sense's own glosses already joined); callers choose their own separator between senses. */
  glosses: string[];
  /** True when `reading` should be shown alongside `headword` rather than treated as redundant with it (i.e. there's a kanji headword to disambiguate - for a kana-only entry, the headword already is the reading). */
  showReading: boolean;
}

/**
 * The "what to show for this entry" extraction - the one place
 * `utils/anki.ts`, `components/lookup-popup.ts`, and the mini-SRS path
 * (`entrypoints/content.ts`) derive this from, so all three stay consistent
 * both in which fields they show and in when the reading is shown at all.
 */
export function entryDisplayFields(entry: DictionaryEntry, maxSenses = 3): EntryDisplayFields {
  const headword = entry.kanji[0] ?? entry.readings[0] ?? '';
  const reading = entry.readings[0] ?? '';
  const glosses = entry.senses.slice(0, maxSenses).map((sense) => sense.glosses.join('; '));
  return { headword, reading, glosses, showReading: Boolean(entry.kanji[0] && reading) };
}
