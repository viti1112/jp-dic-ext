import type { GenerateExamplesResult } from '@/utils/claude.ts';
import { entryDisplayFields } from '@/utils/dictionary/display.ts';
import type { DictionaryEntry } from '@/utils/dictionary/types.ts';
import { MAX_MATCHED_ENTRIES } from '@/utils/dictionary/lookup.ts';
import type { LookupMatch } from '@/utils/dictionary/lookup.ts';
import { speakJapanese } from '@/utils/tts.ts';

const POPUP_STYLES = `
  :host { all: initial; }
  .popup {
    position: fixed;
    z-index: 2147483647;
    max-width: 360px;
    background: #1e1e1e;
    color: #f0f0f0;
    border-radius: 6px;
    padding: 10px 12px;
    font: 14px / 1.5 -apple-system, system-ui, sans-serif;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
    pointer-events: none;
  }
  .entry { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); }
  .entry:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: none; }
  .headword { font-size: 18px; font-weight: 600; }
  .reading { color: #9ad1ff; margin-left: 6px; font-size: 14px; }
  .sense { flex: 1 0 100%; margin-top: 5px; font-size: 14px; }
  .pos { color: #8ecb8e; font-size: 11px; margin-right: 6px; }
  .add-btn {
    margin-left: auto;
    pointer-events: auto;
    cursor: pointer;
    background: #b68235;
    color: #1e1e1e;
    border: none;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
  }
  .add-btn:disabled { opacity: 0.6; cursor: default; }
  .speak-btn {
    pointer-events: auto;
    cursor: pointer;
    background: none;
    border: none;
    color: #9ad1ff;
    font-size: 13px;
    padding: 0 4px;
    line-height: 1;
  }
  .example-btn {
    pointer-events: auto;
    cursor: pointer;
    background: none;
    border: 1px solid rgba(255, 255, 255, 0.25);
    color: #cfcfcf;
    border-radius: 4px;
    font-size: 10px;
    padding: 2px 6px;
    margin-left: 4px;
  }
  .example-btn:disabled { opacity: 0.6; cursor: default; }
  .examples { flex: 1 0 100%; margin-top: 6px; font-size: 13px; color: #cfcfcf; font-style: italic; }
  .examples:empty { display: none; }
`;

/**
 * Backend-agnostic outcome of "add this entry to whatever review system is
 * active" (Anki or the mini-SRS) - the popup only needs to know whether it
 * worked and, if not, what to show as the error tooltip. Each backend maps
 * its own richer result/error type down to this shape in entrypoints/content.ts.
 */
export interface AddCardOutcome {
  ok: boolean;
  message?: string;
}

type AddCardHandler = (entry: DictionaryEntry) => Promise<AddCardOutcome>;
type GenerateExamplesHandler = (entry: DictionaryEntry) => Promise<GenerateExamplesResult>;

/**
 * A single Shadow-DOM-isolated popup element, created once per content
 * script injection and reused for every lookup (shown/hidden/repositioned)
 * rather than recreated per hover - so host-page CSS can never bleed in
 * regardless of how aggressively the page resets styles.
 *
 * Starts non-interactive (`pointer-events: none`) so it never blocks normal
 * page clicks while just passively following the cursor; `pin()` switches it
 * to interactive so its per-entry add-card button becomes clickable, and
 * freezes it in place (ignoring further `show()`/`hide()` calls) until `unpin()`.
 */
export class LookupPopup {
  private readonly container: HTMLDivElement;
  private readonly getButtonLabel: () => string;
  private readonly onAdd: AddCardHandler;
  private readonly onExample: GenerateExamplesHandler;
  private pinned = false;

  constructor(getButtonLabel: () => string, onAdd: AddCardHandler, onExample: GenerateExamplesHandler) {
    this.getButtonLabel = getButtonLabel;
    this.onAdd = onAdd;
    this.onExample = onExample;
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = POPUP_STYLES;

    this.container = document.createElement('div');
    this.container.className = 'popup';
    this.container.style.display = 'none';

    shadow.append(style, this.container);
    document.documentElement.append(host);
  }

  isPinned(): boolean {
    return this.pinned;
  }

  show(match: LookupMatch, x: number, y: number): void {
    if (this.pinned) return;
    this.container.replaceChildren(...renderMatch(match, this.getButtonLabel, this.onAdd, this.onExample));
    // Render off-screen first to measure the popup's actual size (depends on
    // how much text this particular match has) before clamping x/y to the
    // viewport - otherwise a popup near the right or bottom edge would
    // render partly or fully off-screen, unreachable to click.
    this.container.style.left = '0px';
    this.container.style.top = '0px';
    this.container.style.display = 'block';
    const { offsetWidth, offsetHeight } = this.container;
    const clampedX = Math.max(0, Math.min(x, window.innerWidth - offsetWidth));
    const clampedY = Math.max(0, Math.min(y + 20, window.innerHeight - offsetHeight));
    this.container.style.left = `${clampedX}px`;
    this.container.style.top = `${clampedY}px`;
  }

  hide(): void {
    if (this.pinned) return;
    this.container.style.display = 'none';
  }

  pin(): void {
    this.pinned = true;
    this.container.style.pointerEvents = 'auto';
  }

  unpin(): void {
    this.pinned = false;
    this.container.style.pointerEvents = 'none';
    this.container.style.display = 'none';
  }
}

const MAX_SENSES_PER_ENTRY = 2;

/**
 * Each matching entry (there can be more than one for a homograph, e.g.
 * 橋/箸/端 all read はし) gets its own block with its own headword+reading
 * and add-card button, so its senses are never mistaken for belonging to a
 * different entry.
 */
function renderMatch(
  match: LookupMatch,
  getButtonLabel: () => string,
  onAdd: AddCardHandler,
  onExample: GenerateExamplesHandler,
): Node[] {
  return match.entries
    .slice(0, MAX_MATCHED_ENTRIES)
    .map((entry) => renderEntry(entry, match.matchedText, getButtonLabel, onAdd, onExample));
}

function renderEntry(
  entry: DictionaryEntry,
  matchedText: string,
  getButtonLabel: () => string,
  onAdd: AddCardHandler,
  onExample: GenerateExamplesHandler,
): HTMLDivElement {
  const entryEl = document.createElement('div');
  entryEl.className = 'entry';

  const { headword: entryHeadword, reading, showReading } = entryDisplayFields(entry);

  const headword = document.createElement('span');
  headword.className = 'headword';
  headword.textContent = entryHeadword || matchedText;
  entryEl.append(headword);

  if (showReading) {
    const readingEl = document.createElement('span');
    readingEl.className = 'reading';
    readingEl.textContent = reading;
    entryEl.append(readingEl);
  }

  // Speak the kana reading, not the kanji headword - a kanji can have
  // several readings, so the reading is the one unambiguous source of
  // pronunciation here (entryDisplayFields falls back to the headword
  // itself only for the rare entry with no reading at all).
  entryEl.append(renderSpeakButton(reading || entryHeadword));

  const examplesEl = document.createElement('div');
  examplesEl.className = 'examples';
  entryEl.append(renderExampleButton(entry, onExample, examplesEl));

  entryEl.append(renderAddButton(entry, getButtonLabel, onAdd));

  for (const sense of entry.senses.slice(0, MAX_SENSES_PER_ENTRY)) {
    const senseEl = document.createElement('div');
    senseEl.className = 'sense';

    const pos = document.createElement('span');
    pos.className = 'pos';
    pos.textContent = sense.pos.join(',');

    senseEl.append(pos, document.createTextNode(sense.glosses.join('; ')));
    entryEl.append(senseEl);
  }

  entryEl.append(examplesEl);

  return entryEl;
}

function renderSpeakButton(text: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'speak-btn';
  button.title = 'Озвучить';
  button.textContent = '\u{1F50A}'; // 🔊

  button.addEventListener('click', (event) => {
    event.stopPropagation(); // same reason as the add-card button: don't let this double as a pin-click
    speakJapanese(text);
  });

  return button;
}

function renderExampleButton(entry: DictionaryEntry, onExample: GenerateExamplesHandler, examplesEl: HTMLDivElement): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'example-btn';
  button.textContent = 'Пример';

  button.addEventListener('click', (event) => {
    event.stopPropagation(); // same reason as the other buttons: don't let this double as a pin-click
    if (button.disabled) return;

    button.disabled = true;
    button.textContent = '…';
    onExample(entry)
      .then((result) => {
        if (result.ok) {
          examplesEl.textContent = result.sentences.join(' / ');
          button.remove(); // no point asking Claude twice for the same entry
        } else {
          button.disabled = false;
          button.textContent = 'Пример';
          examplesEl.textContent =
            result.reason === 'no-api-key'
              ? 'Добавьте ключ Anthropic API в настройках расширения.'
              : result.reason === 'unreachable'
                ? 'Не удалось связаться с Claude API.'
                : result.message;
        }
      })
      .catch(() => {
        button.disabled = false;
        button.textContent = 'Пример';
        examplesEl.textContent = 'Не удалось связаться с фоновым процессом расширения.';
      });
  });

  return button;
}

function renderAddButton(entry: DictionaryEntry, getButtonLabel: () => string, onAdd: AddCardHandler): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'add-btn';
  button.textContent = getButtonLabel();

  button.addEventListener('click', (event) => {
    // Stop this from reaching the content script's document-level click
    // listener - that listener's job is pinning an unpinned popup, and this
    // button is only clickable once already pinned.
    event.stopPropagation();
    if (button.disabled) return;

    setButtonState(button, { text: '...', disabled: true });
    onAdd(entry)
      .then((result) => {
        if (result.ok) {
          setButtonState(button, { text: '✓ Added', disabled: true });
        } else {
          setButtonState(button, { text: '✗ Error', disabled: false, title: result.message ?? 'Unknown error.' });
        }
      })
      .catch(() => {
        // The message itself failed to round-trip (e.g. the extension was
        // reloaded/updated mid-click) - leave the button retryable rather
        // than stuck on "..." forever with no way to tell what happened.
        setButtonState(button, { text: '✗ Error', disabled: false, title: 'Could not reach the extension background.' });
      });
  });

  return button;
}

function setButtonState(button: HTMLButtonElement, state: { text: string; disabled: boolean; title?: string }): void {
  button.textContent = state.text;
  button.disabled = state.disabled;
  button.title = state.title ?? '';
}
