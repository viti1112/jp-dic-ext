import { browser } from 'wxt/browser';
import type { AddToAnkiResult, AnkiCard } from './anki.ts';
import type { GenerateExamplesResult } from './claude.ts';
import type { LookupMatch } from './dictionary/lookup.ts';
import type { NewSrsCard, ReviewQuality, SrsCard } from './srs/types.ts';

export interface LookupRequestMessage {
  type: 'lookup';
  text: string;
  cursorIndex: number;
}

export interface AddToAnkiRequestMessage {
  type: 'addToAnki';
  card: AnkiCard;
}

export interface GetDictionaryCountRequestMessage {
  type: 'getDictionaryCount';
}

export interface AddToSrsRequestMessage {
  type: 'addToSrs';
  card: NewSrsCard;
}

export interface GetDueSrsCountRequestMessage {
  type: 'getDueSrsCount';
}

export interface GetDueSrsCardsRequestMessage {
  type: 'getDueSrsCards';
  limit: number;
}

export interface ReviewSrsCardRequestMessage {
  type: 'reviewSrsCard';
  cardId: number;
  quality: ReviewQuality;
}

export interface GenerateExamplesRequestMessage {
  type: 'generateExamples';
  headword: string;
  reading: string;
  gloss: string;
}

export type ExtensionMessage =
  | LookupRequestMessage
  | AddToAnkiRequestMessage
  | GetDictionaryCountRequestMessage
  | AddToSrsRequestMessage
  | GetDueSrsCountRequestMessage
  | GetDueSrsCardsRequestMessage
  | ReviewSrsCardRequestMessage
  | GenerateExamplesRequestMessage;

export interface LookupResponseMessage {
  match: LookupMatch | null;
}

export interface AddToAnkiResponseMessage {
  result: AddToAnkiResult;
}

export interface GetDictionaryCountResponseMessage {
  count: number;
}

export interface AddToSrsResponseMessage {
  /** `null` if the handler threw - still an explicit response, so the sender's promise resolves instead of hanging. */
  card: SrsCard | null;
  /** Set alongside a `null` card so the caller can surface the real failure reason instead of a generic message. */
  error?: string;
}

export interface GetDueSrsCountResponseMessage {
  count: number;
}

export interface GetDueSrsCardsResponseMessage {
  cards: SrsCard[];
}

export interface ReviewSrsCardResponseMessage {
  card: SrsCard | null;
}

export interface GenerateExamplesResponseMessage {
  result: GenerateExamplesResult;
}

/** One handler per `ExtensionMessage` variant's `type`, so adding a message type is additive here rather than a rewrite. */
interface MessageHandlers {
  lookup: (text: string, cursorIndex: number) => Promise<LookupMatch | null>;
  addToAnki: (card: AnkiCard) => Promise<AddToAnkiResult>;
  getDictionaryCount: () => Promise<number>;
  addToSrs: (card: NewSrsCard) => Promise<SrsCard>;
  getDueSrsCount: () => Promise<number>;
  getDueSrsCards: (limit: number) => Promise<SrsCard[]>;
  reviewSrsCard: (cardId: number, quality: ReviewQuality) => Promise<SrsCard | null>;
  generateExamples: (headword: string, reading: string, gloss: string) => Promise<GenerateExamplesResult>;
}

/**
 * Sent by the content script; resolved by the background's registered
 * handler. Returns `null` (rather than throwing) if the background isn't
 * ready to respond yet — e.g. the extension just started and is still
 * seeding the dictionary - or if the handler itself rejected.
 */
export async function requestLookup(text: string, cursorIndex: number): Promise<LookupMatch | null> {
  const message: LookupRequestMessage = { type: 'lookup', text, cursorIndex };
  const response = (await browser.runtime.sendMessage(message)) as LookupResponseMessage | undefined;
  return response?.match ?? null;
}

/** Same not-ready-yet fallback as `requestLookup`, but AnkiConnect unreachable is itself a distinct, expected outcome - not the fallback path. */
export async function requestAddToAnki(card: AnkiCard): Promise<AddToAnkiResult> {
  const message: AddToAnkiRequestMessage = { type: 'addToAnki', card };
  const response = (await browser.runtime.sendMessage(message)) as AddToAnkiResponseMessage | undefined;
  return response?.result ?? { ok: false, reason: 'unreachable' };
}

/**
 * Sent by the toolbar popup instead of opening its own IndexedDB connection
 * - the background already has the (seeded) database open, so asking it
 * avoids both a second connection and the race of reading the count from a
 * fresh connection before the background's own `seedIfEmpty()` has finished.
 */
export async function requestDictionaryCount(): Promise<number | null> {
  const message: GetDictionaryCountRequestMessage = { type: 'getDictionaryCount' };
  const response = (await browser.runtime.sendMessage(message)) as GetDictionaryCountResponseMessage | undefined;
  return response?.count ?? null;
}

/** Throws if the background doesn't answer or the handler failed - unlike Anki, there's no "expected unreachable" outcome for the local mini-SRS database. */
export async function requestAddToSrs(card: NewSrsCard): Promise<SrsCard> {
  const message: AddToSrsRequestMessage = { type: 'addToSrs', card };
  const response = (await browser.runtime.sendMessage(message)) as AddToSrsResponseMessage | undefined;
  if (!response?.card) throw new Error(response?.error ?? 'Could not add the card to the review queue.');
  return response.card;
}

export async function requestDueSrsCount(): Promise<number> {
  const message: GetDueSrsCountRequestMessage = { type: 'getDueSrsCount' };
  const response = (await browser.runtime.sendMessage(message)) as GetDueSrsCountResponseMessage | undefined;
  return response?.count ?? 0;
}

export async function requestDueSrsCards(limit: number): Promise<SrsCard[]> {
  const message: GetDueSrsCardsRequestMessage = { type: 'getDueSrsCards', limit };
  const response = (await browser.runtime.sendMessage(message)) as GetDueSrsCardsResponseMessage | undefined;
  return response?.cards ?? [];
}

export async function requestReviewSrsCard(cardId: number, quality: ReviewQuality): Promise<SrsCard | null> {
  const message: ReviewSrsCardRequestMessage = { type: 'reviewSrsCard', cardId, quality };
  const response = (await browser.runtime.sendMessage(message)) as ReviewSrsCardResponseMessage | undefined;
  return response?.card ?? null;
}

export async function requestGenerateExamples(headword: string, reading: string, gloss: string): Promise<GenerateExamplesResult> {
  const message: GenerateExamplesRequestMessage = { type: 'generateExamples', headword, reading, gloss };
  const response = (await browser.runtime.sendMessage(message)) as GenerateExamplesResponseMessage | undefined;
  return response?.result ?? { ok: false, reason: 'unreachable' };
}

/** Registers the background-side handler for every `ExtensionMessage` variant. */
export function registerMessageHandlers(handlers: MessageHandlers): void {
  browser.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    switch (message.type) {
      case 'lookup':
        handlers
          .lookup(message.text, message.cursorIndex)
          .then((match) => sendResponse({ match } satisfies LookupResponseMessage))
          .catch(() => sendResponse({ match: null } satisfies LookupResponseMessage));
        return true; // keep the message channel open for the async sendResponse above
      case 'addToAnki':
        handlers
          .addToAnki(message.card)
          .then((result) => sendResponse({ result } satisfies AddToAnkiResponseMessage))
          .catch(() => sendResponse({ result: { ok: false, reason: 'unreachable' } } satisfies AddToAnkiResponseMessage));
        return true;
      case 'getDictionaryCount':
        handlers
          .getDictionaryCount()
          .then((count) => sendResponse({ count } satisfies GetDictionaryCountResponseMessage))
          .catch(() => sendResponse({ count: 0 } satisfies GetDictionaryCountResponseMessage));
        return true;
      case 'addToSrs':
        handlers
          .addToSrs(message.card)
          .then((card) => sendResponse({ card } satisfies AddToSrsResponseMessage))
          .catch((error: unknown) => {
            console.error('addToSrs failed:', error);
            // Must still respond on failure (card: null), same as every other
            // case - otherwise the sender's sendMessage promise never settles
            // (it does not resolve to undefined, and does not reject either)
            // and the caller hangs forever instead of seeing an error. The
            // real error message rides along so the caller isn't stuck with
            // one generic string for every possible failure.
            sendResponse({
              card: null,
              error: error instanceof Error ? error.message : undefined,
            } satisfies AddToSrsResponseMessage);
          });
        return true;
      case 'getDueSrsCount':
        handlers
          .getDueSrsCount()
          .then((count) => sendResponse({ count } satisfies GetDueSrsCountResponseMessage))
          .catch(() => sendResponse({ count: 0 } satisfies GetDueSrsCountResponseMessage));
        return true;
      case 'getDueSrsCards':
        handlers
          .getDueSrsCards(message.limit)
          .then((cards) => sendResponse({ cards } satisfies GetDueSrsCardsResponseMessage))
          .catch(() => sendResponse({ cards: [] } satisfies GetDueSrsCardsResponseMessage));
        return true;
      case 'reviewSrsCard':
        handlers
          .reviewSrsCard(message.cardId, message.quality)
          .then((card) => sendResponse({ card } satisfies ReviewSrsCardResponseMessage))
          .catch(() => sendResponse({ card: null } satisfies ReviewSrsCardResponseMessage));
        return true;
      case 'generateExamples':
        handlers
          .generateExamples(message.headword, message.reading, message.gloss)
          .then((result) => sendResponse({ result } satisfies GenerateExamplesResponseMessage))
          .catch(() => sendResponse({ result: { ok: false, reason: 'unreachable' } } satisfies GenerateExamplesResponseMessage));
        return true;
      default:
        return undefined;
    }
  });
}
