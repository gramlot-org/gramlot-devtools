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

`vendor/gramlot-poc/`: unmodified PoC modules used by the panel (commit `10478b5`) with LICENSE/NOTICE; adapted copies in `src/inspector/`. Removed once Gramlot is published.

<a id="gdt-025-020"></a>

## 020 · Release

Block ID: **GDT-025-020**.

With owner authorization: tag `v<version>` = manifest version; the release workflow tests, builds and attaches a zip without `feasibility.*`.

<a id="gdt-025-025"></a>

## 025 · Contribution rules

Block ID: **GDT-025-025**.

`develop` for new work, `main` for accepted work; `<type>: <subject>`; `git switch`; no force-push; no AI/LLM/assistant references or attribution trailers anywhere (`hooks/commit-msg`). See AGENTS.md and CONTRIBUTING.md.
