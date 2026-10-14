# 020 · Architecture

Document ID: **GDT-020**.

[Paired view](../docs/020-architecture.md).

<a id="gdt-020-005"></a>

## 005 · Components

Block ID: **GDT-020-005**.

Agent (MAIN world) ↔ content script (ISOLATED) via `window.postMessage`; content ↔ service worker ↔ panel via runtime ports. The panel runs the PoC inspector on copies. The agent bundles no library and encodes with the page Bag class.

<a id="gdt-020-010"></a>

## 010 · Protocol

Block ID: **GDT-020-010**.

Shape `{channel: 'gramlot-devtools', v: 1, id, type, payload}`. Page → panel: `hello`, `visibility`, `snapshot`, `change`, `result`, `bye`. Panel → page: `subscribe`, `unsubscribe`, `setValue`, `setAttributes`, `deleteAttribute`, `setBreakpoints`. TYTX values; null attribute = remove in partial updates. Frames in control envelopes. Payloads in the README.

<a id="gdt-020-015"></a>

## 015 · Copies and commands

Block ID: **GDT-020-015**.

The panel registers the wire subtype `GramlotBuilderBag` with TYTX under `X`,
mapped to `GramlotSourceCopy`, a passive Bag subclass. This preserves the Source
class metadata on decode and re-encode without attaching a renderer or builder.
Plain Data Bags keep their own subtype.

Copies change only from `snapshot`/`change`; edits are commands; no optimistic update; a change that cannot be applied triggers a new snapshot.

<a id="gdt-020-020"></a>

## 020 · Injection and lifetime

Block ID: **GDT-020-020**.

On-demand `chrome.scripting` injection in all frames, plus per-frame on `webNavigation.onCompleted`. Panel pings every 20 s against service worker shutdown and reconnects. Back/forward cache: content closes its port on persisted `pagehide`, reopens on `pageshow`.

Each agent observes its document with IntersectionObserver and sends `visibility {visible: boolean}` on connection and changes, independently of instance discovery. The panel preserves visibility across `hello` messages; disconnecting the agent also disconnects the observer.
