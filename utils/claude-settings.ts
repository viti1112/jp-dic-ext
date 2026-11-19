import { browser } from 'wxt/browser';

const STORAGE_KEY = 'claudeApiKey';

/**
 * The user's own Anthropic API key for the optional "example sentence"
 * feature (utils/claude.ts) - kept in `chrome.storage.local`, deliberately
 * separate from `utils/settings.ts`'s `ExtensionSettings` (`chrome.storage.sync`).
 * `storage.sync` copies its contents to every device signed into the same
 * browser account, which is the wrong place for a secret the user only
 * intended to use on this machine.
 */
export async function getClaudeApiKey(): Promise<string> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY];
  return typeof value === 'string' ? value : '';
}

export async function setClaudeApiKey(apiKey: string): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: apiKey });
}
