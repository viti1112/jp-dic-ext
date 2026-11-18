// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { extractTextRun, isInsideRubyText, isInteractiveElement } from './text-run.ts';

describe('isInsideRubyText', () => {
  it('is false for a plain text node', () => {
    document.body.innerHTML = '<p>読む</p>';
    const textNode = document.querySelector('p')!.firstChild!;
    expect(isInsideRubyText(textNode)).toBe(false);
  });

  it('is true for text inside <rt> (furigana)', () => {
    document.body.innerHTML = '<ruby>読<rt>よ</rt></ruby>';
    const rtTextNode = document.querySelector('rt')!.firstChild!;
    expect(isInsideRubyText(rtTextNode)).toBe(true);
  });

  it('is false for the ruby base text itself, only its <rt> child is excluded', () => {
    document.body.innerHTML = '<ruby>読<rt>よ</rt></ruby>';
    const baseTextNode = document.querySelector('ruby')!.firstChild!;
    expect(isInsideRubyText(baseTextNode)).toBe(false);
  });
});

describe('extractTextRun', () => {
  it('extracts the full text node and the given offset', () => {
    document.body.innerHTML = '<p>読みません</p>';
    const textNode = document.querySelector('p')!.firstChild!;
    expect(extractTextRun(textNode, 2)).toEqual({ text: '読みません', cursorIndex: 2 });
  });

  it('returns null for a non-text node (e.g. an element)', () => {
    document.body.innerHTML = '<p>読む</p>';
    expect(extractTextRun(document.querySelector('p')!, 0)).toBeNull();
  });

  it('returns null inside furigana', () => {
    document.body.innerHTML = '<ruby>読<rt>よ</rt></ruby>';
    const rtTextNode = document.querySelector('rt')!.firstChild!;
    expect(extractTextRun(rtTextNode, 0)).toBeNull();
  });

  it('returns null for an out-of-range offset', () => {
    document.body.innerHTML = '<p>読む</p>';
    const textNode = document.querySelector('p')!.firstChild!;
    expect(extractTextRun(textNode, 99)).toBeNull();
    expect(extractTextRun(textNode, -1)).toBeNull();
  });
});

describe('isInteractiveElement', () => {
  it('is false for plain text', () => {
    document.body.innerHTML = '<p id="t">読む</p>';
    expect(isInteractiveElement(document.getElementById('t'))).toBe(false);
  });

  it.each(['a', 'button', 'input', 'textarea', 'select'])('is true for a %s element', (tag) => {
    document.body.innerHTML = `<${tag} id="t"></${tag}>`;
    expect(isInteractiveElement(document.getElementById('t'))).toBe(true);
  });

  it('is true for text nested inside a link, not just the link itself', () => {
    document.body.innerHTML = '<a href="#"><span id="t">読む</span></a>';
    expect(isInteractiveElement(document.getElementById('t'))).toBe(true);
  });

  it('is true for [role="button"] and [contenteditable]', () => {
    document.body.innerHTML = '<div id="a" role="button"></div><div id="b" contenteditable="true"></div>';
    expect(isInteractiveElement(document.getElementById('a'))).toBe(true);
    expect(isInteractiveElement(document.getElementById('b'))).toBe(true);
  });

  it('is false for a non-Element target (e.g. a text node)', () => {
    document.body.innerHTML = '<p>読む</p>';
    expect(isInteractiveElement(document.querySelector('p')!.firstChild)).toBe(false);
  });

  it('is false for null', () => {
    expect(isInteractiveElement(null)).toBe(false);
  });
});
