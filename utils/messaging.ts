import { browser } from 'wxt/browser';
import type { AddToAnkiResult, AnkiCard } from './anki.ts';
import type { LookupMatch } from './dictionary/lookup.ts';

export interface LookupRequestMessage {
  type: 'lookup';
  text: string;
  cursorIndex: number;
}

export interface AddToAnkiRequestMessage {
  type: 'addToAnki';
  card: AnkiCard;
}

export type ExtensionMessage = LookupRequestMessage | AddToAnkiRequestMessage;

export interface LookupResponseMessage {
  match: LookupMatch | null;
}

export interface AddToAnkiResponseMessage {
  result: AddToAnkiResult;
}

/** One handler per `ExtensionMessage` variant's `type`, so adding a message type is additive here rather than a rewrite. */
interface MessageHandlers {
  lookup: (text: string, cursorIndex: number) => Promise<LookupMatch | null>;
  addToAnki: (card: AnkiCard) => Promise<AddToAnkiResult>;
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
      default:
        return undefined;
    }
  });
}
