# 010 · Usage

Document ID: **GDT-010**.

[Paired view](../docs/010-usage.md).

<a id="gdt-010-005"></a>

## 005 · Install and load

Block ID: **GDT-010-005**.

Unzip a release or build `dist/`; `chrome://extensions` → Developer mode → Load unpacked. `file://` pages also need **Allow access to file URLs**. The panel is a main-bar DevTools tab, not a drawer view. After a rebuild: reload the extension and reopen DevTools. Hosts: `localhost`, `127.0.0.1` (any port), `file:///*`.

<a id="gdt-010-010"></a>

## 010 · Trees and editing

Block ID: **GDT-010-010**.

Data and Source tabs: trees plus property editor. An edit commits when focus leaves the row, travels as a command, and the copy follows the page event (no optimistic update). Source attribute edits update the DOM. Bag values and node insertion/removal are not editable.

<a id="gdt-010-015"></a>

## 015 · Frames

Block ID: **GDT-010-015**.

One agent and at most one instance per frame; one inspected at a time, top frame first. With several instances a status-bar selector lists them by page title (path as tooltip). Iframes outside the host permissions are skipped.

<a id="gdt-010-020"></a>

## 020 · Breakpoints

Block ID: **GDT-010-020**.

Legacy-style breakpoints, Data and Source: row `●` → Mode (Debugger/Console/None) and optional JS condition over `evt, node, value, oldvalue, attrs_diff, reason, path`. Exact path, every event. Conditions compile in the page (refused under a strict CSP; unconditioned breakpoints always work). Debugger pauses in `breakpointHit`; Console logs `** Gramlot breakpoint **`. Shown in the editor line and the status-bar list; resent after every reconnection.

<a id="gdt-010-025"></a>

## 025 · Lifecycle

Block ID: **GDT-010-025**.

Reload, back/forward cache restore and service worker restart reconnect with new snapshots. Pages without Gramlot and disposed instances show a message. Closing DevTools removes the agent, its subscriptions and its marker.
