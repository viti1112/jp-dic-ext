import { browser } from 'wxt/browser';

export interface AnkiLogEntry {
  term: string;
  addedAt: number;
}

const LOG_KEY = 'ankiLog';
const MAX_LOG_ENTRIES = 20;

export async function getAnkiLog(): Promise<AnkiLogEntry[]> {
  const stored = await browser.storage.local.get(LOG_KEY);
  return (stored[LOG_KEY] as AnkiLogEntry[] | undefined) ?? [];
}

// Chains every call onto the previous one so two appends that resolve close
// together (e.g. two addToAnki messages handled back-to-back in the same
// service worker) can't both read the same snapshot and race on the
// get-then-set below - only ever one in-flight read-modify-write at a time.
// Swallows the previous call's own error before chaining onto it - otherwise
// a single failed write would leave this permanently rejected, and every
// `.then()` chained onto an already-rejected promise with no rejection
// handler skips its callback forever, silently no-opping every future call.
let pendingAppend: Promise<void> = Promise.resolve();

/** Most-recent-first; capped at MAX_LOG_ENTRIES so this never grows unbounded. */
export function appendAnkiLog(term: string): Promise<void> {
  const result = pendingAppend.catch(() => {}).then(async () => {
    const log = await getAnkiLog();
    const next = [{ term, addedAt: Date.now() }, ...log].slice(0, MAX_LOG_ENTRIES);
    await browser.storage.local.set({ [LOG_KEY]: next });
  });
  pendingAppend = result.catch(() => {});
  return result;
}
