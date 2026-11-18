import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import type { DictionaryEntry, Sense } from './types.ts';

const SRC = process.argv[2] ?? 'data/raw/JMdict_e';
const OUT_DICTIONARY = process.argv[3] ?? 'public/dictionary/jmdict-en.json';
const OUT_POS_TAGS = process.argv[4] ?? 'data/pos-tags.json';

const ARRAY_TAGS = new Set([
  'entry',
  'k_ele',
  'r_ele',
  'sense',
  'keb',
  'reb',
  'ke_pri',
  're_pri',
  'pos',
  'gloss',
]);

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * JMdict's internal DTD declares entities like `<!ENTITY v5m "Godan verb with
 * 'mu' ending">` and the XML body references them as `&v5m;`. We need the
 * short code (v5m), not the long description, because that's what the
 * deinflection validator (T6) matches against — so entities are resolved to
 * their own name rather than their declared value. The 5 predefined XML
 * entities (lt/gt/amp/apos/quot) are left untouched for the real XML parser.
 */
function resolveJMdictEntities(xml: string): { xml: string; tagDescriptions: Record<string, string> } {
  const tagDescriptions: Record<string, string> = {};
  const entityNames = new Set<string>();
  const declRegex = /<!ENTITY\s+(\S+)\s+"([^"]*)">/g;
  for (const match of xml.matchAll(declRegex)) {
    const name = match[1]!;
    const description = match[2]!;
    entityNames.add(name);
    tagDescriptions[name] = description;
  }

  const resolved = xml.replace(/&([a-zA-Z0-9_-]+);/g, (full, name: string) =>
    entityNames.has(name) ? name : full,
  );

  return { xml: resolved, tagDescriptions };
}

function parseEntry(raw: any): DictionaryEntry {
  const kEle = toArray(raw.k_ele);
  const rEle = toArray(raw.r_ele);
  const senseEle = toArray(raw.sense);

  const kanji = kEle.flatMap((k) => toArray(k.keb));
  const readings = rEle.flatMap((r) => toArray(r.reb));

  const priority = [
    ...kEle.flatMap((k) => toArray(k.ke_pri)),
    ...rEle.flatMap((r) => toArray(r.re_pri)),
  ].filter((tag, i, all) => all.indexOf(tag) === i);

  const senses: Sense[] = senseEle.map((s) => ({
    pos: toArray(s.pos),
    glosses: toArray(s.gloss).map((g) => (typeof g === 'string' ? g : String(g))),
  }));

  return {
    id: Number(raw.ent_seq),
    kanji,
    readings,
    priority,
    senses,
  };
}

function main() {
  console.log(`Reading ${SRC}...`);
  const raw = readFileSync(SRC, 'utf-8');

  console.log('Resolving JMdict DTD entities...');
  const { xml, tagDescriptions } = resolveJMdictEntities(raw);

  console.log('Parsing XML...');
  const parser = new XMLParser({
    isArray: (name) => ARRAY_TAGS.has(name),
  });
  const doc = parser.parse(xml);
  const rawEntries = toArray(doc.JMdict.entry);
  console.log(`Parsed ${rawEntries.length} raw entries.`);

  const entries = rawEntries.map(parseEntry);

  mkdirSync(dirname(OUT_DICTIONARY), { recursive: true });
  writeFileSync(OUT_DICTIONARY, JSON.stringify(entries));
  console.log(`Wrote ${entries.length} entries to ${OUT_DICTIONARY}`);

  mkdirSync(dirname(OUT_POS_TAGS), { recursive: true });
  writeFileSync(OUT_POS_TAGS, JSON.stringify(tagDescriptions, null, 2));
  console.log(`Wrote ${Object.keys(tagDescriptions).length} tag descriptions to ${OUT_POS_TAGS}`);
}

main();
