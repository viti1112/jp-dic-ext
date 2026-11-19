import { test as base, chromium, type BrowserContext } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTENSION_PATH = fileURLToPath(new URL('../.output/chrome-mv3', import.meta.url));
const DEMO_PAGE_PATH = fileURLToPath(new URL('../demo/page.html', import.meta.url));

export const test = base.extend<{ context: BrowserContext; extensionId: string; demoUrl: string }>({
  context: async ({}, use) => {
    // An explicit, unique temp directory per test - not '' (empty string).
    // With '', a test that added a mini-SRS card was once observed seeing an
    // unrelated, older card surface first on the review page instead of its
    // own - stale IndexedDB state bleeding in from an earlier run somehow,
    // even though the launched profile directory's own name was unique each
    // time. Explicitly managing the directory ourselves (and removing it
    // afterward) reproducibly fixed it; use this instead of relying on
    // launchPersistentContext('')'s own temp-profile behavior.
    const userDataDir = await mkdtemp(join(tmpdir(), 'kanjiflow-e2e-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false, // MV3 extensions don't reliably load in headless Chromium
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`, '--headless=new'],
    });
    await use(context);
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  },
  extensionId: async ({ context }, use) => {
    // The background service worker's URL is chrome-extension://<id>/background.js -
    // waiting for it is also how we know the extension finished registering.
    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent('serviceworker');
    const extensionId = new URL(background.url()).hostname;
    await use(extensionId);
  },
  // The content script only matches *://*/* (http/https), not file:// - a
  // real page served over HTTP, same as demo/record.mjs uses for the README
  // GIF, is what lets these tests exercise the actual Shift+hover pipeline.
  demoUrl: async ({}, use) => {
    const html = await readFile(DEMO_PAGE_PATH);
    const server: Server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    await use(`http://127.0.0.1:${port}/`);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  },
});

export const expect = test.expect;
