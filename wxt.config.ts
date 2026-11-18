import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  manifest: {
    name: 'JP Dictionary Inspector',
    permissions: ['storage'],
    // AnkiConnect listens on localhost; needed to export mined words as Anki cards.
    host_permissions: ['http://127.0.0.1:8765/*'],
  },
});
