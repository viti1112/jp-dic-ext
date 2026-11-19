import { browser } from 'wxt/browser';

export type ActivationMode = 'shift' | 'alt' | 'always';

/** Which system the popup's add-card button feeds - Anki, or the extension's own built-in mini-SRS. */
export type ReviewBackend = 'anki' | 'srs';

export interface ExtensionSettings {
  /** Which key (if any) must be held for Shift+hover-style lookups to trigger. */
  activationMode: ActivationMode;
  deckName: string;
  reviewBackend: ReviewBackend;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  activationMode: 'shift',
  deckName: 'Japanese::Mining',
  reviewBackend: 'anki',
};

const STORAGE_KEY = 'settings';

const ACTIVATION_MODES: ActivationMode[] = ['shift', 'alt', 'always'];
const REVIEW_BACKENDS: ReviewBackend[] = ['anki', 'srs'];

/**
 * Falls back field-by-field to `DEFAULT_SETTINGS` for anything stored that
 * isn't a value this version of the extension recognizes (e.g. a leftover
 * value from an older/newer version, or storage corruption) - so one bad
 * field can't put the rest of settings, or the whole UI, into a broken state.
 */
function sanitize(stored: Partial<ExtensionSettings> | undefined): ExtensionSettings {
  return {
    activationMode: ACTIVATION_MODES.includes(stored?.activationMode as ActivationMode)
      ? (stored!.activationMode as ActivationMode)
      : DEFAULT_SETTINGS.activationMode,
    deckName: typeof stored?.deckName === 'string' && stored.deckName.trim() ? stored.deckName : DEFAULT_SETTINGS.deckName,
    reviewBackend: REVIEW_BACKENDS.includes(stored?.reviewBackend as ReviewBackend)
      ? (stored!.reviewBackend as ReviewBackend)
      : DEFAULT_SETTINGS.reviewBackend,
  };
}

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await browser.storage.sync.get(STORAGE_KEY);
  return sanitize(stored[STORAGE_KEY] as Partial<ExtensionSettings> | undefined);
}

export async function updateSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const next = { ...(await getSettings()), ...patch };
  await browser.storage.sync.set({ [STORAGE_KEY]: next });
  return next;
}

/** Fires on every settings change, from any extension context (background, popup, content script). */
export function onSettingsChanged(callback: (settings: ExtensionSettings) => void): void {
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync' || !(STORAGE_KEY in changes)) return;
    callback(sanitize(changes[STORAGE_KEY]?.newValue as Partial<ExtensionSettings> | undefined));
  });
}

/** True if `event`'s modifier state satisfies `mode` — the single place that knows what each activation mode means. */
export function isActivationHeld(mode: ActivationMode, event: { shiftKey: boolean; altKey: boolean }): boolean {
  switch (mode) {
    case 'shift':
      return event.shiftKey;
    case 'alt':
      return event.altKey;
    case 'always':
      return true;
  }
}
