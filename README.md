# KanjiFlow

A Manifest V3 browser extension that gives you a contextual Japanese dictionary on any web page: hold a modifier key (configurable — Shift, Alt, or always-on), hover over Japanese text, and get the dictionary-form lookup, reading, and meaning — even when the text is conjugated, deinflects correctly for verbs and i-adjectives, and ranks homographs by real-world frequency.

Everything runs locally by default: the dictionary lives in IndexedDB (no network calls at lookup time), and the only outbound request this extension makes is to AnkiConnect on `127.0.0.1`. The one opt-in exception is the example-sentence feature, which sends the matched word to Anthropic's API using your own API key if you choose to set one up — nothing else ever leaves the machine.

![Hovering over 読みました with Shift held shows the dictionary-form lookup (読む), then adds it to the mini-SRS queue](./demo/kanjiflow-demo.gif)

## Features

- **Contextual lookup** — Shift+hover (or Alt / always-on, your choice) over any Japanese text, on any page.
- **Deinflection engine** — a from-scratch rule table covering every godan class, ichidan, suru, the irregular kuru (both 来る and くる spellings), and i-adjectives, with chaining (causative + passive + negative resolves correctly, e.g. 食べさせられない → 食べる).
- **Longest-match segmentation** — Japanese has no spaces; this tries substrings of decreasing length from the cursor so a short accidental match never wins over a longer conjugated word that's actually there.
- **Homograph frequency ranking** — when multiple entries share a reading (e.g. 橋/箸/端, all はし), they're ranked using JMdict's own frequency tags, and each gets its own clearly-separated card.
- **Anki export or a built-in mini-SRS** — click to pin a lookup, then add it to Anki via [AnkiConnect](https://ankiweb.net/shared/info/2055492159), or to a built-in SM-2 spaced-repetition queue if you don't use Anki. A dedicated review page walks through due cards.
- **Text-to-speech** — hear the reading via the browser's built-in Web Speech API.
- **Example sentences (optional)** — a "Пример" button asks Claude for a couple of natural example sentences using the matched word, if you've added your own Anthropic API key in the options page.
- **Toolbar popup + options page** — the popup shows AnkiConnect connectivity / due-card count and recently-added cards at a glance; the activation key, deck name, Anki/mini-SRS mode, and Claude API key live on a dedicated options page (gear icon in the popup).

## Installation (as a regular extension)

The extension doesn't need `npm run dev` running to work - that's only for
active development (hot reload on save). To install it like any other
unpacked extension, with nothing left running in a terminal:

```bash
npm install
npm run build:dictionary   # see "Development" below for the one manual step this needs first
npm run build              # -> .output/chrome-mv3/
```

Then in Chrome/Edge: open `chrome://extensions`, enable **Developer mode**
(top right), click **Load unpacked**, and select the `.output/chrome-mv3/`
folder. The extension now behaves exactly like one installed from the Chrome
Web Store - it keeps working after closing the terminal, and survives
browser restarts. Firefox: `npm run build:firefox` instead, then
`about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** and pick
any file inside `.output/firefox-mv3/` (temporary add-ons don't survive a
Firefox restart - that's a Firefox limitation, not this extension's).

`npm run zip` (or `zip:firefox`) packages the same build into a single
`.output/*.zip` - the format the Chrome Web Store / AMO expect for
publishing, or just a convenient way to hand the built extension to someone
else without the source tree.

Rebuilding later (e.g. after `git pull`) just needs `npm run build` again,
then **Reload** on the extension's card in `chrome://extensions`.

## Architecture

```mermaid
flowchart TB
    subgraph page["Any web page"]
        CS["Content script<br/>(cursor detection, popup, TTS)"]
    end

    subgraph ext["Extension (background service worker)"]
        BG["Message handlers"]
        DICT[("IndexedDB<br/>JMdict (~219k entries)")]
        SRS[("IndexedDB<br/>mini-SRS cards")]
    end

    subgraph ui["Toolbar popup / Options / Review page"]
        POPUP["popup.html"]
        OPTIONS["options.html"]
        REVIEW["review.html"]
    end

    ANKI["AnkiConnect<br/>(127.0.0.1:8765)"]
    CLAUDE["Claude API<br/>(api.anthropic.com)"]

    CS <-- "runtime messaging<br/>(utils/messaging.ts)" --> BG
    POPUP <-- "runtime messaging" --> BG
    REVIEW <-- "runtime messaging" --> BG
    BG --> DICT
    BG --> SRS
    BG -- "HTTP POST (localhost only)" --> ANKI
    BG -. "HTTPS, user's own API key" .-> CLAUDE

    CS -. "deinflect + longest-match<br/>(utils/deinflect/, utils/dictionary/lookup.ts)" .-> DICT
```

The background service worker is the only context that holds the two IndexedDB connections open — the content script, popup, and review page all go through the typed message-passing layer (`utils/messaging.ts`) rather than opening their own connections, so there's a single source of truth for both the dictionary and the review queue.

## Tech stack

- **[WXT](https://wxt.dev)** (Vite-based MV3 framework) + TypeScript, no UI framework (vanilla DOM)
- **IndexedDB** via [`idb`](https://github.com/jakearchibald/idb) for both the dictionary and the mini-SRS
- **[JMdict](https://www.edrdg.org/jmdict/j_jmdict.html)** as the dictionary source, parsed by a custom XML→JSON pipeline (`scripts/jmdict/`)
- **Vitest** + `fake-indexeddb` + `jsdom` for the test suite
- **AnkiConnect** for Anki export; the **Web Speech API** for pronunciation — both used directly, no extra dependency

## Development

For active development (hot reload on save, instead of the one-time build above):

```bash
npm install
npm run build:dictionary   # downloads nothing itself - see below for the one manual step
npm run dev                # opens Chrome with the extension loaded, rebuilds on save
```

`npm run build:dictionary` regenerates the bundled dictionary from JMdict's XML. It needs the raw source first:

```bash
mkdir -p data/raw
curl -o data/raw/JMdict_e.gz http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz
gunzip data/raw/JMdict_e.gz
npm run build:dictionary
```

Other useful commands:

```bash
npm run compile    # type-check
npm run test       # run the Vitest suite (fast - uses a tiny fixture dictionary, not the real one)
npm run build      # production build -> .output/chrome-mv3/
npm run test:e2e   # Playwright smoke test against the built extension in a real Chromium (run npm run build first)
npm run demo:record # re-records the GIF above (demo/record.mjs) - see its own log output for the ffmpeg conversion step
```

See [`CLAUDE.md`](./CLAUDE.md) for a deeper tour of the codebase's structure and the reasoning behind specific design decisions.

## Dictionary data attribution

This software uses the JMdict dictionary file. This file is the property of the [Electronic Dictionary Research and Development Group](https://www.edrdg.org/), and is used in conformance with the Group's [licence](https://www.edrdg.org/edrdg/licence.html).

## License

This project's own code is MIT licensed - see [`LICENSE`](./LICENSE). The JMdict data's own licence is as described above regardless.
