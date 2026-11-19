import { test as base, chromium, type BrowserContext } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const EXTENSION_PATH = fileURLToPath(new URL('../.output/chrome-mv3', import.meta.url));

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false, // MV3 extensions don't reliably load in headless Chromium
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`, '--headless=new'],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    // The background service worker's URL is chrome-extension://<id>/background.js -
    // waiting for it is also how we know the extension finished registering.
    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent('serviceworker');
    const extensionId = new URL(background.url()).hostname;
    await use(extensionId);
  },
});

export const expect = test.expect;
