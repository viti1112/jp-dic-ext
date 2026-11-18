import { LookupPopup } from '@/components/lookup-popup.ts';
import { basicCardFromEntry } from '@/utils/anki.ts';
import { extractTextRun, isInteractiveElement } from '@/utils/content/text-run.ts';
import type { LookupMatch } from '@/utils/dictionary/lookup.ts';
import { requestAddToAnki, requestLookup } from '@/utils/messaging.ts';
import { getSettings, isActivationHeld, onSettingsChanged } from '@/utils/settings.ts';

const THROTTLE_MS = 60;

// `caretRangeFromPoint` is a non-standard Chromium/WebKit API with no
// Firefox equivalent (Firefox has `caretPositionFromPoint`, a different
// shape) — this extension's manifest target defaults to chrome-mv3 (see
// CLAUDE.md), so rather than build a cross-engine abstraction for a
// `dev:firefox`/`build:firefox` target that isn't the primary one yet, this
// feature-detects and simply does nothing on engines without it.
const SUPPORTS_CARET_RANGE_FROM_POINT = typeof document.caretRangeFromPoint === 'function';

export default defineContentScript({
  matches: ['*://*/*'],
  async main() {
    if (!SUPPORTS_CARET_RANGE_FROM_POINT) return;

    let settings = await getSettings();
    onSettingsChanged((next) => {
      settings = next;
    });

    const popup = new LookupPopup((entry) => requestAddToAnki(basicCardFromEntry(entry, settings.deckName)));
    let currentMatch: LookupMatch | null = null;
    let throttled = false;
    let lastRequestKey = '';
    // Guards against a slower, now-stale lookup response overwriting a
    // newer one if the user moves on before the first one resolves.
    let latestRequestId = 0;

    // The only place that hides the popup - always goes through here (never
    // `popup.hide()` directly) so `currentMatch` can never go stale while the
    // popup is hidden. A stale non-null `currentMatch` combined with a
    // hidden popup is exactly the state that previously let a click pin an
    // invisible popup stuck that way until Escape.
    function hide() {
      popup.hide();
      currentMatch = null;
      lastRequestKey = '';
    }

    document.addEventListener('mousemove', (event) => {
      if (popup.isPinned()) return; // frozen on the pinned word until Escape

      if (!isActivationHeld(settings.activationMode, event)) {
        hide();
        return;
      }

      // Throttle before doing any work at all - mousemove can fire far more
      // often than a lookup is useful, and each skipped tick costs nothing.
      if (throttled) return;
      throttled = true;
      setTimeout(() => {
        throttled = false;
      }, THROTTLE_MS);

      const range = document.caretRangeFromPoint(event.clientX, event.clientY);
      if (!range) {
        hide();
        return;
      }

      const run = extractTextRun(range.startContainer, range.startOffset);
      if (!run) {
        hide();
        return;
      }

      const requestKey = `${run.text}|${run.cursorIndex}`;
      if (requestKey === lastRequestKey) return;
      lastRequestKey = requestKey;

      const requestId = ++latestRequestId;
      requestLookup(run.text, run.cursorIndex)
        .then((match) => {
          if (requestId !== latestRequestId) return; // a newer request has since superseded this one
          currentMatch = match;
          if (match) {
            popup.show(match, event.clientX, event.clientY);
          } else {
            popup.hide();
          }
        })
        .catch(() => {
          if (requestId === latestRequestId) hide();
        });
    });

    // Clicking a matched word pins the popup open so its "+Anki" buttons
    // become clickable; clicks on the (already-interactive) popup itself are
    // handled by its own buttons and never reach here (they stopPropagation).
    // Never hijacks a click on a link/button/form field the matched text
    // happens to sit inside of - that's a normal page click, not a pin.
    document.addEventListener('click', (event) => {
      if (popup.isPinned()) return;
      if (!isActivationHeld(settings.activationMode, event)) return;
      if (!currentMatch) return;
      if (isInteractiveElement(event.target)) return;

      popup.pin();
      event.preventDefault();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && popup.isPinned()) {
        popup.unpin();
        currentMatch = null;
      }
    });
  },
});
