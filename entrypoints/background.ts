import { appendAnkiLog } from '@/utils/anki-log.ts';
import { addNoteToAnki } from '@/utils/anki.ts';
import { generateExampleSentences } from '@/utils/claude.ts';
import { openDictionaryDB, seedIfEmpty } from '@/utils/dictionary/db.ts';
import { lookupAtCursor } from '@/utils/dictionary/lookup.ts';
import { registerMessageHandlers } from '@/utils/messaging.ts';
import { getSettings } from '@/utils/settings.ts';
import { addCardIfNew, countDueCards, getDueCards, openSrsDB, reviewCardById } from '@/utils/srs/db.ts';

export default defineBackground(() => {
  // MV3 service workers must register their event listeners synchronously,
  // during the script's initial (synchronous) evaluation - a listener added
  // only after an `await` can lose a message that arrives while the worker
  // is still cold-starting ("Could not establish connection. Receiving end
  // does not exist."), since Chrome doesn't guarantee it's registered in
  // time to catch whatever woke the worker up in the first place. So this
  // function itself stays synchronous, and every handler below awaits its
  // own readiness promise internally instead of the registration itself
  // waiting on it.
  const dictionaryReady = (async () => {
    const dictionaryDb = await openDictionaryDB();
    const count = await seedIfEmpty(dictionaryDb, browser.runtime.getURL('/dictionary/jmdict-en.json'));
    console.log(`Dictionary ready: ${count} entries.`);
    return dictionaryDb;
  })().catch((error: unknown) => {
    console.error('Dictionary failed to load - lookups will be unavailable:', error);
    return null;
  });
  const srsReady = openSrsDB();

  registerMessageHandlers({
    lookup: async (text, cursorIndex) => {
      const db = await dictionaryReady;
      return db ? lookupAtCursor(db, text, cursorIndex) : null;
    },
    getDictionaryCount: async () => {
      const db = await dictionaryReady;
      return db ? db.count('entries') : 0;
    },
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
      const settings = await getSettings();
      return generateExampleSentences(settings.claudeApiKey, headword, reading, gloss);
    },
  });
});
