import { describe, expect, it } from 'vitest';
import { deinflect, tagsMatch } from './deinflect.ts';

function candidateFor(word: string, term: string, tag: string) {
  return deinflect(word).find((c) => c.term === term && c.tags.includes(tag));
}

describe('deinflect', () => {
  it('always includes the input itself as a depth-0 "any" candidate', () => {
    const candidates = deinflect('読みません');
    expect(candidates[0]).toEqual({ term: '読みません', tags: ['any'], reasons: [] });
  });

  describe('godan verbs', () => {
    it.each([
      ['読みません', '読む', 'v5m', 'polite-negative'],
      ['書いて', '書く', 'v5k', 'te-form'],
      ['飲もう', '飲む', 'v5m', 'volitional'],
      ['死んだ', '死ぬ', 'v5n', 'past'],
      ['買わなかった', '買う', 'v5u', 'negative-past'],
      ['泳げる', '泳ぐ', 'v5g', 'potential'],
      ['話せば', '話す', 'v5s', 'conditional'],
      ['待て', '待つ', 'v5t', 'imperative'],
      ['飛ばない', '飛ぶ', 'v5b', 'negative'],
      ['売られる', '売る', 'v5r', 'passive'],
    ])('%s -> %s [%s] via %s', (surface, term, tag, reason) => {
      const candidate = candidateFor(surface, term, tag);
      expect(candidate).toBeDefined();
      expect(candidate?.reasons).toContain(reason);
    });

    it('iku/yuku (v5k-s) uses the irregular って/った te/ta form, not いて/いた', () => {
      expect(candidateFor('行って', '行く', 'v5k-s')?.reasons).toContain('te-form');
      expect(candidateFor('行いて', '行く', 'v5k-s')).toBeUndefined();
    });

    it('iku/yuku supports passive-negative and causative-negative (regression: these were missing before the godan-generator fold-in)', () => {
      expect(candidateFor('行かれない', '行く', 'v5k-s')?.reasons).toContain('passive-negative');
      expect(candidateFor('行かせない', '行く', 'v5k-s')?.reasons).toContain('causative-negative');
    });
  });

  describe('ichidan verbs', () => {
    it('handles the te/ta/negative/potential-or-passive forms', () => {
      expect(candidateFor('食べて', '食べる', 'v1')?.reasons).toContain('te-form');
      expect(candidateFor('食べた', '食べる', 'v1')?.reasons).toContain('past');
      expect(candidateFor('食べない', '食べる', 'v1')?.reasons).toContain('negative');
      expect(candidateFor('食べられる', '食べる', 'v1')?.reasons).toContain('potential-or-passive');
    });

    it('chains causative + passive + negative across three rule applications', () => {
      const candidate = candidateFor('食べさせられない', '食べる', 'v1');
      expect(candidate).toBeDefined();
      expect(candidate?.reasons).toEqual(['causative', 'potential-or-passive', 'negative']);
    });
  });

  describe('kuru (vk), both spellings', () => {
    it('deinflects the kanji-written form (来) to 来る', () => {
      expect(candidateFor('来なかった', '来る', 'vk')?.reasons).toContain('negative-past');
      // 来られない has two equally-valid rule paths to 来る/vk: the direct
      // "potential-or-passive-negative" rule, and "negative" then
      // "potential-or-passive" chained. Which one's reasons survive the
      // dedup is an implementation detail of rule-table order, not something
      // worth pinning down here — only that 来る/vk is found at all.
      expect(candidateFor('来られない', '来る', 'vk')).toBeDefined();
    });

    it('deinflects the kana-only form (こ/き) to くる, not る or any other wrong stem', () => {
      expect(candidateFor('こなかった', 'くる', 'vk')?.reasons).toContain('negative-past');
      expect(candidateFor('きました', 'くる', 'vk')?.reasons).toContain('polite-past');
      expect(candidateFor('こられない', 'くる', 'vk')).toBeDefined();
    });

    it('does not let the kanji branch leak a doubled stem (regression: kanaOut was once "来る" instead of "る")', () => {
      expect(deinflect('来ない').some((c) => c.term === '来来る')).toBe(false);
    });
  });

  describe('suru verbs (vs/vs-i/vs-s)', () => {
    it('deinflects noun+suru compounds for every suru-family tag', () => {
      for (const tag of ['vs', 'vs-i', 'vs-s']) {
        expect(candidateFor('勉強しませんでした', '勉強する', tag)?.reasons).toContain('polite-negative-past');
      }
    });
  });

  describe('i-adjectives', () => {
    it.each([
      ['高くない', '高い', 'negative'],
      ['高くなかった', '高い', 'negative-past'],
      ['高かった', '高い', 'past'],
      ['高くて', '高い', 'te-form'],
      ['高ければ', '高い', 'conditional'],
      ['高く', '高い', 'adverbial'],
      ['高さ', '高い', 'noun-form'],
    ])('%s -> %s via %s', (surface, term, reason) => {
      expect(candidateFor(surface, term, 'adj-i')?.reasons).toContain(reason);
    });
  });

  describe('termination', () => {
    it('does not loop forever or explode on text that matches no rule', () => {
      expect(() => deinflect('ランダムすぎるテキスト')).not.toThrow();
    });

    it('does not loop forever on an empty string', () => {
      expect(deinflect('')).toEqual([{ term: '', tags: ['any'], reasons: [] }]);
    });
  });
});

describe('tagsMatch', () => {
  it('treats the "any" sentinel as matching every real tag', () => {
    expect(tagsMatch(['any'], ['v5m'])).toBe(true);
    expect(tagsMatch(['any'], [])).toBe(true);
  });

  it('otherwise requires at least one shared tag', () => {
    expect(tagsMatch(['v5m'], ['v5m', 'vt'])).toBe(true);
    expect(tagsMatch(['v5m'], ['v1'])).toBe(false);
    expect(tagsMatch(['v5m'], [])).toBe(false);
  });
});
