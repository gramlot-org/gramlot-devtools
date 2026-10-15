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

`dist/` is the extension. The test page copies Gramlot's `dist/gramlot.js` from `GRAMLOT_RUNTIME` (default: sibling checkout `../gramlot/js/dist/gramlot.js`); when it is missing the copy is skipped with a message. The extension depends on `@gramlot/gramlot` with a minimum version and no upper bound and no lockfile. Refresh it with `npm update --package-lock=false`.

To work on the shared inspector locally, build the sibling core checkout
and install that checkout explicitly:

```sh
npm run build --prefix ../gramlot/js
npm install --no-save --package-lock=false ../gramlot/js
node build.mjs
```

There is no build fallback to a vendored inspector.

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

Verified 2026-10-15: the shared implementation passes five unit tests, the
extension build, the MV3 feasibility check, all 22 routed end-to-end checks and
all eight checks inside real Chromium DevTools. Coverage includes Data/Source
edits, revision rejection, page and service-worker reconnection, back/forward
cache, frame isolation/visibility, breakpoint conditions and debugger writer
stacks, CSS preview/download/reset, CSP and teardown. The Styles panel was also
visually inspected. There are no unexpected browser errors.

The build includes LICENSE, NOTICE and the Gramlot package's runtime-notices.json
with the bundled dependency license texts.
Reload the unpacked extension and reopen DevTools to activate rebuilt bundles.
Direct file-origin behavior and a separate Google Chrome run are not qualified
by the Chromium tests.

**Historical record — 2026-10-15, before unification:** the previous PoC panel
passed 14 unit tests, 28 end-to-end checks and eight real-DevTools checks with
Bag 0.11.0 and TYTX 0.16.2. Its provisional SourceBag payload codec preserved
exact subtype wire metadata. That implementation and its compatibility codec
are removed by the shared inspector migration; current tests cover the shared
node-descriptor contract instead.

<a id="gdt-025-015"></a>

## 015 · Shared inspector dependency

Block ID: **GDT-025-015**.

The panel and page agent are imported from the optional Gramlot package entries.
No `vendor/gramlot-poc`, adapted inspector, passive Source subtype codec or
independent property editor remains. Changes to shared inspector behavior belong
in core; Chrome discovery, frame selection and routing belong in this repository.

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
