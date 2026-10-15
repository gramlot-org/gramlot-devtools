# 020 · Architecture

Document ID: **GDT-020**.

[Paired view](../docs/020-architecture.md).

<a id="gdt-020-005"></a>

## 005 · Components

Block ID: **GDT-020-005**.

The extension imports two optional package entries:

- `@gramlot/gramlot/tools/inspector`: component and `InspectorConnection` in the extension panel.
- `@gramlot/gramlot/tools/inspector-agent`: page agent, without a bundled runtime or Bag class.

The component is declared as `<gramlot-tools-inspector embedded>`. It owns Data,
Source, Styles, editing and breakpoint UI. Chrome's frame selector surrounds it.
`panel.js` supplies one explicit connection for the chosen frame. `agent.js`
finds `window.gramlot` and attaches the shared agent using a native MessageChannel.
The shared agent encodes with the inspected page's own Bag constructor.

Messages cross the existing chain: page MAIN world → `window.postMessage` →
content script ISOLATED world → Chrome runtime port → background service worker →
panel. A MessageChannel at each end adapts that chain to the shared port contract.
No core-to-extension dependency, runtime discovery hook or PoC copy remains.

<a id="gdt-020-010"></a>

## 010 · Protocol

Block ID: **GDT-020-010**.

The Chrome envelope is `{channel: 'gramlot-devtools', v: 2, id, type, payload}`.
Version 1 is rejected; there is no compatibility translation.

- Discovery/lifecycle: `connect`, `disconnect`, `hello`, `visibility`, `bye`.
- Selection: `inspect {instanceId, connectionId}`, `uninspect {connectionId}`.
- Shared traffic: `inspector {connectionId, data}`; page replies also identify `instanceId`.
- Chrome routing wraps messages in `to-frame`, `frame`, `frame-detached` control envelopes.

The random content session and selected frame, instance and connection IDs isolate
old replies from a replacement selection. Shared `data` is forwarded unchanged:
snapshots, edits, breakpoints, refresh, Styles operations and their results are
owned by Gramlot, not reimplemented here.

<a id="gdt-020-015"></a>

## 015 · Copies and commands

Block ID: **GDT-020-015**.

`InspectorConnection` keeps passive Bags from shared node descriptors. Snapshots
preserve ordered labels, supported scalar types (TYTX), attributes, identity and
revision. Branches stay passive; no Source subtype registration or renderer is
attached to these copies. `_meta` is deliberately omitted and unsupported values
are read-only descriptors. These are inspectable copies, not exact Source wire
round trips. Resolvers remain unevaluated.

Edits carry node identity and revision; the shared page agent validates every
patch before writing the owning Bag. The UI follows acknowledged state, without
optimistic mutations. Breakpoint conditions compile only in the inspected page,
subject to its CSP. The panel keeps successful breakpoint configurations and
replays them after reconnection. CSS previews belong to the active connection;
closing or replacing it removes the owned preview stylesheet.

<a id="gdt-020-020"></a>

## 020 · Injection and lifetime

Block ID: **GDT-020-020**.

Chrome injects into accessible frames when DevTools opens and on frame load.
The panel pings its service worker every 20 seconds and reconnects closed ports.
The content script closes its port on persisted `pagehide` and reconnects on
`pageshow`. The agent observes document visibility with IntersectionObserver,
independently of instance discovery. Frame selection preserves manual choices
until iframe visibility changes.

Uninspect, instance replacement, pagehide and panel close release the shared
agent, both Bag subscriptions, breakpoints, CSS previews and MessagePorts.
Closing the panel also uninstalls discovery listeners, timer and observer.
