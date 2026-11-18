import { browser } from 'wxt/browser';

export type ActivationMode = 'shift' | 'alt' | 'always';

export interface ExtensionSettings {
  /** Which key (if any) must be held for Shift+hover-style lookups to trigger. */
  activationMode: ActivationMode;
  deckName: string;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  activationMode: 'shift',
  deckName: 'Japanese::Mining',
};

const STORAGE_KEY = 'settings';

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await browser.storage.sync.get(STORAGE_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[STORAGE_KEY] as Partial<ExtensionSettings> | undefined) };
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
    callback({ ...DEFAULT_SETTINGS, ...(changes[STORAGE_KEY]?.newValue as Partial<ExtensionSettings> | undefined) });
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
