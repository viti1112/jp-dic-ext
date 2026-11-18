import { afterEach, describe, expect, it, vi } from 'vitest';
import { addNoteToAnki, basicCardFromEntry } from './anki.ts';
import type { DictionaryEntry } from './dictionary/types.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

const CARD = { deckName: 'Japanese', modelName: 'Basic', fields: { Front: '読む', Back: 'to read' } };

describe('addNoteToAnki', () => {
  it('returns the new note id on success', async () => {
    globalThis.fetch = vi.fn(async () => ({ json: async () => ({ result: 12345, error: null }) }) as Response);
    const result = await addNoteToAnki(CARD);
    expect(result).toEqual({ ok: true, noteId: 12345 });
  });

  it('posts the addNote action with the given card fields', async () => {
    const fetchSpy = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        ({ json: async () => ({ result: 1, error: null }) }) as Response,
    );
    globalThis.fetch = fetchSpy;
    await addNoteToAnki(CARD);

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:8765',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body).toEqual({
      action: 'addNote',
      version: 6,
      params: { note: { deckName: 'Japanese', modelName: 'Basic', fields: { Front: '読む', Back: 'to read' }, tags: [] } },
    });
  });

  it('reports "unreachable" when fetch itself throws (Anki not running, or CORS not configured)', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const result = await addNoteToAnki(CARD);
    expect(result).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('reports "rejected" with AnkiConnect\'s own error message for a logical failure', async () => {
    globalThis.fetch = vi.fn(
      async () => ({ json: async () => ({ result: null, error: 'deck not found' }) }) as Response,
    );
    const result = await addNoteToAnki(CARD);
    expect(result).toEqual({ ok: false, reason: 'rejected', message: 'deck not found' });
  });
});

describe('basicCardFromEntry', () => {
  const entry: DictionaryEntry = {
    id: 1,
    kanji: ['読む'],
    readings: ['よむ'],
    priority: [],
    senses: [
      { pos: ['v5m'], glosses: ['to read'] },
      { pos: ['v5m'], glosses: ['to recite', 'to chant'] },
    ],
  };

  it('puts the kanji with its reading in parens on the Front', () => {
    const card = basicCardFromEntry(entry, 'Japanese');
    expect(card.fields.Front).toBe('読む (よむ)');
  });

  it('joins up to 3 senses on the Back with <br>', () => {
    const card = basicCardFromEntry(entry, 'Japanese');
    expect(card.fields.Back).toBe('to read<br>to recite; to chant');
  });

  it('uses the reading alone as the Front for a kana-only entry', () => {
    const kanaOnly: DictionaryEntry = { ...entry, kanji: [] };
    const card = basicCardFromEntry(kanaOnly, 'Japanese');
    expect(card.fields.Front).toBe('よむ');
  });

  it('defaults to the "Basic" model name', () => {
    const card = basicCardFromEntry(entry, 'Japanese');
    expect(card.modelName).toBe('Basic');
  });

  it('passes through the given deck and model name', () => {
    const card = basicCardFromEntry(entry, 'My Deck', 'My Model');
    expect(card.deckName).toBe('My Deck');
    expect(card.modelName).toBe('My Model');
  });
});
