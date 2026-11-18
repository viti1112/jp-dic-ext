import './style.css';
import { pingAnkiConnect } from '@/utils/anki.ts';
import { getAnkiLog } from '@/utils/anki-log.ts';
import { requestDictionaryCount } from '@/utils/messaging.ts';
import type { ActivationMode } from '@/utils/settings.ts';
import { getSettings, updateSettings } from '@/utils/settings.ts';

const ACTIVATION_LABELS: Record<ActivationMode, string> = {
  shift: 'Shift',
  alt: 'Alt',
  always: 'Всегда',
};

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="panel">
    <header class="panel-header">
      <span class="brand-icon">字</span>
      <div class="brand-text">
        <span class="brand-name">KanjiFlow</span>
        <span class="brand-sub">Contextual Japanese Inspector</span>
      </div>
    </header>

    <section class="section">
      <h2 class="section-label">Активация поиска</h2>
      <div class="segmented" id="activation-segmented">
        ${(Object.keys(ACTIVATION_LABELS) as ActivationMode[])
          .map((mode) => `<button type="button" data-mode="${mode}">${ACTIVATION_LABELS[mode]}</button>`)
          .join('')}
      </div>
    </section>

    <section class="section">
      <h2 class="section-label">AnkiConnect</h2>
      <div class="status-row">
        <span class="status-dot" id="anki-status-dot"></span>
        <span id="anki-status-text">проверка…</span>
      </div>
      <label class="field-label" for="deck-input">Колода</label>
      <input id="deck-input" type="text" />
      <p class="meta-line">127.0.0.1:8765 · модель Basic</p>
    </section>

    <section class="section">
      <h2 class="section-label">Словарь</h2>
      <div class="stat-row">
        <span>JMdict · IndexedDB</span>
        <span class="count" id="dict-count">…</span>
      </div>
    </section>

    <section class="section">
      <h2 class="section-label">Добавлено в Anki</h2>
      <ul class="anki-log" id="anki-log"></ul>
    </section>
  </div>
`;

const segmented = document.querySelector<HTMLDivElement>('#activation-segmented')!;
const deckInput = document.querySelector<HTMLInputElement>('#deck-input')!;
const ankiStatusDot = document.querySelector<HTMLSpanElement>('#anki-status-dot')!;
const ankiStatusText = document.querySelector<HTMLSpanElement>('#anki-status-text')!;
const dictCount = document.querySelector<HTMLSpanElement>('#dict-count')!;
const ankiLogList = document.querySelector<HTMLUListElement>('#anki-log')!;

function setActiveSegment(mode: ActivationMode) {
  for (const button of segmented.querySelectorAll<HTMLButtonElement>('button')) {
    button.classList.toggle('active', button.dataset.mode === mode);
  }
}

segmented.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-mode]');
  if (!button) return;
  const mode = button.dataset.mode as ActivationMode;
  setActiveSegment(mode);
  void updateSettings({ activationMode: mode });
});

// The source of truth for "what's currently saved" - deliberately not
// `deckInput.defaultValue`, which never changes after the input's initial
// value and would make a later empty-input revert fall back to the
// original load-time deck name instead of the most recently saved one.
let currentDeckName = '';

deckInput.addEventListener('change', () => {
  const next = deckInput.value.trim();
  if (!next) {
    deckInput.value = currentDeckName; // reject an empty deck name, don't persist it
    return;
  }
  currentDeckName = next;
  void updateSettings({ deckName: next });
});

function renderAnkiLog(entries: { term: string; addedAt: number }[]) {
  if (entries.length === 0) {
    ankiLogList.innerHTML = `<li class="empty">Пока пусто — нажмите «+ Anki» на карточке слова.</li>`;
    return;
  }
  ankiLogList.replaceChildren(
    ...entries.map((entry) => {
      const li = document.createElement('li');
      const term = document.createElement('span');
      term.textContent = entry.term;
      const when = document.createElement('span');
      when.className = 'when';
      when.textContent = formatRelativeTime(entry.addedAt);
      li.append(term, when);
      return li;
    }),
  );
}

function formatRelativeTime(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин. назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч. назад`;
  return `${Math.round(hours / 24)} дн. назад`;
}

async function init() {
  const settings = await getSettings();
  setActiveSegment(settings.activationMode);
  currentDeckName = settings.deckName;
  deckInput.value = settings.deckName;

  void pingAnkiConnect().then((connected) => {
    ankiStatusDot.classList.add(connected ? 'connected' : 'disconnected');
    ankiStatusText.textContent = connected ? 'подключено' : 'не отвечает';
  });

  void getAnkiLog().then(renderAnkiLog);

  void requestDictionaryCount().then((count) => {
    dictCount.textContent = count === null ? 'недоступно' : `${count.toLocaleString('ru-RU')} записей`;
  });
}

void init();
