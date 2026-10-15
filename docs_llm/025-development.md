# 025 · Development

Document ID: **GDT-025**.

[Paired view](../docs/025-development.md).

<a id="gdt-025-005"></a>

## 005 · Build

Block ID: **GDT-025-005**.

`npm install --package-lock=false`, `node build.mjs` → `dist/`. Test page runtime from `GRAMLOT_RUNTIME` (default `../gramlot/js/dist/gramlot.js`, skipped when missing). Panel dependencies use unconstrained `@genrojs/bag` and `@genrojs/tytx` from npm, without a lockfile; refresh with `npm update --package-lock=false`.

<a id="gdt-025-010"></a>

## 010 · Tests

Block ID: **GDT-025-010**.

Unit tests: protocol and agent (node). Browser suites: feasibility, e2e, DevTools (Playwright Chromium, back/forward cache enabled). The DevTools suite uses an internal frontend path. Also check in Google Chrome: headless missed three defects.

Verified 2026-10-15 with Bag 0.11.0 and TYTX 0.16.2: 14 unit tests,
the extension build, feasibility check, 28 e2e checks and eight real-DevTools
checks pass in Playwright Chromium. Coverage includes editing, frame selection,
reloads, strict CSP, cleanup, and breakpoint marks (hover, keyboard focus,
red/yellow state and removal without replacing tree rows). Source comparisons
use the complete TYTX text, including subtype metadata, without JSON-only assumptions.
The provisional SourceBag registration uses payload codecs, separate from the
new Bag document-ingestion API. No vendored file or upstream library is modified.
Reload the unpacked extension and reopen DevTools to activate the rebuilt bundles.
Local standalone files still require file-URL permission; direct file-origin
behavior and a separate Google Chrome run were not browser-qualified here.

**Historical record — 2026-10-14:** the old panel dependencies (Bag 0.5.3 and
TYTX 0.15.1) omitted the Source subtype metadata, causing five e2e and three
DevTools failures. The owner explicitly requested updating the panel libraries
and fixing these eight tests. The maintained dependencies and passive subtype
registration now resolve those failures.

<a id="gdt-025-015"></a>

## 015 · Vendored PoC runtime

Block ID: **GDT-025-015**.

`vendor/gramlot-poc/`: unmodified PoC modules used by the panel (commit `10478b5`) with LICENSE/NOTICE; adapted copies in `src/inspector/`. Removed once Gramlot is published.

The adapted `panel-tree.js` adds left-gutter row actions and an in-place mark refresh. `panel-source-bag.js` registers the provisional `XS` wire type with the current Bag payload codecs. The build routes SourceBag imports to this adapted copy. Their vendored sources remain unchanged.

<a id="gdt-025-020"></a>

## 020 · Release

Block ID: **GDT-025-020**.

With owner authorization: tag `v<version>` = manifest version; the release workflow tests, builds and attaches a zip without `feasibility.*`.

<a id="gdt-025-025"></a>

## 025 · Contribution rules

Block ID: **GDT-025-025**.

`develop` for new work, `main` for accepted work; `<type>: <subject>`; `git switch`; no force-push; no AI/LLM/assistant references or attribution trailers anywhere (`hooks/commit-msg`). See AGENTS.md and CONTRIBUTING.md.
