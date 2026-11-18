export interface Sense {
  /** Short JMdict tag codes (e.g. "v5m", "adj-i", "vt") — used by the deinflection validator. */
  pos: string[];
  glosses: string[];
}

export interface DictionaryEntry {
  /** JMdict's ent_seq. */
  id: number;
  /** Kanji/orthographic forms; empty for kana-only words. */
  kanji: string[];
  /** Kana readings; always at least one. */
  readings: string[];
  /** Merged ke_pri/re_pri tags (ichi1, news1, nf01-nf48, spec1, spec2, gai1, gai2) for frequency ranking. */
  priority: string[];
  senses: Sense[];
}
