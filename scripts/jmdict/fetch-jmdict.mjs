// Downloads and decompresses the raw JMdict XML that `npm run build:dictionary`
// (parse-jmdict.ts) needs - using Node's built-in fetch() and zlib instead of
// shell commands (curl, gunzip, mkdir -p), which don't exist as such on
// Windows. Works identically on Windows/macOS/Linux.
import { gunzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const URL = 'http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz';
const OUT = process.argv[2] ?? 'data/raw/JMdict_e';
const MAX_ATTEMPTS = 3;

// EDRDG's FTP mirror is a small academic server that occasionally times out
// or hangs under load - seen twice in CI in one session, both transient
// (a retry a few seconds later succeeded). A real HTTP error (404, etc.)
// isn't retried; only "never got a response at all".
async function fetchWithRetries() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(`Fetching ${URL} (attempt ${attempt}/${MAX_ATTEMPTS})...`);
      return await fetch(URL);
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) throw error;
      console.log(`  ...failed (${error.message}), retrying in 5s.`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

const response = await fetchWithRetries();
if (!response.ok) throw new Error(`Failed to fetch JMdict: HTTP ${response.status}`);
const gzipped = Buffer.from(await response.arrayBuffer());

console.log('Decompressing...');
const xml = gunzipSync(gzipped);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, xml);
console.log(`Wrote ${xml.byteLength.toLocaleString()} bytes to ${OUT}`);
