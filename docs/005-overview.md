# 005 · Overview

Document ID: **GDT-005**.

[Paired view](../docs_llm/005-overview.md).

<a id="gdt-005-005"></a>

## 005 · Purpose

Block ID: **GDT-005-005**.

Gramlot DevTools is a Chrome extension (Manifest V3) that adds a **Gramlot** panel to Chrome DevTools. The panel shows and edits the Data Bag and the Source Bag of an open Gramlot page, and sets breakpoints on their nodes.

The panel runs in the extension. Its interface is the gramlot-poc inspector (tree, tabs, property editor) working on copies of the page Bags. The inspected page receives only a small agent, injected while the panel is open.

<a id="gdt-005-010"></a>

## 010 · Status and boundaries

Block ID: **GDT-005-010**.

- External development tool. Gramlot does not import it, depend on it, document it or distribute it. For this reason the owner rules that amendment 11.22 of the Gramlot constitution does not apply.
- Chrome only.
- The panel never evaluates code. The agent compiles only breakpoint conditions, inside the inspected page.
- Provisional: the panel uses a vendored copy of the PoC runtime until Gramlot is published.

<a id="gdt-005-015"></a>

## 015 · Relation to Gramlot

Block ID: **GDT-005-015**.

The agent uses only `window.gramlot`, `gramlot.data`, `gramlot.src.source` and public Bag APIs (`getNode`, `subscribe`, `unsubscribe`, `toTytx`, `fromTytx`, `node.setAttr`, `node.setValue`). The Gramlot repository is never modified by this tool.

Planned: a Source ↔ DOM link that reads `gramlot.src.renderer` (`records`, `elements`) in read only, an accepted owner decision. In GenroPy legacy the same link sits on the objects (`sourceNode.domNode`, `element.sourceNode`); restoring it in Gramlot is a separate Gramlot decision.

Owner confirmation, 2026-10-14: update the extension to the current Gramlot API
("si aggiorna"). The Source access is `gramlot.src.source`; the authorized read-only
renderer access is `gramlot.src.renderer`. This supersedes the old top-level paths
without adding legacy aliases or changes to Gramlot itself.
