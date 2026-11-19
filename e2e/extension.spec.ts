import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

test('the popup opens and shows a non-zero dictionary count once seeded', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  await expect(page.locator('.brand-name')).toHaveText('KanjiFlow');
  // Seeding ~219k entries from scratch on a brand-new profile can take a while.
  await expect(page.locator('#dict-count')).not.toHaveText('…', { timeout: 60_000 });
  const dictCountText = await page.locator('#dict-count').textContent();
  expect(dictCountText).not.toBe('недоступно');
});

test('the options page opens and persists the deck name and Claude API key across a reload', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  await expect(page.locator('.brand-name')).toHaveText('KanjiFlow');

  const deckInput = page.locator('#deck-input');
  await deckInput.fill('E2E::Deck');
  await deckInput.dispatchEvent('change');

  const claudeKeyInput = page.locator('#claude-key-input');
  await claudeKeyInput.fill('sk-ant-e2e-test');
  await claudeKeyInput.dispatchEvent('change');
  await expect(page.locator('#claude-key-hint')).toHaveText('Сохранено.');

  await page.reload();
  await expect(page.locator('#deck-input')).toHaveValue('E2E::Deck');
  await expect(page.locator('#claude-key-input')).toHaveValue('sk-ant-e2e-test');
});

test('the review page opens without crashing when there are no due cards', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/review.html`);

  await expect(page.locator('.brand')).toBeVisible();
});

/** Finds the pixel center of the first character at `search` within `selector`'s own (direct) text node, via the Range API - precise rather than guessing coordinates from font metrics. */
async function locateChar(page: Page, selector: string, search: string): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ({ selector, search }) => {
      const node = document.querySelector(selector)!.firstChild!;
      const start = node.textContent!.indexOf(search);
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + 1);
      const rect = range.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    },
    { selector, search },
  );
}

/**
 * Holds `modifierKey` (or holds nothing, for `activationMode: 'always'` -
 * pass `null`) and nudges the mouse onto `target` repeatedly until the
 * dictionary popup actually shows a headword - the ~219k-entry dictionary's
 * seed time on a cold profile varies with machine load, so a fixed delay
 * would be flaky. Leaves the key held (if any) on success.
 *
 * Each test gets its own fresh browser profile (see fixtures.ts), so this
 * isn't a cache hit off an earlier test's already-seeded dictionary - the
 * full cold-seed cost (same one `requestDictionaryCount` polls up to 60s for
 * elsewhere in this file) applies independently every time, so the retry
 * budget here needs to match that, not just cover a quick UI render.
 *
 * Nudges by 1px *vertically* between attempts (not horizontally): a
 * horizontal nudge risks crossing into the next character's glyph on a
 * `target.x` that was already right at a character boundary, moving
 * `cursorIndex` one character to the right - which `lookupAtCursor`'s
 * forward-only search (see CLAUDE.md) then can't see past, matching a
 * shorter/different real word instead of the one this is supposed to hover.
 * A small vertical nudge still forces a fresh `mousemove` event each retry
 * without risking that.
 */
async function hoverUntilVisible(page: Page, target: { x: number; y: number }, modifierKey: 'Shift' | 'Alt' | null): Promise<void> {
  const headword = page.locator('.headword').first();
  for (let attempt = 0; attempt < 60; attempt++) {
    if (modifierKey) await page.keyboard.down(modifierKey);
    await page.mouse.move(target.x, target.y + (attempt % 2), { steps: 5 });
    await page.waitForTimeout(1000);
    if (await headword.isVisible().catch(() => false)) return;
    if (modifierKey) await page.keyboard.up(modifierKey);
  }
  throw new Error('Dictionary popup never appeared - is the dictionary still seeding?');
}

test('Shift+hover over conjugated text shows the deinflected dictionary entry', async ({ context, demoUrl }) => {
  const page = await context.newPage();
  await page.goto(demoUrl);

  const target = await locateChar(page, '#text', '読みました');
  await page.mouse.move(target.x, target.y - 50); // start away from the text
  await hoverUntilVisible(page, target, 'Shift');
  await page.keyboard.up('Shift');

  await expect(page.locator('.headword').first()).toHaveText('読む');
  await expect(page.locator('.reading').first()).toHaveText('よむ');
});

test('pinning a match, adding it to the mini-SRS queue, and reviewing it works end to end', async ({ context, extensionId, demoUrl }) => {
  // Switch to the mini-SRS backend via the real options UI - AnkiConnect
  // isn't running in this environment, and the add-card button's behavior
  // depends on this setting, same as a real user toggling it.
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.click('#backend-segmented button[data-backend="srs"]');
  await options.waitForTimeout(300);
  await options.close();

  const page = await context.newPage();
  await page.goto(demoUrl);

  const target = await locateChar(page, '#text', '読みました');
  await page.mouse.move(target.x, target.y - 50);
  await hoverUntilVisible(page, target, 'Shift');

  // Click to pin (still holding Shift, as the content script requires).
  await page.mouse.click(target.x, target.y);
  await page.keyboard.up('Shift');
  await expect(page.locator('.headword').first()).toHaveText('読む'); // pinning must not change which entry is showing

  const addButton = page.locator('.add-btn').first();
  await expect(addButton).toBeVisible();
  await addButton.click();
  await expect(addButton).toHaveText('✓ Added', { timeout: 10_000 });
  await page.close();

  const review = await context.newPage();
  await review.goto(`chrome-extension://${extensionId}/review.html`);
  await expect(review.locator('.headword')).toContainText('読む');

  await review.click('#reveal');
  await expect(review.locator('.reading')).toHaveText('よむ');

  await review.click('.rate-btn[data-quality="good"]');
  // A freshly-reviewed card's dueAt moves into the future, so the queue
  // empties rather than looping back to the same card.
  await expect(review.locator('.empty-state')).toBeVisible({ timeout: 10_000 });
});

test('the "+ Anki" button fails gracefully (not a hang or a crash) when AnkiConnect is unreachable', async ({ context, extensionId, demoUrl }) => {
  // Switch to Anki mode via the real options UI - the default is the
  // mini-SRS (see utils/settings.ts), so this has to be explicit. Nothing
  // in this environment runs AnkiConnect, which is exactly the case this
  // test is for: does the extension fail this *visibly and recoverably*,
  // rather than hanging forever or throwing, when Anki genuinely isn't there.
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.click('#backend-segmented button[data-backend="anki"]');
  await options.waitForTimeout(300);
  await options.close();

  const page = await context.newPage();
  await page.goto(demoUrl);

  const target = await locateChar(page, '#text', '読みました');
  await page.mouse.move(target.x, target.y - 50);
  await hoverUntilVisible(page, target, 'Shift');

  await page.mouse.click(target.x, target.y);
  await page.keyboard.up('Shift');

  const addButton = page.locator('.add-btn').first();
  await expect(addButton).toHaveText('+ Anki'); // confirms the backend switch actually took effect
  await addButton.click();

  // utils/anki.ts's fetchWithTimeout caps this at 10s - well under this
  // assertion's own timeout, so a real hang (the bug a bare fetch() with no
  // timeout would risk) would fail this test rather than just being slow.
  await expect(addButton).toHaveText('✗ Error', { timeout: 15_000 });
  expect(await addButton.isDisabled()).toBe(false); // retryable, e.g. once Anki is actually started
  expect(await addButton.getAttribute('title')).toContain('AnkiConnect');

  // Retrying doesn't hang or throw either - same outcome, not stuck on "...".
  await addButton.click();
  await expect(addButton).toHaveText('✗ Error', { timeout: 15_000 });
});

test('click-to-pin does not hijack a real link click', async ({ context, demoUrl }) => {
  const page = await context.newPage();
  await page.goto(demoUrl);

  const target = await locateChar(page, '#link', '猫');
  await page.mouse.move(target.x, target.y - 50);
  await hoverUntilVisible(page, target, 'Shift'); // 猫 ("cat") is a real dictionary word, so a popup is expected here too

  // Holding Shift while clicking a link is itself a native browser gesture
  // (open in a new window) - unrelated to this extension, but it means a
  // successful native click here opens a *second* page rather than
  // navigating the current one, so that's what proves preventDefault()
  // wasn't called.
  const newPagePromise = context.waitForEvent('page');
  await page.mouse.click(target.x, target.y);

  // isInteractiveElement() must have made the content script back off and
  // let the native <a> click through, instead of preventDefault()-ing it to
  // pin the popup - the normal page behavior (opening the link) takes
  // priority over the lookup feature for an actual link.
  const newPage = await newPagePromise;
  await expect(newPage).toHaveURL(/#visited$/);
  await newPage.close();

  // If the click had pinned the popup on the original page instead,
  // show()/hide() would both be no-ops until Escape - releasing Shift
  // (checked before anything else in the mousemove handler) should hide it
  // normally, proving it never pinned.
  await page.keyboard.up('Shift');
  await page.mouse.move(target.x, target.y - 1, { steps: 2 });
  await expect(page.locator('.headword').first()).toBeHidden();
});

test('clicking anywhere outside the pinned popup closes it, the same as Escape', async ({ context, demoUrl }) => {
  const page = await context.newPage();
  await page.goto(demoUrl);

  const target = await locateChar(page, '#text', '読みました');
  await page.mouse.move(target.x, target.y - 50);
  await hoverUntilVisible(page, target, 'Shift');

  // Click to pin (still holding Shift, as the content script requires).
  await page.mouse.click(target.x, target.y);
  await page.keyboard.up('Shift');
  await expect(page.locator('.headword').first()).toBeVisible();

  // A plain click elsewhere on the page - not Shift-held, not on the
  // popup, not on an interactive element (that's the separate link-click
  // test above) - should dismiss the pinned popup just like Escape does,
  // rather than leaving it stuck open until the user finds the right key.
  const elsewhere = page.locator('#elsewhere');
  await elsewhere.click();
  await expect(page.locator('.headword').first()).toBeHidden();
});

test('Alt+hover activates the lookup when activationMode is set to "alt", and Shift no longer does', async ({
  context,
  extensionId,
  demoUrl,
}) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.click('#activation-segmented button[data-mode="alt"]');
  await options.waitForTimeout(300);
  await options.close();

  const page = await context.newPage();
  await page.goto(demoUrl);

  const target = await locateChar(page, '#text', '読みました');
  await page.mouse.move(target.x, target.y - 50);
  await hoverUntilVisible(page, target, 'Alt');
  await page.keyboard.up('Alt');
  await expect(page.locator('.headword').first()).toHaveText('読む');

  // Move away, then back with Shift instead - isActivationHeld() must reject
  // it now that the configured mode is 'alt', confirming the setting itself
  // (not some unrelated always-on behavior) is what made the hover above work.
  await page.mouse.move(target.x, target.y - 50);
  await page.waitForTimeout(300);
  await page.keyboard.down('Shift');
  await page.mouse.move(target.x, target.y, { steps: 5 });
  await page.waitForTimeout(500);
  await expect(page.locator('.headword').first()).toBeHidden();
  await page.keyboard.up('Shift');
});

test('hovering with no modifier key activates the lookup when activationMode is set to "always"', async ({
  context,
  extensionId,
  demoUrl,
}) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.click('#activation-segmented button[data-mode="always"]');
  await options.waitForTimeout(300);
  await options.close();

  const page = await context.newPage();
  await page.goto(demoUrl);

  const target = await locateChar(page, '#text', '読みました');
  await page.mouse.move(target.x, target.y - 50);
  await hoverUntilVisible(page, target, null); // no key held at all

  await expect(page.locator('.headword').first()).toHaveText('読む');
});
