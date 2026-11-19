import { appendAnkiLog } from '@/utils/anki-log.ts';
import { addNoteToAnki } from '@/utils/anki.ts';
import { openDictionaryDB, seedIfEmpty } from '@/utils/dictionary/db.ts';
import { lookupAtCursor } from '@/utils/dictionary/lookup.ts';
import { registerMessageHandlers } from '@/utils/messaging.ts';
import { addCardIfNew, countDueCards, getDueCards, openSrsDB, reviewCardById } from '@/utils/srs/db.ts';

export default defineBackground(async () => {
  // Independent databases - opened in parallel so the (fast) SRS connection
  // isn't gated behind the dictionary's first-run seed, which can take
  // several seconds to bulk-insert ~219k entries. Each promise is awaited
  // separately (not via a single Promise.all) so a dictionary-seeding
  // failure can't also prevent the SRS handlers from ever registering - the
  // two subsystems are otherwise unrelated and should fail independently.
  const dictionaryReady = (async () => {
    const dictionaryDb = await openDictionaryDB();
    const count = await seedIfEmpty(dictionaryDb, browser.runtime.getURL('/dictionary/jmdict-en.json'));
    console.log(`Dictionary ready: ${count} entries.`);
    return dictionaryDb;
  })().catch((error: unknown) => {
    console.error('Dictionary failed to load - lookups will be unavailable:', error);
    return null;
  });
  const srsDb = await openSrsDB();
  const db = await dictionaryReady;

  registerMessageHandlers({
    lookup: (text, cursorIndex) => (db ? lookupAtCursor(db, text, cursorIndex) : Promise.resolve(null)),
    getDictionaryCount: () => (db ? db.count('entries') : Promise.resolve(0)),
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
    addToSrs: (card) => addCardIfNew(srsDb, card),
    getDueSrsCount: () => countDueCards(srsDb),
    getDueSrsCards: (limit) => getDueCards(srsDb, limit),
    reviewSrsCard: (cardId, quality) => reviewCardById(srsDb, cardId, quality),
  });
});
