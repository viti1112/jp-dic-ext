import { appendAnkiLog } from '@/utils/anki-log.ts';
import { addNoteToAnki } from '@/utils/anki.ts';
import { getClaudeApiKey } from '@/utils/claude-settings.ts';
import { generateExampleSentences } from '@/utils/claude.ts';
import { openDictionaryDB, seedIfEmpty } from '@/utils/dictionary/db.ts';
import { lookupAtCursor } from '@/utils/dictionary/lookup.ts';
import { registerMessageHandlers } from '@/utils/messaging.ts';
import { addCardIfNew, countDueCards, getDueCards, openSrsDB, reviewCardById } from '@/utils/srs/db.ts';

export default defineBackground(() => {
  // MV3 service workers must register their event listeners synchronously,
  // during the script's initial (synchronous) evaluation - a listener added
  // only after an `await` can lose a message that arrives while the worker
  // is still cold-starting ("Could not establish connection. Receiving end
  // does not exist."), since Chrome doesn't guarantee it's registered in
  // time to catch whatever woke the worker up in the first place. So this
  // function itself stays synchronous: both databases start opening here,
  // unawaited, and registerMessageHandlers() runs synchronously right after
  // - every handler below awaits its own readiness promise internally
  // instead of the registration itself waiting on it. A handler that awaits
  // a rejected readiness promise simply throws, which registerMessageHandlers'
  // own per-message-type catch already maps to that message's safe fallback
  // (count: 0, match: null, cards: [], ...) - so there's no need for each
  // handler to also null-check and fall back by hand.
  const dictionaryReady = (async () => {
    const dictionaryDb = await openDictionaryDB();
    const count = await seedIfEmpty(dictionaryDb, browser.runtime.getURL('/dictionary/jmdict-en.json'));
    console.log(`Dictionary ready: ${count} entries.`);
    return dictionaryDb;
  })();
  const srsReady = openSrsDB();

  // Attaching a rejection handler here (even one that doesn't store the
  // resulting promise) is enough to stop an eventual rejection from
  // surfacing as an unhandled-promise-rejection warning before any message
  // that `await`s the same promise ever arrives - and it logs a diagnostic
  // each failure otherwise wouldn't get.
  dictionaryReady.catch((error: unknown) => console.error('Dictionary failed to load - lookups will be unavailable:', error));
  srsReady.catch((error: unknown) => console.error('SRS database failed to open - mini-SRS features will be unavailable:', error));

  registerMessageHandlers({
    lookup: async (text, cursorIndex) => lookupAtCursor(await dictionaryReady, text, cursorIndex),
    getDictionaryCount: async () => (await dictionaryReady).count('entries'),
    addToAnki: async (card) => {
      const result = await addNoteToAnki(card);
      if (result.ok) {
        // A logging failure must never mask a successful Anki add - the
        // note already exists in Anki either way, and the caller (the
        // popup's "+Anki" button) treats any rejection here as a reason to
        // let the user retry, which would create a duplicate note.
        try {
          await appendAnkiLog(card.fields.Front ?? '');
        } catch (error) {
          console.error('Failed to append to the Anki log (note was still added successfully):', error);
        }
      }
      return result;
    },
    addToSrs: async (card) => addCardIfNew(await srsReady, card),
    getDueSrsCount: async () => countDueCards(await srsReady),
    getDueSrsCards: async (limit) => getDueCards(await srsReady, limit),
    reviewSrsCard: async (cardId, quality) => reviewCardById(await srsReady, cardId, quality),
    generateExamples: async (headword, reading, gloss) => {
      const apiKey = await getClaudeApiKey();
      return generateExampleSentences(apiKey, headword, reading, gloss);
    },
  });
});
