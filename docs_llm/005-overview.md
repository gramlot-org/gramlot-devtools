# 005 · Overview

Document ID: **GDT-005**.

[Paired view](../docs/005-overview.md).

<a id="gdt-005-005"></a>

## 005 · Purpose

Block ID: **GDT-005-005**.

Chrome MV3 extension: a **Gramlot** DevTools panel that shows and edits the Data and Source Bags of a Gramlot page and sets breakpoints. The panel runs in the extension on copies; the page gets only a small agent while the panel is open.

<a id="gdt-005-010"></a>

## 010 · Status and boundaries

Block ID: **GDT-005-010**.

- External tool: Gramlot does not import, depend on, document or distribute it (owner: amendment 11.22 does not apply).
- Chrome only.
- No code evaluation in the panel; the agent compiles breakpoint conditions in the page.
- Provisional: vendored PoC runtime until Gramlot is published.

<a id="gdt-005-015"></a>

## 015 · Relation to Gramlot

Block ID: **GDT-005-015**.

The agent uses `window.gramlot`, `gramlot.data`, `gramlot.src.source` and public Bag APIs only; Gramlot is never modified. Planned: Source ↔ DOM through `gramlot.src.renderer` in read only (owner decision); a legacy-style `sourceNode.domNode` link in Gramlot is a separate Gramlot decision.

Owner confirmation, 2026-10-14: update the extension to the current Gramlot API
("si aggiorna"). The Source access is `gramlot.src.source`; the authorized read-only
renderer access is `gramlot.src.renderer`. This supersedes the old top-level paths
without adding legacy aliases or changes to Gramlot itself.
