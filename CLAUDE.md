# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A Manifest V3 browser extension that provides contextual Japanese dictionary lookups (Shift+hover over text on any page — plain hover is intentionally ignored, so the lookup pipeline doesn't fire on every incidental mouse movement), built with WXT. Implemented so far: the JMdict dictionary pipeline and IndexedDB store, the deinflection engine, longest-match cursor lookup, and the content script/popup/messaging wiring described under Architecture below. Still planned:

- Export to Anki via the local AnkiConnect REST API (`http://127.0.0.1:8765`, already in `host_permissions`), plus an optional built-in mini-SRS stored in IndexedDB for users without Anki.
- An options page (`chrome.storage`) for deck/model name, hotkey, and Anki vs. mini-SRS mode.

Known gap: the cursor-detection API (`document.caretRangeFromPoint`) is Chromium/WebKit-only, so the feature is a no-op on Firefox despite the `dev:firefox`/`build:firefox` scripts existing — see `entrypoints/content.ts`'s top-of-file comment before changing cursor detection.

## Commands

- `npm run dev` — start the WXT dev server for Chrome (hot-reloads the unpacked extension).
- `npm run dev:firefox` — same, targeting Firefox.
- `npm run build` / `npm run build:firefox` — production build, output in `.output/<target>/`.
- `npm run zip` / `npm run zip:firefox` — build and package into a distributable zip.
- `npm run compile` — type-check the whole project (`tsc --noEmit`) without emitting.
- `npm run test` — run the Vitest suite once (`*.test.ts` files next to the code they cover, e.g. `utils/deinflect/deinflect.test.ts`). These do **not** require `npm run build:dictionary` to have run first — `utils/dictionary/*.test.ts` seed a tiny hand-written fixture dictionary into `fake-indexeddb` rather than touching the real ~219k-entry JSON, so the suite stays fast and runs on a fresh clone.

- `npm run build:dictionary` — regenerate `public/dictionary/jmdict-en.json` (and `data/pos-tags.json`) from the raw JMdict XML. Requires `data/raw/JMdict_e` to exist first: download it from `http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz` (EDRDG, open licence — attribution still needed in the README once published) and `gunzip` it into `data/raw/`. Both `data/` and `public/dictionary/` are gitignored — they're regenerated from source, not committed, because the parsed dictionary alone is ~40 MB. **On a fresh clone, run this before `npm run compile`/`dev`/`build`**: WXT's `getURL()` typing (`PublicPath`) is generated from whatever actually exists under `public/` at `wxt prepare` time, so referencing `/dictionary/jmdict-en.json` type-checks only after the file exists and `wxt prepare` (or `npx wxt prepare` directly) has re-run.

## Architecture

This is a [WXT](https://wxt.dev) project (Vite-based MV3 framework, file-based entrypoints similar to Nuxt/Next).

- **`entrypoints/`** — one file/folder per extension surface; WXT derives the manifest's `background`, `content_scripts`, and `action.default_popup` from what it finds here (`background.ts`, `content.ts`, `popup/`). Adding a new entrypoint (e.g. an options page) means adding a new file/folder here, not hand-editing the manifest.
- **`wxt.config.ts`** — the single source of truth for `manifest.json` fields that aren't derived from entrypoints (name, `permissions`, `host_permissions`). AnkiConnect access is granted here via `host_permissions: ['http://127.0.0.1:8765/*']`; new cross-origin calls need their origin added here, not just in `fetch()` calls.
- **`components/`** — shared UI/non-entrypoint pieces: `counter.ts` (popup page starter) and `lookup-popup.ts`'s `LookupPopup` class, a Shadow-DOM-isolated card the content script shows/hides/repositions per lookup (created once per injection, not recreated per hover).
- **`utils/content/`** — DOM logic the content script needs that isn't itself an entrypoint: `text-run.ts`'s `extractTextRun()`/`isInsideRubyText()` pull the text run at a `caretRangeFromPoint` result and skip `<rt>` (furigana) nodes; tested with jsdom (`// @vitest-environment jsdom` in its `.test.ts`) since it's DOM-shaped but doesn't need a real browser.
- **`utils/messaging.ts`** — the typed `browser.runtime.sendMessage`/`onMessage` contract between content script and background: `ExtensionMessage` is a discriminated union (currently just `lookup`) and `registerMessageHandlers()` dispatches on `message.type`, so a second message type (e.g. the planned Anki export) is additive — a new union member, a new `MessageHandlers` field, a new `switch` case — not a rewrite of this function.
- **`utils/dictionary/`** — shared dictionary logic used at both build time and runtime: `types.ts` has the canonical `DictionaryEntry`/`Sense` shape, `frequency.ts` ranks competing entries that share a surface form (e.g. 橋/箸/端 all read はし) using JMdict's own `priority` tags — see the doc comment there for why this doesn't reorder senses within one entry. `db.ts` is the IndexedDB layer (`openDictionaryDB`/`seedIfEmpty`/`lookupExact`, indexed by kanji and reading, both multi-entry). `lookup.ts`'s `lookupAtCursor()` is the entry point everything else builds toward: longest-match substring scan from a cursor position, combined with `utils/deinflect/`'s candidates and frequency ranking.
- **`utils/deinflect/`** — the Japanese deinflection engine (verbs + i-adjectives). `rules.ts` is table-driven per conjugation class (`godanRules()`/`suruRules()`/`ichidanShapedRules()` generators, not hand-copied per class) and documents its own known gaps at the top of the file. `deinflect.ts`'s `deinflect(word)` recursively strips suffixes and returns candidates tagged with the part-of-speech the real dictionary entry must have; `tagsMatch()` is the one place that checks a candidate's tags against real JMdict tags (it knows about the `"any"` sentinel on the unmodified input, so callers don't have to).
- WXT auto-imports its own globals (`defineBackground`, `defineContentScript`, `browser`) inside `entrypoints/` — no explicit import needed, see `.wxt/types` after `wxt prepare` (runs automatically via the `postinstall` script) if a global's type isn't resolving.
- Manifest target defaults to `chrome-mv3`; `-b firefox` flags switch the build target without touching source files.
- **`scripts/jmdict/`** — the JMdict XML → JSON build pipeline, run with `npm run build:dictionary` (not part of the extension bundle itself; imports the shared `DictionaryEntry` type from `utils/dictionary/types.ts`). The one subtlety: JMdict's DTD declares entities like `&v5m;` that expand to a long English description ("Godan verb with 'mu' ending"), but the deinflection engine (planned) needs the short code itself to validate conjugation classes — so `parse-jmdict.ts` resolves each entity to its own name (`v5m`), not its declared value, and separately dumps the code→description map to `data/pos-tags.json` for any future human-readable display.
