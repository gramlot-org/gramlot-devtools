# 020 · Architecture

Document ID: **GDT-020**.

[Paired view](../docs_llm/020-architecture.md).

<a id="gdt-020-005"></a>

## 005 · Components

Block ID: **GDT-020-005**.

```text
Inspected tab (every accessible frame)
  agent.js     MAIN world: finds window.gramlot, serialises, subscribes,
               applies commands, checks breakpoints
     │ window.postMessage (channel 'gramlot-devtools', random session)
  content.js   ISOLATED world: bridge
     │ chrome.runtime port 'gramlot-devtools-content'
  background.js  service worker: routes per tab and frame, injects on demand
     │ chrome.runtime port 'gramlot-devtools-panel'
DevTools
  devtools.js  chrome.devtools.panels.create('Gramlot')
  panel.js     PoC runtime + inspector on copies of the Bags
```

The agent bundles no library: it encodes with the page's own Bag class (`gramlot.data.constructor`).

<a id="gdt-020-010"></a>

## 010 · Protocol

Block ID: **GDT-020-010**.

Every message has the shape `{channel: 'gramlot-devtools', v: 1, id, type, payload}`.

- Page → panel: `hello`, `visibility`, `snapshot`, `change`, `result`, `bye`.
- Panel → page: `subscribe`, `unsubscribe`, `setValue`, `setAttributes`, `deleteAttribute`, `setBreakpoints`.
- Values and attributes travel as TYTX text. In attribute payloads a null means "remove" and an absent name means "unchanged"; in a Bag the two are the same, so the wrapper keeps the nulls.
- Frames travel in control envelopes around protocol messages (`to-frame`, `frame`, `frame-detached`); protocol messages are never rewritten.

The README lists every payload.

<a id="gdt-020-015"></a>

## 015 · Copies and commands

Block ID: **GDT-020-015**.

The panel copies change only from `snapshot` and `change` messages. Edits become commands; the page applies them and the copy follows the change event that comes back. There is no optimistic update. When a change cannot be applied, the panel takes a new snapshot.

<a id="gdt-020-020"></a>

## 020 · Injection and lifetime

Block ID: **GDT-020-020**.

- Injection with `chrome.scripting` into all accessible frames when the panel opens, and into one frame after each completed load of that frame (`chrome.webNavigation.onCompleted`).
- Chrome stops an idle MV3 service worker after about 30 seconds. The panel pings every 20 seconds and reconnects if the port closes anyway.
- Back/forward cache: the content script closes its port on `pagehide` (persisted) and opens a new one on `pageshow`; the agent stays installed and announces itself again.

Each agent observes its document with IntersectionObserver and sends `visibility {visible: boolean}` on connection and changes, independently of instance discovery. The panel preserves visibility across `hello` messages; disconnecting the agent also disconnects the observer.
