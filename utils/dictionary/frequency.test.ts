import { describe, expect, it } from 'vitest';
import { frequencyScore, sortByFrequency } from './frequency.ts';

describe('frequencyScore', () => {
  it('ranks lower nf-buckets (more common) above higher ones', () => {
    expect(frequencyScore(['nf05'])).toBeGreaterThan(frequencyScore(['nf19']));
  });

  it('ranks any nf-tag above a bare ichi1/spec1/gai1 with no nf data', () => {
    expect(frequencyScore(['nf48'])).toBeGreaterThan(frequencyScore(['ichi1']));
  });

  it('ranks a *1 tag above a *2 tag', () => {
    expect(frequencyScore(['ichi1'])).toBeGreaterThan(frequencyScore(['ichi2']));
  });

  it('ranks any priority tag above none at all', () => {
    expect(frequencyScore(['news2'])).toBeGreaterThan(frequencyScore([]));
  });

  it('returns 0 for no priority data', () => {
    expect(frequencyScore([])).toBe(0);
  });
});

describe('sortByFrequency', () => {
  it('orders the real はし homographs the way JMdict marks them (橋/端 common, 箸 less so, unmarked words last)', () => {
    const entries = [
      { id: 1, priority: ['ichi1'] }, // 嘴 (beak) — no nf data
      { id: 2, priority: [] }, // 階 (stairs)
      { id: 3, priority: ['ichi1', 'news1', 'nf19'] }, // 箸 (chopsticks)
      { id: 4, priority: ['ichi1', 'news1', 'nf05'] }, // 橋 (bridge)
    ];
    const order = sortByFrequency(entries).map((e) => e.id);
    expect(order).toEqual([4, 3, 1, 2]);
  });

  it('does not mutate the input array', () => {
    const entries = [{ id: 1, priority: [] }, { id: 2, priority: ['ichi1'] }];
    const original = [...entries];
    sortByFrequency(entries);
    expect(entries).toEqual(original);
  });
});
