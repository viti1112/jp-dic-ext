import { defineConfig } from '@playwright/test';

// Smoke-level E2E against the built extension (.output/chrome-mv3) in a real
// Chromium with the extension loaded - npm run build must have run first.
// Not meant to cover every feature; it exists to catch "the extension
// doesn't load/the page crashes on open" regressions unit tests can't see.
export default defineConfig({
  testDir: './e2e',
  // Every test gets its own fresh browser profile (see e2e/fixtures.ts), so
  // each one that touches the dictionary pays the full cold ~219k-entry seed
  // cost independently - well past Playwright's 30s default.
  timeout: 90_000,
  fullyParallel: false, // sequential, one at a time - keeps CI output readable and avoids N parallel cold dictionary seeds competing for CPU
  workers: 1,
  reporter: 'list',
});
