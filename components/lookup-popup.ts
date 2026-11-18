import type { AddToAnkiResult } from '@/utils/anki.ts';
import type { DictionaryEntry } from '@/utils/dictionary/types.ts';
import type { LookupMatch } from '@/utils/dictionary/lookup.ts';

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
`;

type AddToAnkiHandler = (entry: DictionaryEntry) => Promise<AddToAnkiResult>;

/**
 * A single Shadow-DOM-isolated popup element, created once per content
 * script injection and reused for every lookup (shown/hidden/repositioned)
 * rather than recreated per hover - so host-page CSS can never bleed in
 * regardless of how aggressively the page resets styles.
 *
 * Starts non-interactive (`pointer-events: none`) so it never blocks normal
 * page clicks while just passively following the cursor; `pin()` switches it
 * to interactive so its "+Anki" buttons become clickable, and freezes it in
 * place (ignoring further `show()`/`hide()` calls) until `unpin()`.
 */
export class LookupPopup {
  private readonly container: HTMLDivElement;
  private readonly onAddToAnki: AddToAnkiHandler;
  private pinned = false;

  constructor(onAddToAnki: AddToAnkiHandler) {
    this.onAddToAnki = onAddToAnki;
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
    this.container.replaceChildren(...renderMatch(match, this.onAddToAnki));
    this.container.style.left = `${x}px`;
    this.container.style.top = `${y + 20}px`;
    this.container.style.display = 'block';
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

// Kept in sync deliberately: a "show fewer entries" change should revisit both.
const MAX_ENTRIES = 3;
const MAX_SENSES_PER_ENTRY = 2;

/**
 * Each matching entry (there can be more than one for a homograph, e.g.
 * 橋/箸/端 all read はし) gets its own block with its own headword+reading
 * and "+Anki" button, so its senses are never mistaken for belonging to a
 * different entry.
 */
function renderMatch(match: LookupMatch, onAddToAnki: AddToAnkiHandler): Node[] {
  return match.entries.slice(0, MAX_ENTRIES).map((entry) => renderEntry(entry, match.matchedText, onAddToAnki));
}

function renderEntry(entry: DictionaryEntry, matchedText: string, onAddToAnki: AddToAnkiHandler): HTMLDivElement {
  const entryEl = document.createElement('div');
  entryEl.className = 'entry';

  const kanji = entry.kanji[0];
  const reading = entry.readings[0];

  const headword = document.createElement('span');
  headword.className = 'headword';
  headword.textContent = kanji ?? reading ?? matchedText;
  entryEl.append(headword);

  // Only show the reading separately when there's a kanji headword to
  // disambiguate - for a kana-only entry the headword already is the reading.
  if (kanji && reading) {
    const readingEl = document.createElement('span');
    readingEl.className = 'reading';
    readingEl.textContent = reading;
    entryEl.append(readingEl);
  }

  entryEl.append(renderAddButton(entry, onAddToAnki));

  for (const sense of entry.senses.slice(0, MAX_SENSES_PER_ENTRY)) {
    const senseEl = document.createElement('div');
    senseEl.className = 'sense';

    const pos = document.createElement('span');
    pos.className = 'pos';
    pos.textContent = sense.pos.join(',');

    senseEl.append(pos, document.createTextNode(sense.glosses.join('; ')));
    entryEl.append(senseEl);
  }

  return entryEl;
}

function renderAddButton(entry: DictionaryEntry, onAddToAnki: AddToAnkiHandler): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'add-btn';
  button.textContent = '+ Anki';

  button.addEventListener('click', (event) => {
    // Stop this from reaching the content script's document-level click
    // listener - that listener's job is pinning an unpinned popup, and this
    // button is only clickable once already pinned.
    event.stopPropagation();
    if (button.disabled) return;

    setButtonState(button, { text: '...', disabled: true });
    onAddToAnki(entry)
      .then((result) => {
        if (result.ok) {
          setButtonState(button, { text: '✓ Added', disabled: true });
        } else if (result.reason === 'unreachable') {
          setButtonState(button, {
            text: '✗ Anki?',
            disabled: false,
            title:
              'Could not reach AnkiConnect — is Anki running with the AnkiConnect add-on installed, and is this extension allowed in its webCorsOriginList?',
          });
        } else {
          setButtonState(button, { text: '✗ Error', disabled: false, title: result.message });
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
