import { entryDisplayFields } from './dictionary/display.ts';
import type { DictionaryEntry } from './dictionary/types.ts';
import { parseJsonBody } from './http.ts';

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
  result: unknown;
  error: unknown;
}

/**
 * Parses and validates an AnkiConnect response body - `null` if the body
 * isn't valid JSON, or isn't the `{result, error}` shape AnkiConnect always
 * replies with (e.g. some other local service answered on that port) - so a
 * malformed response is distinguished from a network-level failure, rather
 * than silently treated as either an unexplained crash or - worse - a false
 * success.
 */
async function parseAnkiConnectResponse(response: Response): Promise<AnkiConnectResponse | null> {
  const body = await parseJsonBody<unknown>(response);
  if (typeof body !== 'object' || body === null || !('result' in body) || !('error' in body)) return null;
  return body as AnkiConnectResponse;
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

  const body = await parseAnkiConnectResponse(response);
  if (!body) return { ok: false, reason: 'unreachable' };
  if (typeof body.error === 'string') return { ok: false, reason: 'rejected', message: body.error };
  if (typeof body.result === 'number') return { ok: true, noteId: body.result };
  // Neither a string error nor a numeric note id - an unexpected shape we can't treat as a real success.
  return { ok: false, reason: 'unreachable' };
}

/** True if AnkiConnect answered at all - same "can't tell CORS from not-running" caveat as `addNoteToAnki`. */
export async function pingAnkiConnect(): Promise<boolean> {
  try {
    const response = await fetch(ANKI_CONNECT_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'version', version: ANKI_CONNECT_VERSION }),
    });
    const body = await parseAnkiConnectResponse(response);
    return body !== null && body.error == null;
  } catch {
    return false;
  }
}

/**
 * Maps a dictionary entry onto Anki's stock "Basic" note type (Front/Back
 * fields). Deck name is configurable per call via the toolbar popup's
 * settings; the model name defaults to "Basic" since there's no UI yet to
 * pick a different note type.
 */
export function basicCardFromEntry(entry: DictionaryEntry, deckName: string, modelName = 'Basic'): AnkiCard {
  const { headword, reading, glosses, showReading } = entryDisplayFields(entry);
  const front = showReading ? `${headword} (${reading})` : headword;

  return {
    deckName,
    modelName,
    fields: {
      Front: front,
      Back: glosses.join('<br>'),
    },
  };
}
