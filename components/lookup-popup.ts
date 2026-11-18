import type { LookupMatch } from '@/utils/dictionary/lookup.ts';

const POPUP_STYLES = `
  :host { all: initial; }
  .popup {
    position: fixed;
    z-index: 2147483647;
    max-width: 320px;
    background: #1e1e1e;
    color: #f0f0f0;
    border-radius: 6px;
    padding: 8px 10px;
    font: 14px / 1.4 -apple-system, system-ui, sans-serif;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
    pointer-events: none;
  }
  .headword { font-size: 16px; font-weight: 600; }
  .reading { color: #9ad1ff; margin-left: 6px; font-size: 13px; }
  .sense { margin-top: 4px; font-size: 13px; }
  .pos { color: #8ecb8e; font-size: 11px; margin-right: 4px; }
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

function renderMatch(match: LookupMatch): Node[] {
  const nodes: Node[] = [];
  const firstEntry = match.entries[0];

  const headword = document.createElement('span');
  headword.className = 'headword';
  headword.textContent = firstEntry?.kanji[0] ?? match.matchedText;
  nodes.push(headword);

  if (firstEntry?.readings[0]) {
    const reading = document.createElement('span');
    reading.className = 'reading';
    reading.textContent = firstEntry.readings[0];
    nodes.push(reading);
  }

  for (const entry of match.entries.slice(0, MAX_ENTRIES)) {
    for (const sense of entry.senses.slice(0, MAX_SENSES_PER_ENTRY)) {
      const senseEl = document.createElement('div');
      senseEl.className = 'sense';

      const pos = document.createElement('span');
      pos.className = 'pos';
      pos.textContent = sense.pos.join(',');

      senseEl.append(pos, document.createTextNode(sense.glosses.join('; ')));
      nodes.push(senseEl);
    }
  }

  return nodes;
}
