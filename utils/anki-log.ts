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

/** Most-recent-first; capped at MAX_LOG_ENTRIES so this never grows unbounded. */
export async function appendAnkiLog(term: string): Promise<void> {
  const log = await getAnkiLog();
  const next = [{ term, addedAt: Date.now() }, ...log].slice(0, MAX_LOG_ENTRIES);
  await browser.storage.local.set({ [LOG_KEY]: next });
}
