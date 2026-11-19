import type { AddCardOutcome } from '@/components/lookup-popup.ts';
import { LookupPopup } from '@/components/lookup-popup.ts';
import { basicCardFromEntry } from '@/utils/anki.ts';
import type { GenerateExamplesResult } from '@/utils/claude.ts';
import { extractTextRun, isInteractiveElement } from '@/utils/content/text-run.ts';
import { entryDisplayFields } from '@/utils/dictionary/display.ts';
import { MAX_LOOKUP_LENGTH } from '@/utils/dictionary/lookup.ts';
import type { LookupMatch } from '@/utils/dictionary/lookup.ts';
import type { DictionaryEntry } from '@/utils/dictionary/types.ts';
import { requestAddToAnki, requestAddToSrs, requestGenerateExamples, requestLookup } from '@/utils/messaging.ts';
import { getSettings, isActivationHeld, onSettingsChanged } from '@/utils/settings.ts';
import { createCard } from '@/utils/srs/scheduler.ts';

const ANKI_UNREACHABLE_MESSAGE =
  'Could not reach AnkiConnect — is Anki running with the AnkiConnect add-on installed, and is this extension allowed in its webCorsOriginList?';

async function addEntryViaAnki(entry: DictionaryEntry, deckName: string): Promise<AddCardOutcome> {
  const result = await requestAddToAnki(basicCardFromEntry(entry, deckName));
  if (result.ok) return { ok: true };
  return { ok: false, message: result.reason === 'unreachable' ? ANKI_UNREACHABLE_MESSAGE : result.message };
}

async function addEntryViaSrs(entry: DictionaryEntry): Promise<AddCardOutcome> {
  try {
    const { headword, reading, glosses } = entryDisplayFields(entry);
    await requestAddToSrs(createCard(entry.id, headword, reading, glosses.join('; ')));
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not add to the review queue.' };
  }
}

function generateExamplesForEntry(entry: DictionaryEntry): Promise<GenerateExamplesResult> {
  const { headword, reading, glosses } = entryDisplayFields(entry);
  return requestGenerateExamples(headword, reading, glosses[0] ?? '');
}

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

    const popup = new LookupPopup(
      () => (settings.reviewBackend === 'anki' ? '+ Anki' : '+ SRS'),
      (entry) => (settings.reviewBackend === 'anki' ? addEntryViaAnki(entry, settings.deckName) : addEntryViaSrs(entry)),
      generateExamplesForEntry,
    );
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
      latestRequestId++; // invalidate any lookup still in flight so it can't reopen the popup once it resolves
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

      // Trim to the window lookupAtCursor actually reads before this crosses
      // the messaging boundary - a page can put an entire article's text in
      // one text node, and only the next MAX_LOOKUP_LENGTH characters from
      // the cursor are ever used downstream.
      const windowText = run.text.slice(run.cursorIndex, run.cursorIndex + MAX_LOOKUP_LENGTH);

      const requestKey = windowText;
      if (requestKey === lastRequestKey) return;
      lastRequestKey = requestKey;

      const requestId = ++latestRequestId;
      requestLookup(windowText, 0)
        .then((match) => {
          if (requestId !== latestRequestId) return; // a newer request has since superseded this one
          currentMatch = match;
          if (match) {
            popup.show(match, event.clientX, event.clientY);
          } else {
            hide();
          }
        })
        .catch(() => {
          if (requestId === latestRequestId) hide();
        });
    });

    // Clicking a matched word pins the popup open so its add-card button
    // becomes clickable; clicks on the (already-interactive) popup itself are
    // handled by its own buttons and never reach here (they stopPropagation).
    // Never hijacks a click on a link/button/form field the matched text
    // happens to sit inside of - that's a normal page click, not a pin.
    document.addEventListener('click', (event) => {
      if (popup.isPinned()) {
        // Clicking anywhere outside the pinned popup dismisses it - the same
        // outcome as Escape, just via the other common way people expect a
        // pinned tooltip/dropdown to close. Not calling preventDefault()
        // here: whatever was actually clicked (a link, blank page, another
        // word) still gets its own normal click behavior: this only ever
        // suppresses accidentally re-pinning on the very same click.
        if (!popup.containsEventTarget(event.target)) {
          popup.unpin();
          currentMatch = null;
        }
        return;
      }
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
