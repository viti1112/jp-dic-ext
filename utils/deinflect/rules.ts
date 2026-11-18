import type { DeinflectRule, PosTag } from './types.ts';

/**
 * Known gaps, deliberately out of scope for this rule table (each affects a
 * small, closed set of words rather than a whole conjugation class):
 * - v1-s (くれる-class): imperative is くれ, not くれろ — regular v1 rules
 *   still cover all its other forms correctly.
 * - adj-ix (いい/よい-class): いい inflects on the よい stem (良くない, not
 *   いくない) — only いい and compounds like かっこいい are affected.
 * - v5aru, v5uru: archaic/honorific classes, rare enough in modern text to skip.
 * - Copula (だ/です) and na-adjective conjugation: not attempted here — this
 *   table targets verbs and i-adjectives per the project plan.
 */

function rule(name: string, kanaIn: string, kanaOut: string, tag: PosTag): DeinflectRule {
  return { name, kanaIn, kanaOut, tagsIn: [tag], tagsOut: [tag] };
}

interface GodanClass {
  tag: PosTag;
  final: string;
  aRow: string;
  iRow: string;
  eRow: string;
  oRow: string;
  /** Onbin (sound-change) te-form ending, e.g. "いて" for the ku-class. */
  te: string;
  /** Onbin ta-form ending, e.g. "いた" for the ku-class. */
  ta: string;
}

// v5r-i (e.g. 下さる) reuses the v5r rows; its own irregularities (imperative
// くれ-style for some members) are a known gap, same as v1-s above.
// v5k-s (iku/yuku) reuses the v5k rows except te/ta, which are irregular
// (って/った, not いて/いた) — folded in here instead of a separate hand-written
// rule list so it can't silently drift from what godanRules() generates.
const GODAN_CLASSES: GodanClass[] = [
  { tag: 'v5u', final: 'う', aRow: 'わ', iRow: 'い', eRow: 'え', oRow: 'お', te: 'って', ta: 'った' },
  { tag: 'v5u-s', final: 'う', aRow: 'わ', iRow: 'い', eRow: 'え', oRow: 'お', te: 'って', ta: 'った' },
  { tag: 'v5k', final: 'く', aRow: 'か', iRow: 'き', eRow: 'け', oRow: 'こ', te: 'いて', ta: 'いた' },
  { tag: 'v5k-s', final: 'く', aRow: 'か', iRow: 'き', eRow: 'け', oRow: 'こ', te: 'って', ta: 'った' },
  { tag: 'v5g', final: 'ぐ', aRow: 'が', iRow: 'ぎ', eRow: 'げ', oRow: 'ご', te: 'いで', ta: 'いだ' },
  { tag: 'v5s', final: 'す', aRow: 'さ', iRow: 'し', eRow: 'せ', oRow: 'そ', te: 'して', ta: 'した' },
  { tag: 'v5t', final: 'つ', aRow: 'た', iRow: 'ち', eRow: 'て', oRow: 'と', te: 'って', ta: 'った' },
  { tag: 'v5n', final: 'ぬ', aRow: 'な', iRow: 'に', eRow: 'ね', oRow: 'の', te: 'んで', ta: 'んだ' },
  { tag: 'v5b', final: 'ぶ', aRow: 'ば', iRow: 'び', eRow: 'べ', oRow: 'ぼ', te: 'んで', ta: 'んだ' },
  { tag: 'v5m', final: 'む', aRow: 'ま', iRow: 'み', eRow: 'め', oRow: 'も', te: 'んで', ta: 'んだ' },
  { tag: 'v5r', final: 'る', aRow: 'ら', iRow: 'り', eRow: 'れ', oRow: 'ろ', te: 'って', ta: 'った' },
  { tag: 'v5r-i', final: 'る', aRow: 'ら', iRow: 'り', eRow: 'れ', oRow: 'ろ', te: 'って', ta: 'った' },
];

function godanRules(c: GodanClass): DeinflectRule[] {
  return [
    rule('negative', c.aRow + 'ない', c.final, c.tag),
    rule('negative-past', c.aRow + 'なかった', c.final, c.tag),
    rule('polite', c.iRow + 'ます', c.final, c.tag),
    rule('polite-negative', c.iRow + 'ません', c.final, c.tag),
    rule('polite-past', c.iRow + 'ました', c.final, c.tag),
    rule('polite-negative-past', c.iRow + 'ませんでした', c.final, c.tag),
    rule('te-form', c.te, c.final, c.tag),
    rule('past', c.ta, c.final, c.tag),
    rule('potential', c.eRow + 'る', c.final, c.tag),
    rule('potential-negative', c.eRow + 'ない', c.final, c.tag),
    rule('passive', c.aRow + 'れる', c.final, c.tag),
    rule('passive-negative', c.aRow + 'れない', c.final, c.tag),
    rule('causative', c.aRow + 'せる', c.final, c.tag),
    rule('causative-negative', c.aRow + 'せない', c.final, c.tag),
    rule('volitional', c.oRow + 'う', c.final, c.tag),
    rule('conditional', c.eRow + 'ば', c.final, c.tag),
    rule('imperative', c.eRow, c.final, c.tag),
  ];
}

// Shared by both ichidan verbs and kuru's kanji branch (来ない, 来られる, ...)
// — they take identical suffixes apart from the imperative, so this is the
// single source of truth for both instead of two hand-written lists that can
// silently drift apart (as ICHIDAN_RULES and the old KURU_RULES already had).
const ICHIDAN_SHAPED_FORMS: { name: string; suffix: string }[] = [
  { name: 'negative', suffix: 'ない' },
  { name: 'negative-past', suffix: 'なかった' },
  { name: 'polite', suffix: 'ます' },
  { name: 'polite-negative', suffix: 'ません' },
  { name: 'polite-past', suffix: 'ました' },
  { name: 'polite-negative-past', suffix: 'ませんでした' },
  { name: 'te-form', suffix: 'て' },
  { name: 'past', suffix: 'た' },
  // Ichidan potential and passive are homophonous (both stem+られる).
  { name: 'potential-or-passive', suffix: 'られる' },
  { name: 'potential-or-passive-negative', suffix: 'られない' },
  { name: 'causative', suffix: 'させる' },
  { name: 'causative-negative', suffix: 'させない' },
  { name: 'volitional', suffix: 'よう' },
  { name: 'conditional', suffix: 'れば' },
];

function ichidanShapedRules(tag: PosTag, final: string, imperative: string): DeinflectRule[] {
  return [
    ...ICHIDAN_SHAPED_FORMS.map((f) => rule(f.name, f.suffix, final, tag)),
    rule('imperative', imperative, final, tag),
  ];
}

const ICHIDAN_RULES: DeinflectRule[] = ichidanShapedRules('v1', 'る', 'ろ');

function suruRules(tag: PosTag): DeinflectRule[] {
  return [
    rule('negative', 'しない', 'する', tag),
    rule('negative-past', 'しなかった', 'する', tag),
    rule('polite', 'します', 'する', tag),
    rule('polite-negative', 'しません', 'する', tag),
    rule('polite-past', 'しました', 'する', tag),
    rule('polite-negative-past', 'しませんでした', 'する', tag),
    rule('te-form', 'して', 'する', tag),
    rule('past', 'した', 'する', tag),
    rule('passive-or-potential', 'される', 'する', tag),
    rule('causative', 'させる', 'する', tag),
    rule('volitional', 'しよう', 'する', tag),
    rule('conditional', 'すれば', 'する', tag),
    rule('imperative', 'しろ', 'する', tag),
  ];
}

// Kuru's kana reading shifts (く -> こ/き) independently of whether 来 (kanji)
// or くる (kana) is used in the surface text, so both spellings need their
// own rules — stripping a kana-only suffix off a kanji-written 来ない would
// otherwise silently produce the wrong stem. The kanji branch reuses
// ICHIDAN_SHAPED_FORMS (via ichidanShapedRules) so it can't drift from
// ICHIDAN_RULES; the kana branch reuses the same form list with a prefix
// — き before the masu/te/ta stem row, こ everywhere else — which isn't
// mechanically derivable from the kanji suffix, so it's spelled out here.
const KURU_KANA_PREFIX_BY_FORM: Record<string, string> = {
  negative: 'こ',
  'negative-past': 'こ',
  polite: 'き',
  'polite-negative': 'き',
  'polite-past': 'き',
  'polite-negative-past': 'き',
  'te-form': 'き',
  past: 'き',
  'potential-or-passive': 'こ',
  'potential-or-passive-negative': 'こ',
  causative: 'こ',
  'causative-negative': 'こ',
  volitional: 'こ',
  conditional: 'こ',
};

const KURU_RULES: DeinflectRule[] = [
  ...ichidanShapedRules('vk', 'る', 'い'),
  ...ICHIDAN_SHAPED_FORMS.map((f) => rule(f.name, KURU_KANA_PREFIX_BY_FORM[f.name]! + f.suffix, 'くる', 'vk')),
  rule('imperative', 'こい', 'くる', 'vk'),
];

const ADJ_I_RULES: DeinflectRule[] = [
  rule('negative', 'くない', 'い', 'adj-i'),
  rule('negative-past', 'くなかった', 'い', 'adj-i'),
  rule('past', 'かった', 'い', 'adj-i'),
  rule('te-form', 'くて', 'い', 'adj-i'),
  rule('conditional', 'ければ', 'い', 'adj-i'),
  rule('adverbial', 'く', 'い', 'adj-i'),
  rule('noun-form', 'さ', 'い', 'adj-i'),
];

export const DEINFLECT_RULES: DeinflectRule[] = [
  ...GODAN_CLASSES.flatMap(godanRules),
  ...ICHIDAN_RULES,
  ...suruRules('vs'),
  ...suruRules('vs-i'),
  ...suruRules('vs-s'),
  ...KURU_RULES,
  ...ADJ_I_RULES,
];
