import { addNoteToAnki } from '@/utils/anki.ts';
import { openDictionaryDB, seedIfEmpty } from '@/utils/dictionary/db.ts';
import { lookupAtCursor } from '@/utils/dictionary/lookup.ts';
import { registerMessageHandlers } from '@/utils/messaging.ts';

export default defineBackground(async () => {
  const db = await openDictionaryDB();
  const count = await seedIfEmpty(db, browser.runtime.getURL('/dictionary/jmdict-en.json'));
  console.log(`Dictionary ready: ${count} entries.`);

  registerMessageHandlers({
    lookup: (text, cursorIndex) => lookupAtCursor(db, text, cursorIndex),
    addToAnki: (card) => addNoteToAnki(card),
  });
});
