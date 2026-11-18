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
  .entry { margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); }
  .entry:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: none; }
  .headword { font-size: 18px; font-weight: 600; }
  .reading { color: #9ad1ff; margin-left: 8px; font-size: 14px; }
  .sense { margin-top: 5px; font-size: 14px; }
  .pos { color: #8ecb8e; font-size: 11px; margin-right: 6px; }
`;

/**
 * A single Shadow-DOM-isolated popup element, created once per content
 * script injection and reused for every lookup (shown/hidden/repositioned)
 * rather than recreated per hover - so host-page CSS can never bleed in
 * regardless of how aggressively the page resets styles.
 */
export class LookupPopup {
  private readonly container: HTMLDivElement;

  constructor() {
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

  show(match: LookupMatch, x: number, y: number): void {
    this.container.replaceChildren(...renderMatch(match));
    this.container.style.left = `${x}px`;
    this.container.style.top = `${y + 20}px`;
    this.container.style.display = 'block';
  }

  hide(): void {
    this.container.style.display = 'none';
  }
}

// Kept in sync deliberately: a "show fewer entries" change should revisit both.
const MAX_ENTRIES = 3;
const MAX_SENSES_PER_ENTRY = 2;

/**
 * Each matching entry (there can be more than one for a homograph, e.g.
 * 橋/箸/端 all read はし) gets its own block with its own headword+reading,
 * so its senses are never mistaken for belonging to a different entry.
 */
function renderMatch(match: LookupMatch): Node[] {
  return match.entries.slice(0, MAX_ENTRIES).map((entry) => renderEntry(entry, match.matchedText));
}

function renderEntry(entry: LookupMatch['entries'][number], matchedText: string): HTMLDivElement {
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
