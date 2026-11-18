import { browser } from 'wxt/browser';
import type { LookupMatch } from './dictionary/lookup.ts';

export interface LookupRequestMessage {
  type: 'lookup';
  text: string;
  cursorIndex: number;
}

/** Grows as more message types are added (e.g. an Anki-export request). */
export type ExtensionMessage = LookupRequestMessage;

export interface LookupResponseMessage {
  match: LookupMatch | null;
}

/** One handler per `ExtensionMessage` variant's `type`, so adding a message type is additive here rather than a rewrite. */
interface MessageHandlers {
  lookup: (text: string, cursorIndex: number) => Promise<LookupMatch | null>;
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
      default:
        return undefined;
    }
  });
}
