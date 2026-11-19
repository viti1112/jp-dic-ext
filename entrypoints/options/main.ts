import './style.css';
import { getClaudeApiKey, setClaudeApiKey } from '@/utils/claude-settings.ts';
import type { ActivationMode, ReviewBackend } from '@/utils/settings.ts';
import { getSettings, updateSettings } from '@/utils/settings.ts';

const ACTIVATION_LABELS: Record<ActivationMode, string> = {
  shift: 'Shift',
  alt: 'Alt',
  always: 'Всегда',
};

const REVIEW_BACKEND_LABELS: Record<ReviewBackend, string> = {
  anki: 'Anki',
  srs: 'Мини-SRS',
};

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="page">
    <header class="page-header">
      <span class="brand-icon">字</span>
      <div class="brand-text">
        <span class="brand-name">KanjiFlow</span>
        <span class="brand-sub">Настройки</span>
      </div>
    </header>

    <section class="section">
      <h2 class="section-label">Активация поиска</h2>
      <div class="segmented" id="activation-segmented">
        ${(Object.keys(ACTIVATION_LABELS) as ActivationMode[])
          .map((mode) => `<button type="button" data-mode="${mode}">${ACTIVATION_LABELS[mode]}</button>`)
          .join('')}
      </div>
      <p class="section-help">Какую клавишу нужно удерживать при наведении, чтобы сработал поиск.</p>
    </section>

    <section class="section">
      <h2 class="section-label">Карточки</h2>
      <div class="segmented" id="backend-segmented">
        ${(Object.keys(REVIEW_BACKEND_LABELS) as ReviewBackend[])
          .map((backend) => `<button type="button" data-backend="${backend}">${REVIEW_BACKEND_LABELS[backend]}</button>`)
          .join('')}
      </div>
      <label class="field-label" for="deck-input">Колода Anki</label>
      <input id="deck-input" type="text" />
      <p class="section-help">Используется только в режиме Anki; модель — стандартная «Basic», AnkiConnect на 127.0.0.1:8765.</p>
    </section>

    <section class="section">
      <h2 class="section-label">Примеры предложений (Claude API)</h2>
      <label class="field-label" for="claude-key-input">API-ключ Anthropic</label>
      <div class="field-row">
        <input id="claude-key-input" type="password" placeholder="sk-ant-…" autocomplete="off" />
        <button type="button" class="icon-btn" id="toggle-key-visibility">Показать</button>
      </div>
      <p class="section-help">Опционально. Хранится только на этом устройстве (chrome.storage.local, не синхронизируется с другими устройствами) и используется исключительно для запросов к api.anthropic.com из кнопки «Пример» на карточке слова.</p>
      <p class="save-hint" id="claude-key-hint"></p>
    </section>
  </div>
`;

const segmented = document.querySelector<HTMLDivElement>('#activation-segmented')!;
const backendSegmented = document.querySelector<HTMLDivElement>('#backend-segmented')!;
const deckInput = document.querySelector<HTMLInputElement>('#deck-input')!;
const claudeKeyInput = document.querySelector<HTMLInputElement>('#claude-key-input')!;
const toggleKeyVisibility = document.querySelector<HTMLButtonElement>('#toggle-key-visibility')!;
const claudeKeyHint = document.querySelector<HTMLParagraphElement>('#claude-key-hint')!;

function setActiveSegment(mode: ActivationMode) {
  for (const button of segmented.querySelectorAll<HTMLButtonElement>('button')) {
    button.classList.toggle('active', button.dataset.mode === mode);
  }
}

function setActiveBackend(backend: ReviewBackend) {
  for (const button of backendSegmented.querySelectorAll<HTMLButtonElement>('button')) {
    button.classList.toggle('active', button.dataset.backend === backend);
  }
}

segmented.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-mode]');
  if (!button) return;
  const mode = button.dataset.mode as ActivationMode;
  setActiveSegment(mode);
  void updateSettings({ activationMode: mode });
});

backendSegmented.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-backend]');
  if (!button) return;
  const backend = button.dataset.backend as ReviewBackend;
  setActiveBackend(backend);
  void updateSettings({ reviewBackend: backend });
});

// The source of truth for "what's currently saved" - deliberately not
// `deckInput.defaultValue`, which never changes after the input's initial
// value and would make a later empty-input revert fall back to the original
// load-time deck name instead of the most recently saved one.
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

let hintTimeout: ReturnType<typeof setTimeout> | undefined;

claudeKeyInput.addEventListener('change', () => {
  const next = claudeKeyInput.value.trim();
  void setClaudeApiKey(next).then(() => {
    claudeKeyHint.textContent = next ? 'Сохранено.' : 'Ключ удалён — кнопка «Пример» будет недоступна.';
    clearTimeout(hintTimeout);
    hintTimeout = setTimeout(() => {
      claudeKeyHint.textContent = '';
    }, 2500);
  });
});

toggleKeyVisibility.addEventListener('click', () => {
  const showing = claudeKeyInput.type === 'text';
  claudeKeyInput.type = showing ? 'password' : 'text';
  toggleKeyVisibility.textContent = showing ? 'Показать' : 'Скрыть';
});

async function init() {
  const settings = await getSettings();
  setActiveSegment(settings.activationMode);
  setActiveBackend(settings.reviewBackend);
  currentDeckName = settings.deckName;
  deckInput.value = settings.deckName;
  claudeKeyInput.value = await getClaudeApiKey();
}

void init();
