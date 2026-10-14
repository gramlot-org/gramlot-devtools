# 025 · Development

Document ID: **GDT-025**.

[Paired view](../docs_llm/025-development.md).

<a id="gdt-025-005"></a>

## 005 · Build

Block ID: **GDT-025-005**.

Node 22 or later. Dependencies are installed locally from npm.

```sh
npm install --package-lock=false
node build.mjs
```

`dist/` is the extension. The test page copies Gramlot's `dist/gramlot.js` from `GRAMLOT_RUNTIME` (default: sibling checkout `../gramlot/js/dist/gramlot.js`); when it is missing the copy is skipped with a message. Bag and TYTX use the maintained npm packages `@genrojs/bag` and `@genrojs/tytx`, unconstrained and without a lockfile. Refresh them with `npm update --package-lock=false`.

<a id="gdt-025-010"></a>

## 010 · Tests

Block ID: **GDT-025-010**.

```sh
npm test                            # protocol and agent, with the real Bag
node tests/feasibility.mjs            # inspector in an extension page, no eval
node tests/e2e.mjs                    # extension in headless Chromium, panel as a tab
node tests/devtools.mjs               # panel inside real DevTools, over CDP
```

The browser tests need `npx playwright install chromium`. They enable the back/forward cache, which Playwright disables by default. `tests/devtools.mjs` reaches the DevTools frontend through an internal module path that can change between Chromium versions. Headless Chromium does not replace a check in Google Chrome: three defects were found only there (service worker shutdown, back/forward cache port errors and reconnection).

Verified 2026-10-14: the agent uses `gramlot.src.source` and the fixture uses
`app.src.startSource`. With Bag 0.10.3 and TYTX 0.16.2, all 14 unit tests,
the extension build, feasibility check, 27 e2e checks and eight real-DevTools
checks pass. Exact Source TYTX comparisons retain `__cls: "GramlotBuilderBag"`;
no comparison was weakened or skipped. Coverage includes live edits, reloads,
frame selection, strict CSP and cleanup. Reload the unpacked extension and reopen
DevTools to activate the rebuilt bundles. Local standalone files still require
file-URL permission; direct file-origin behavior was not browser-qualified.

**Historical record — 2026-10-14:** the old panel dependencies (Bag 0.5.3 and
TYTX 0.15.1) omitted the Source subtype metadata, causing five e2e and three
DevTools failures. The owner explicitly requested updating the panel libraries
and fixing these eight tests. The maintained dependencies and passive subtype
registration now resolve those failures.

<a id="gdt-025-015"></a>

## 015 · Vendored PoC runtime

Block ID: **GDT-025-015**.

`vendor/gramlot-poc/` holds an unmodified copy of the PoC modules reached by the panel bundle, `inspector.css`, and the PoC `LICENSE` and `NOTICE`, from gramlot-poc commit `10478b5`. Adapted copies (inspector, editor, builder) live in `src/inspector/`. The folder is removed when the panel moves to the published Gramlot package.

<a id="gdt-025-020"></a>

## 020 · Release

Block ID: **GDT-025-020**.

Releases need owner authorization. Push a tag `v<version>` equal to `version` in `src/manifest.json`. The workflow `.github/workflows/release.yml` runs the protocol and agent tests, builds `dist/`, zips it without the `feasibility.*` files and attaches `gramlot-devtools-<version>.zip` to a GitHub release.

<a id="gdt-025-025"></a>

## 025 · Contribution rules

Block ID: **GDT-025-025**.

- New work on `develop`; `main` holds verified, owner-accepted work.
- Commit messages `<type>: <subject>` in English; `git switch`, never `git checkout`; never force-push a pushed branch.
- No AI, LLM or assistant references in commits, pull requests, code, comments or documents; no assistant `Co-Authored-By` trailers; no `Generated with …` lines. Enable the hooks with `git config core.hooksPath hooks`; `hooks/commit-msg` rejects the usual forms.
- See `AGENTS.md` and `CONTRIBUTING.md`.
