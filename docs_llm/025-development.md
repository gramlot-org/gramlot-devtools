# 025 · Development

Document ID: **GDT-025**.

[Paired view](../docs/025-development.md).

<a id="gdt-025-005"></a>

## 005 · Build

Block ID: **GDT-025-005**.

`npm install`, `node build.mjs` → `dist/`. Test page runtime from `GRAMLOT_RUNTIME` (default `../gramlot/js/dist/gramlot.js`, skipped when missing). Bag 0.5.3 and TYTX 0.15.1 as in Gramlot.

<a id="gdt-025-010"></a>

## 010 · Tests

Block ID: **GDT-025-010**.

Four suites: protocol (node), feasibility, e2e, DevTools (Playwright Chromium, back/forward cache enabled). The DevTools suite uses an internal frontend path. Also check in Google Chrome: headless missed three defects.

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
