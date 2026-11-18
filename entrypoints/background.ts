import { appendAnkiLog } from '@/utils/anki-log.ts';
import { addNoteToAnki } from '@/utils/anki.ts';
import { openDictionaryDB, seedIfEmpty } from '@/utils/dictionary/db.ts';
import { lookupAtCursor } from '@/utils/dictionary/lookup.ts';
import { registerMessageHandlers } from '@/utils/messaging.ts';
import { addCardIfNew, countDueCards, getDueCards, openSrsDB, reviewCardById } from '@/utils/srs/db.ts';

export default defineBackground(async () => {
  // Independent databases - open them in parallel so the (fast) SRS
  // connection and its message handlers aren't gated behind the dictionary's
  // first-run seed, which can take several seconds to bulk-insert ~219k entries.
  const [db, srsDb] = await Promise.all([
    (async () => {
      const dictionaryDb = await openDictionaryDB();
      const count = await seedIfEmpty(dictionaryDb, browser.runtime.getURL('/dictionary/jmdict-en.json'));
      console.log(`Dictionary ready: ${count} entries.`);
      return dictionaryDb;
    })(),
    openSrsDB(),
  ]);

  registerMessageHandlers({
    lookup: (text, cursorIndex) => lookupAtCursor(db, text, cursorIndex),
    getDictionaryCount: () => db.count('entries'),
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
