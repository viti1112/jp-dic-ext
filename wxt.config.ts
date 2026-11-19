import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  manifest: {
    name: 'KanjiFlow',
    permissions: ['storage'],
    host_permissions: [
      // AnkiConnect listens on localhost; needed to export mined words as Anki cards.
      'http://127.0.0.1:8765/*',
      // Anthropic's Messages API, for the optional "example sentence" feature (utils/claude.ts).
      'https://api.anthropic.com/*',
    ],
  },
});
