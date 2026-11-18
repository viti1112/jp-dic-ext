import { openDictionaryDB, seedIfEmpty } from '@/utils/dictionary/db.ts';

export default defineBackground(async () => {
  const db = await openDictionaryDB();
  const count = await seedIfEmpty(db, browser.runtime.getURL('/dictionary/jmdict-en.json'));
  console.log(`Dictionary ready: ${count} entries.`);
});
