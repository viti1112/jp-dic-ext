// Records a short Playwright video of the extension in action (hover with
// Shift held -> dictionary popup -> pin -> add to the mini-SRS queue ->
// unpin), against the actually-built extension in a real Chromium. Convert
// the result to the committed demo/kanjiflow-demo.gif with ffmpeg - see
// `npm run demo:record`'s own log output for the exact command, or README.md.
//
// Requires `npm run build` to have run first. If Playwright's own Chromium
// isn't installed (`npx playwright install` needs sudo in some sandboxes),
// point this at a system one: PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import fs from 'node:fs';

const EXTENSION_PATH = fileURLToPath(new URL('../.output/chrome-mv3', import.meta.url));
const VIDEO_DIR = fileURLToPath(new URL('./video', import.meta.url));
const DEMO_PAGE_PATH = fileURLToPath(new URL('./page.html', import.meta.url));
fs.mkdirSync(VIDEO_DIR, { recursive: true });

const server = createServer(async (_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(await readFile(DEMO_PAGE_PATH));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const demoPageUrl = `http://127.0.0.1:${server.address().port}/`;

// A fresh temp profile every run (not '' - see e2e/fixtures.ts's comment on
// the same thing) so this always records the mini-SRS queue from a clean
// state (one card, the one just added) rather than whatever accumulated in
// a reused profile from earlier runs.
const userDataDir = await mkdtemp(join(tmpdir(), 'kanjiflow-demo-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  viewport: { width: 900, height: 420 },
  recordVideo: { dir: VIDEO_DIR, size: { width: 900, height: 420 } },
  args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`, '--headless=new'],
});

let [background] = context.serviceWorkers();
if (!background) background = await context.waitForEvent('serviceworker');

await background.evaluate(() =>
  chrome.storage.sync.set({ settings: { activationMode: 'shift', deckName: 'Japanese::Mining', reviewBackend: 'srs' } }),
);

const page = await context.newPage();
await page.goto(demoPageUrl);
await page.waitForTimeout(500);

// Find the pixel position of "読みました" (inside "...本を読みました。...") via
// the Range API, precisely rather than guessing coordinates.
const target = await page.evaluate(() => {
  const node = document.getElementById('text').firstChild;
  const text = node.textContent;
  const start = text.indexOf('読みました');
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, start + 1); // just the first character, so the cursor lands at the word's start
  const rect = range.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
});

await page.mouse.move(target.x, target.y - 100); // start away from the text
await page.waitForTimeout(400);

// Re-attempts the hover until the dictionary popup actually shows a
// headword - rather than a fixed delay guess for how long the ~219k-entry
// dictionary takes to seed on a cold profile, which varies with machine load.
const headword = page.locator('.headword').first();
let popupVisible = false;
for (let attempt = 0; attempt < 20 && !popupVisible; attempt++) {
  await page.keyboard.down('Shift');
  await page.mouse.move(target.x + (attempt % 2), target.y, { steps: 5 }); // nudge so mousemove always re-fires
  await page.waitForTimeout(1000);
  popupVisible = await headword.isVisible().catch(() => false);
  if (!popupVisible) await page.keyboard.up('Shift');
}
if (!popupVisible) throw new Error('Dictionary popup never appeared - is the dictionary still seeding?');

// Click to pin (still holding Shift, as the content script requires).
await page.mouse.click(target.x, target.y);
await page.keyboard.up('Shift');
await page.waitForTimeout(500);

// Add to the mini-SRS review queue - Playwright's locator pierces the
// popup's open shadow root automatically.
await page.locator('.add-btn').first().click();
await page.waitForTimeout(1200);

// Unpin.
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

await page.close();
await context.close();
server.close();

console.log(`Recorded a .webm into ${VIDEO_DIR} - convert the newest (largest) one to the committed GIF.`);
console.log('Dictionary seeding time varies with machine load, so check where the popup first appears');
console.log('(e.g. `ffmpeg -i <file>.webm -vf fps=1 /tmp/f%02d.png` and look through the frames) and trim the');
console.log('dead lead-in with -ss so the GIF starts right as the popup shows up, e.g.:');
console.log(
  '  ffmpeg -y -ss <seconds> -i demo/video/<file>.webm -vf "fps=12,scale=720:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" demo/kanjiflow-demo.gif',
);
