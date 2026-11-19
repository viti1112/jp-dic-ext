// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LookupPopup } from './lookup-popup.ts';
import type { LookupMatch } from '@/utils/dictionary/lookup.ts';

const MATCH: LookupMatch = {
  matchedText: '読む',
  reasons: ['polite-negative'],
  entries: [
    { id: 1, kanji: ['読む'], readings: ['よむ'], priority: [], senses: [{ pos: ['v5m'], glosses: ['to read'] }] },
  ],
};

const noExamples = async () => ({ ok: false as const, reason: 'unreachable' as const });

function getPopupElement(): HTMLDivElement {
  const host = document.documentElement.querySelectorAll('div').item(document.documentElement.querySelectorAll('div').length - 1);
  return host.shadowRoot!.querySelector('.popup')!;
}

beforeEach(() => {
  document.documentElement.innerHTML = '';
});

describe('LookupPopup', () => {
  it('stays hidden/non-interactive until show()', () => {
    const popup = new LookupPopup(
      () => '+ Anki',
      async () => ({ ok: true }),
      noExamples,
    );
    const container = getPopupElement();
    expect(container.style.display).toBe('none');
    expect(container.style.pointerEvents).not.toBe('auto');
  });

  it('show() renders the headword, reading, and senses', () => {
    const popup = new LookupPopup(
      () => '+ Anki',
      async () => ({ ok: true }),
      noExamples,
    );
    popup.show(MATCH, 10, 20);

    const container = getPopupElement();
    expect(container.style.display).toBe('block');
    expect(container.querySelector('.headword')?.textContent).toBe('読む');
    expect(container.querySelector('.reading')?.textContent).toBe('よむ');
    expect(container.textContent).toContain('to read');
  });

  it('show() is a no-op while pinned, and hide() is too', () => {
    const popup = new LookupPopup(
      () => '+ Anki',
      async () => ({ ok: true }),
      noExamples,
    );
    popup.show(MATCH, 0, 0);
    popup.pin();

    popup.show({ ...MATCH, matchedText: 'other' }, 99, 99);
    const container = getPopupElement();
    expect(container.querySelector('.headword')?.textContent).toBe('読む'); // unchanged

    popup.hide();
    expect(container.style.display).toBe('block'); // still showing, hide() ignored while pinned
  });

  it('unpin() hides the popup and allows show()/hide() again', () => {
    const popup = new LookupPopup(
      () => '+ Anki',
      async () => ({ ok: true }),
      noExamples,
    );
    popup.show(MATCH, 0, 0);
    popup.pin();
    popup.unpin();

    const container = getPopupElement();
    expect(container.style.display).toBe('none');
    expect(popup.isPinned()).toBe(false);

    popup.show(MATCH, 0, 0);
    expect(container.style.display).toBe('block');
  });

  it('clicking the add-card button calls onAdd and reflects success', async () => {
    const onAdd = vi.fn(async () => ({ ok: true }));
    const popup = new LookupPopup(() => '+ Anki', onAdd, noExamples);
    popup.show(MATCH, 0, 0);
    popup.pin();

    const button = getPopupElement().querySelector<HTMLButtonElement>('.add-btn')!;
    expect(button.textContent).toBe('+ Anki');
    button.click();
    await vi.waitFor(() => expect(button.textContent).toBe('✓ Added'));
    expect(onAdd).toHaveBeenCalledWith(MATCH.entries[0]);
  });

  it('clicking the add-card button reflects a failure with the error message as the tooltip', async () => {
    const onAdd = vi.fn(async () => ({ ok: false, message: 'deck not found' }));
    const popup = new LookupPopup(() => '+ SRS', onAdd, noExamples);
    popup.show(MATCH, 0, 0);
    popup.pin();

    const button = getPopupElement().querySelector<HTMLButtonElement>('.add-btn')!;
    button.click();
    await vi.waitFor(() => expect(button.textContent).toBe('✗ Error'));
    expect(button.title).toBe('deck not found');
    expect(button.disabled).toBe(false); // retryable
  });

  it('renders a separate block per matched entry (homographs), each with its own add button', () => {
    const homographMatch: LookupMatch = {
      matchedText: 'はし',
      reasons: [],
      entries: [
        { id: 1, kanji: ['橋'], readings: ['はし'], priority: ['nf05'], senses: [{ pos: ['n'], glosses: ['bridge'] }] },
        { id: 2, kanji: ['箸'], readings: ['はし'], priority: ['nf19'], senses: [{ pos: ['n'], glosses: ['chopsticks'] }] },
      ],
    };
    const popup = new LookupPopup(
      () => '+ Anki',
      async () => ({ ok: true }),
      noExamples,
    );
    popup.show(homographMatch, 0, 0);

    const container = getPopupElement();
    const entries = container.querySelectorAll('.entry');
    expect(entries).toHaveLength(2);
    expect(entries[0]?.querySelector('.headword')?.textContent).toBe('橋');
    expect(entries[1]?.querySelector('.headword')?.textContent).toBe('箸');
    expect(container.querySelectorAll('.add-btn')).toHaveLength(2);
  });

  it('clamps position so the popup never renders off-screen', () => {
    const popup = new LookupPopup(
      () => '+ Anki',
      async () => ({ ok: true }),
      noExamples,
    );
    const container = getPopupElement();
    Object.defineProperty(container, 'offsetWidth', { value: 360, configurable: true });
    Object.defineProperty(container, 'offsetHeight', { value: 150, configurable: true });
    vi.stubGlobal('innerWidth', 800);
    vi.stubGlobal('innerHeight', 600);

    // Near the bottom-right corner - unclamped this would put the popup
    // partly off-screen (x + 360 > 800, y + 20 + 150 > 600).
    popup.show(MATCH, 790, 590);

    expect(parseInt(container.style.left)).toBe(800 - 360);
    expect(parseInt(container.style.top)).toBe(600 - 150);

    vi.unstubAllGlobals();
  });

  it('caps its own height to the viewport and scrolls internally, rather than overflowing off-screen', () => {
    new LookupPopup(
      () => '+ Anki',
      async () => ({ ok: true }),
      noExamples,
    );
    const style = document.documentElement.querySelector('div')!.shadowRoot!.querySelector('style')!.textContent!;
    expect(style).toMatch(/max-height:\s*calc\(100vh/);
    expect(style).toMatch(/overflow-y:\s*auto/);
  });

  it('clicking "Пример" calls onExample and renders the sentences, then removes the button', async () => {
    const onExample = vi.fn(async () => ({ ok: true as const, sentences: ['本を読む。', '新聞を読みます。'] }));
    const popup = new LookupPopup(
      () => '+ Anki',
      async () => ({ ok: true }),
      onExample,
    );
    popup.show(MATCH, 0, 0);
    popup.pin();

    const container = getPopupElement();
    const button = container.querySelector<HTMLButtonElement>('.example-btn')!;
    button.click();
    await vi.waitFor(() => expect(container.querySelector('.examples')?.textContent).toContain('本を読む。'));
    expect(onExample).toHaveBeenCalledWith(MATCH.entries[0]);
    expect(container.querySelector('.example-btn')).toBeNull(); // asked once, no point asking again
  });

  it('clicking "Пример" with no API key configured shows a helpful message and becomes retryable after a cooldown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onExample = vi.fn(async () => ({ ok: false as const, reason: 'no-api-key' as const }));
    const popup = new LookupPopup(
      () => '+ Anki',
      async () => ({ ok: true }),
      onExample,
    );
    popup.show(MATCH, 0, 0);
    popup.pin();

    const container = getPopupElement();
    const button = container.querySelector<HTMLButtonElement>('.example-btn')!;
    button.click();
    await vi.waitFor(() => expect(container.querySelector('.examples')?.textContent).toContain('настройках'));
    expect(button.disabled).toBe(true); // not immediately retryable - avoids spamming the API on repeat failures

    await vi.advanceTimersByTimeAsync(3000);
    expect(button.disabled).toBe(false); // retryable once the cooldown passes

    vi.useRealTimers();
  });

  it('speaking a word calls speechSynthesis with the reading, not the kanji', () => {
    const spoken: { text: string; lang: string }[] = [];
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      speak: vi.fn((u: { text: string; lang: string }) => spoken.push({ text: u.text, lang: u.lang })),
    });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        text: string;
        lang = '';
        constructor(text: string) {
          this.text = text;
        }
      },
    );

    const popup = new LookupPopup(
      () => '+ Anki',
      async () => ({ ok: true }),
      noExamples,
    );
    popup.show(MATCH, 0, 0);
    popup.pin();

    getPopupElement().querySelector<HTMLButtonElement>('.speak-btn')!.click();
    expect(spoken).toEqual([{ text: 'よむ', lang: 'ja-JP' }]);

    vi.unstubAllGlobals();
  });
});
