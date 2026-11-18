export interface TextRun {
  text: string;
  cursorIndex: number;
}

/** True if `node` sits inside a `<rt>` (furigana) element — we never want to pop up a lookup over ruby annotation text. */
export function isInsideRubyText(node: Node): boolean {
  let el: Element | null = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  while (el) {
    if (el.tagName === 'RT') return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * Extracts the text run to look up from the text node at `offset` within it
 * (as returned by `document.caretRangeFromPoint`), or `null` if there's
 * nothing lookup-worthy there — not a text node, inside furigana, or an
 * out-of-range offset.
 */
export function extractTextRun(node: Node, offset: number): TextRun | null {
  if (node.nodeType !== Node.TEXT_NODE) return null;
  if (isInsideRubyText(node)) return null;

  const text = node.textContent ?? '';
  if (offset < 0 || offset > text.length) return null;

  return { text, cursorIndex: offset };
}

const INTERACTIVE_SELECTOR = 'a, button, input, textarea, select, [contenteditable], [role="button"], [role="link"]';

/**
 * True if `target` is, or sits inside, a native-interactive element. Used to
 * make sure "click a matched word to pin the dictionary popup" never
 * hijacks a click that was actually meant for a link, button, or form field
 * the matched Japanese text happens to be inside of.
 */
export function isInteractiveElement(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(INTERACTIVE_SELECTOR) !== null;
}
