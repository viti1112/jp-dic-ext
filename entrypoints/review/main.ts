import './style.css';
import { requestDueSrsCards, requestReviewSrsCard } from '@/utils/messaging.ts';
import type { ReviewQuality, SrsCard } from '@/utils/srs/types.ts';
import { speakJapanese } from '@/utils/tts.ts';

const BATCH_SIZE = 20;

const app = document.querySelector<HTMLDivElement>('#app')!;

let queue: SrsCard[] = [];
let revealed = false;
let rating = false; // guards against double-submitting a rating for the current card

function renderShell(): void {
  app.innerHTML = `
    <div class="page">
      <div class="brand"><span class="brand-icon">字</span>KanjiFlow · повторение</div>
      <div id="content"></div>
    </div>
  `;
}

function renderEmpty(): void {
  document.querySelector<HTMLDivElement>('#content')!.innerHTML = `
    <div class="card">
      <div class="empty-state">На сегодня карточек нет — загляните позже.</div>
      <button type="button" class="reveal-btn" id="close-tab">Закрыть</button>
    </div>
  `;
  document.querySelector<HTMLButtonElement>('#close-tab')!.addEventListener('click', () => window.close());
}

function renderErrorBanner(message: string): void {
  const banner = document.createElement('div');
  banner.className = 'empty-state';
  banner.textContent = message;
  document.querySelector<HTMLDivElement>('#content')!.prepend(banner);
}

function renderCard(): void {
  const content = document.querySelector<HTMLDivElement>('#content')!;
  const card = queue[0];
  if (!card) {
    renderEmpty();
    return;
  }

  content.innerHTML = `
    <div class="progress">Осталось: ${queue.length}</div>
    <div class="card">
      <div class="headword">${escapeHtml(card.headword)} <button type="button" class="speak-btn" id="speak" title="Озвучить">\u{1F50A}</button></div>
      ${revealed ? `<div class="reading">${escapeHtml(card.reading)}</div>` : ''}
      ${revealed ? `<div class="glosses">${escapeHtml(card.glosses)}</div>` : ''}
      ${
        revealed
          ? `<div class="rate-row">
               <button class="rate-btn" type="button" data-quality="again">Again</button>
               <button class="rate-btn" type="button" data-quality="hard">Hard</button>
               <button class="rate-btn" type="button" data-quality="good">Good</button>
               <button class="rate-btn" type="button" data-quality="easy">Easy</button>
             </div>`
          : `<button class="reveal-btn" type="button" id="reveal">Показать ответ</button>`
      }
    </div>
  `;

  document.querySelector<HTMLButtonElement>('#speak')!.addEventListener('click', () => {
    speakJapanese(card.reading || card.headword);
  });

  if (!revealed) {
    document.querySelector<HTMLButtonElement>('#reveal')!.addEventListener('click', () => {
      revealed = true;
      renderCard();
    });
  } else {
    const buttons = content.querySelectorAll<HTMLButtonElement>('.rate-btn');
    for (const button of buttons) {
      button.addEventListener('click', () => {
        // Guards both a fast double-click on one button and a click on a
        // second button before the first's round-trip resolves - without
        // this, both would fire requestReviewSrsCard for the same card.
        if (rating) return;
        rating = true;
        for (const b of buttons) b.disabled = true;
        void rate(card, button.dataset.quality as ReviewQuality, buttons);
      });
    }
  }
}

async function rate(card: SrsCard, quality: ReviewQuality, buttons: NodeListOf<HTMLButtonElement>): Promise<void> {
  const reviewed = await requestReviewSrsCard(card.id, quality);
  rating = false;

  if (!reviewed) {
    // The background reported it couldn't save this review (card.id not
    // found, or the request failed) - re-enable the buttons and let the
    // user retry, rather than silently advancing as if it had succeeded
    // (which would both lose the review and incorrectly drop this card
    // from the queue).
    for (const button of buttons) button.disabled = false;
    renderErrorBanner('Не удалось сохранить оценку — попробуйте ещё раз.');
    return;
  }

  queue.shift();
  revealed = false;
  await refillQueueIfEmpty();
  renderCard();
}

/** The batch fetched at init()/here is capped at BATCH_SIZE; if it's exhausted but more cards could be due, fetch another before declaring the session done - a reviewed card's dueAt always moves into the future, so a re-fetch can never return the same card again. */
async function refillQueueIfEmpty(): Promise<void> {
  if (queue.length > 0) return;
  queue = await requestDueSrsCards(BATCH_SIZE);
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function init(): Promise<void> {
  renderShell();
  queue = await requestDueSrsCards(BATCH_SIZE);
  renderCard();
}

void init();
