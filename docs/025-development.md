# 025 · Development

Document ID: **GDT-025**.

[Paired view](../docs_llm/025-development.md).

<a id="gdt-025-005"></a>

## 005 · Build

Block ID: **GDT-025-005**.

Node 22 or later. Dependencies are local; `.npmrc` maps the `@jsr` scope to `npm.jsr.io`.

```sh
npm install
node build.mjs
```

`dist/` is the extension. The test page copies Gramlot's `dist/gramlot.js` from `GRAMLOT_RUNTIME` (default: sibling checkout `../gramlot/js/dist/gramlot.js`); when it is missing the copy is skipped with a message. Bag and TYTX are `@jsr/genro__bag` 0.5.3 and `@jsr/genro__tytx` 0.15.1, the versions used by Gramlot.

<a id="gdt-025-010"></a>

## 010 · Tests

Block ID: **GDT-025-010**.

```sh
node --test tests/protocol.test.mjs   # protocol, with the real Bag
node tests/feasibility.mjs            # inspector in an extension page, no eval
node tests/e2e.mjs                    # extension in headless Chromium, panel as a tab
node tests/devtools.mjs               # panel inside real DevTools, over CDP
```

The browser tests need `npx playwright install chromium`. They enable the back/forward cache, which Playwright disables by default. `tests/devtools.mjs` reaches the DevTools frontend through an internal module path that can change between Chromium versions. Headless Chromium does not replace a check in Google Chrome: three defects were found only there (service worker shutdown, back/forward cache port errors and reconnection).

<a id="gdt-025-015"></a>

## 015 · Vendored PoC runtime

Block ID: **GDT-025-015**.

`vendor/gramlot-poc/` holds an unmodified copy of the PoC modules reached by the panel bundle, `inspector.css`, and the PoC `LICENSE` and `NOTICE`, from gramlot-poc commit `10478b5`. Adapted copies (inspector, editor, builder) live in `src/inspector/`. The folder is removed when the panel moves to the published Gramlot package.

<a id="gdt-025-020"></a>

## 020 · Release

Block ID: **GDT-025-020**.

Releases need owner authorization. Push a tag `v<version>` equal to `version` in `src/manifest.json`. The workflow `.github/workflows/release.yml` runs the protocol tests, builds `dist/`, zips it without the `feasibility.*` files and attaches `gramlot-devtools-<version>.zip` to a GitHub release.

<a id="gdt-025-025"></a>

## 025 · Contribution rules

Block ID: **GDT-025-025**.

- New work on `develop`; `main` holds verified, owner-accepted work.
- Commit messages `<type>: <subject>` in English; `git switch`, never `git checkout`; never force-push a pushed branch.
- No AI, LLM or assistant references in commits, pull requests, code, comments or documents; no assistant `Co-Authored-By` trailers; no `Generated with …` lines. Enable the hooks with `git config core.hooksPath hooks`; `hooks/commit-msg` rejects the usual forms.
- See `AGENTS.md` and `CONTRIBUTING.md`.
