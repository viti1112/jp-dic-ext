# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A Manifest V3 browser extension that provides contextual Japanese dictionary lookups (hover/Shift+hover over text on any page), built with WXT. Core pieces planned for this repo, beyond the current scaffold:

- A JMdict-derived dictionary stored in IndexedDB, with a frequency list used to rank multiple meanings of the same word.
- A deinflection engine (content/background logic) that does longest-match substring segmentation over Japanese text (no word boundaries) and validates candidate base forms against part-of-speech rules, rather than accepting any suffix match.
- A content script that detects the word under the cursor, renders a lookup popup inside a Shadow DOM, and skips `<ruby>/<rt>` (furigana) nodes.
- Export to Anki via the local AnkiConnect REST API (`http://127.0.0.1:8765`, already in `host_permissions`), plus an optional built-in mini-SRS stored in IndexedDB for users without Anki.
- An options page (`chrome.storage`) for deck/model name, hotkey, and Anki vs. mini-SRS mode.

## Commands

- `npm run dev` — start the WXT dev server for Chrome (hot-reloads the unpacked extension).
- `npm run dev:firefox` — same, targeting Firefox.
- `npm run build` / `npm run build:firefox` — production build, output in `.output/<target>/`.
- `npm run zip` / `npm run zip:firefox` — build and package into a distributable zip.
- `npm run compile` — type-check the whole project (`tsc --noEmit`) without emitting; run this after any change since there is no test suite yet.

- `npm run build:dictionary` — regenerate `public/dictionary/jmdict-en.json` (and `data/pos-tags.json`) from the raw JMdict XML. Requires `data/raw/JMdict_e` to exist first: download it from `http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz` (EDRDG, open licence — attribution still needed in the README once published) and `gunzip` it into `data/raw/`. Both `data/` and `public/dictionary/` are gitignored — they're regenerated from source, not committed, because the parsed dictionary alone is ~40 MB.

There is no test runner configured yet (Vitest is planned once the deinflection engine is implemented).

## Architecture

This is a [WXT](https://wxt.dev) project (Vite-based MV3 framework, file-based entrypoints similar to Nuxt/Next).

- **`entrypoints/`** — one file/folder per extension surface; WXT derives the manifest's `background`, `content_scripts`, and `action.default_popup` from what it finds here (`background.ts`, `content.ts`, `popup/`). Adding a new entrypoint (e.g. an options page) means adding a new file/folder here, not hand-editing the manifest.
- **`wxt.config.ts`** — the single source of truth for `manifest.json` fields that aren't derived from entrypoints (name, `permissions`, `host_permissions`). AnkiConnect access is granted here via `host_permissions: ['http://127.0.0.1:8765/*']`; new cross-origin calls need their origin added here, not just in `fetch()` calls.
- **`components/`** — shared UI helpers reused across entrypoints (currently just the starter `counter.ts`).
- WXT auto-imports its own globals (`defineBackground`, `defineContentScript`, `browser`) inside `entrypoints/` — no explicit import needed, see `.wxt/types` after `wxt prepare` (runs automatically via the `postinstall` script) if a global's type isn't resolving.
- Manifest target defaults to `chrome-mv3`; `-b firefox` flags switch the build target without touching source files.
- **`scripts/jmdict/`** — the JMdict XML → JSON build pipeline, run with `npm run build:dictionary` (not part of the extension bundle itself). `types.ts` defines the `DictionaryEntry`/`Sense` shape consumed by the rest of the project. The one subtlety: JMdict's DTD declares entities like `&v5m;` that expand to a long English description ("Godan verb with 'mu' ending"), but the deinflection engine (planned) needs the short code itself to validate conjugation classes — so `parse-jmdict.ts` resolves each entity to its own name (`v5m`), not its declared value, and separately dumps the code→description map to `data/pos-tags.json` for any future human-readable display.
