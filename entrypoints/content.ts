import { LookupPopup } from '@/components/lookup-popup.ts';
import { extractTextRun } from '@/utils/content/text-run.ts';
import { requestLookup } from '@/utils/messaging.ts';

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
  main() {
    if (!SUPPORTS_CARET_RANGE_FROM_POINT) return;

    const popup = new LookupPopup();
    let throttled = false;
    let lastRequestKey = '';
    // Guards against a slower, now-stale lookup response overwriting a
    // newer one if the user moves on before the first one resolves.
    let latestRequestId = 0;

    function hide() {
      popup.hide();
      lastRequestKey = '';
    }

    document.addEventListener('mousemove', (event) => {
      if (!event.shiftKey) {
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
          if (match) {
            popup.show(match, event.clientX, event.clientY);
          } else {
            popup.hide();
          }
        })
        .catch(() => {
          if (requestId === latestRequestId) popup.hide();
        });
    });
  },
});
