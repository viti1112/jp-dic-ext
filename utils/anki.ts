import type { DictionaryEntry } from './dictionary/types.ts';

const ANKI_CONNECT_URL = 'http://127.0.0.1:8765';
const ANKI_CONNECT_VERSION = 6;

export interface AnkiCard {
  deckName: string;
  modelName: string;
  /** Field name -> value; depends on the note type (e.g. "Front"/"Back" for Anki's stock Basic type). */
  fields: Record<string, string>;
  tags?: string[];
}

export type AddToAnkiResult =
  | { ok: true; noteId: number }
  /**
   * AnkiConnect never answered. Covers two cases we cannot tell apart from
   * `fetch()` alone - Anki isn't running, or it is but AnkiConnect's
   * `webCorsOriginList` doesn't include this extension's origin - both
   * surface as the same opaque network-level failure.
   */
  | { ok: false; reason: 'unreachable' }
  /** AnkiConnect responded with a logical error (bad deck/model name, duplicate note, ...). */
  | { ok: false; reason: 'rejected'; message: string };

interface AnkiConnectResponse {
  result: number | null;
  error: string | null;
}

export async function addNoteToAnki(card: AnkiCard): Promise<AddToAnkiResult> {
  let response: Response;
  try {
    response = await fetch(ANKI_CONNECT_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'addNote',
        version: ANKI_CONNECT_VERSION,
        params: {
          note: {
            deckName: card.deckName,
            modelName: card.modelName,
            fields: card.fields,
            tags: card.tags ?? [],
          },
        },
      }),
    });
  } catch {
    return { ok: false, reason: 'unreachable' };
  }

  const body = (await response.json()) as AnkiConnectResponse;
  if (body.error) {
    return { ok: false, reason: 'rejected', message: body.error };
  }
  return { ok: true, noteId: body.result! };
}

/**
 * Maps a dictionary entry onto Anki's stock "Basic" note type (Front/Back
 * fields). Deck/model name are configurable per call since the options page
 * (letting the user pick their own deck and model) isn't built yet.
 */
export function basicCardFromEntry(entry: DictionaryEntry, deckName: string, modelName = 'Basic'): AnkiCard {
  const headword = entry.kanji[0] ?? entry.readings[0] ?? '';
  const reading = entry.kanji[0] ? entry.readings[0] : undefined;
  const glosses = entry.senses
    .slice(0, 3)
    .map((sense) => sense.glosses.join('; '))
    .join('<br>');

  return {
    deckName,
    modelName,
    fields: {
      Front: reading ? `${headword} (${reading})` : headword,
      Back: glosses,
    },
  };
}
