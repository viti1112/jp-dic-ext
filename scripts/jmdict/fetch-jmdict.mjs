// Downloads and decompresses the raw JMdict XML that `npm run build:dictionary`
// (parse-jmdict.ts) needs - using Node's built-in fetch() and zlib instead of
// shell commands (curl, gunzip, mkdir -p), which don't exist as such on
// Windows. Works identically on Windows/macOS/Linux.
import { gunzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const URL = 'http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz';
const OUT = process.argv[2] ?? 'data/raw/JMdict_e';

console.log(`Fetching ${URL}...`);
const response = await fetch(URL);
if (!response.ok) throw new Error(`Failed to fetch JMdict: HTTP ${response.status}`);
const gzipped = Buffer.from(await response.arrayBuffer());

console.log('Decompressing...');
const xml = gunzipSync(gzipped);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, xml);
console.log(`Wrote ${xml.byteLength.toLocaleString()} bytes to ${OUT}`);
