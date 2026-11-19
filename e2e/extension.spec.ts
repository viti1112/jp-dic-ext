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
