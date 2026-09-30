# 025 · Development

Document ID: **GDT-025**.

[Paired view](../docs/025-development.md).

<a id="gdt-025-005"></a>

## 005 · Build

Block ID: **GDT-025-005**.

`npm install`, `node build.mjs` → `dist/`. Test page runtime from `GRAMLOT_RUNTIME` (default `../gramlot/js/dist/gramlot.js`, skipped when missing). Panel dependencies remain pinned to Bag 0.5.3 and TYTX 0.15.1.

<a id="gdt-025-010"></a>

## 010 · Tests

Block ID: **GDT-025-010**.

Four suites: protocol (node), feasibility, e2e, DevTools (Playwright Chromium, back/forward cache enabled). The DevTools suite uses an internal frontend path. Also check in Google Chrome: headless missed three defects.

With the Gramlot 0.2.0 runtime, the pinned panel libraries read the Data and Source rows but omit the Source wire metadata `__cls: "GramlotBuilderBag"`. Five e2e checks and three DevTools checks fail on exact Source TYTX comparisons, also on the unmodified baseline. Dependency upgrades require a separate decision.

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
