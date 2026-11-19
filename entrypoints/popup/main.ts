import './style.css';
import { pingAnkiConnect } from '@/utils/anki.ts';
import { getAnkiLog } from '@/utils/anki-log.ts';
import { requestDictionaryCount, requestDueSrsCount } from '@/utils/messaging.ts';
import type { ReviewBackend } from '@/utils/settings.ts';
import { getSettings, onSettingsChanged } from '@/utils/settings.ts';
import { browser } from 'wxt/browser';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="panel">
    <header class="panel-header">
      <span class="brand-icon">字</span>
      <div class="brand-text">
        <span class="brand-name">KanjiFlow</span>
        <span class="brand-sub">Contextual Japanese Inspector</span>
      </div>
      <button type="button" class="icon-btn" id="open-options" title="Настройки">⚙</button>
    </header>

    <section class="section" id="anki-section">
      <h2 class="section-label">AnkiConnect</h2>
      <div class="status-row">
        <span class="status-dot" id="anki-status-dot"></span>
        <span id="anki-status-text">проверка…</span>
      </div>
      <p class="meta-line">127.0.0.1:8765 · модель Basic</p>
    </section>

    <section class="section" id="srs-section">
      <h2 class="section-label">Повторение</h2>
      <div class="stat-row">
        <span>К повторению сейчас</span>
        <span class="count" id="srs-due-count">…</span>
      </div>
      <button type="button" class="reveal-btn" id="start-review">Начать повторение</button>
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

const ankiSection = document.querySelector<HTMLDivElement>('#anki-section')!;
const srsSection = document.querySelector<HTMLDivElement>('#srs-section')!;
const ankiStatusDot = document.querySelector<HTMLSpanElement>('#anki-status-dot')!;
const ankiStatusText = document.querySelector<HTMLSpanElement>('#anki-status-text')!;
const dictCount = document.querySelector<HTMLSpanElement>('#dict-count')!;
const srsDueCount = document.querySelector<HTMLSpanElement>('#srs-due-count')!;
const ankiLogList = document.querySelector<HTMLUListElement>('#anki-log')!;
const startReviewButton = document.querySelector<HTMLButtonElement>('#start-review')!;
const openOptionsButton = document.querySelector<HTMLButtonElement>('#open-options')!;

function setVisibleSection(backend: ReviewBackend) {
  ankiSection.style.display = backend === 'anki' ? '' : 'none';
  srsSection.style.display = backend === 'srs' ? '' : 'none';
}

startReviewButton.addEventListener('click', () => {
  void browser.tabs.create({ url: browser.runtime.getURL('/review.html') });
});

openOptionsButton.addEventListener('click', () => {
  void browser.runtime.openOptionsPage();
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
  setVisibleSection(settings.reviewBackend);
  onSettingsChanged((next) => setVisibleSection(next.reviewBackend));

  void pingAnkiConnect().then((connected) => {
    ankiStatusDot.classList.add(connected ? 'connected' : 'disconnected');
    ankiStatusText.textContent = connected ? 'подключено' : 'не отвечает';
  });

  void getAnkiLog().then(renderAnkiLog);

  void requestDictionaryCount().then((count) => {
    dictCount.textContent = count === null ? 'недоступно' : `${count.toLocaleString('ru-RU')} записей`;
  });

  void requestDueSrsCount().then((count) => {
    srsDueCount.textContent = `${count.toLocaleString('ru-RU')}`;
  });
}

void init();
