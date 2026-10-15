# 010 · Usage

Document ID: **GDT-010**.

[Paired view](../docs_llm/010-usage.md).

<a id="gdt-010-005"></a>

## 005 · Install and load

Block ID: **GDT-010-005**.

1. Get the extension: unzip `gramlot-devtools-<version>.zip` from the GitHub releases, or build `dist/` from source (see GDT-025).
2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked** and select the folder.
3. For pages opened as `file://`: extension **Details** → **Allow access to file URLs**. Chrome requires this switch in addition to the `file:///*` host permission.
4. Open DevTools on a Gramlot page and select the **Gramlot** tab. Extension panels live in the main DevTools tab bar; the drawer cannot hold them.
5. After a rebuild: press the reload icon on the extension card, then close and reopen DevTools.

Host permissions cover `http://localhost/*`, `http://127.0.0.1/*` (any port) and `file:///*`.

<a id="gdt-010-010"></a>

## 010 · Trees and editing

Block ID: **GDT-010-010**.

The **Data** and **Source** tabs show the two Bags as trees. Selecting a node opens its value and attributes in the property editor.

An edit is committed when focus leaves the edited row; moving between cells of the same row does not commit. Enter also saves; Escape reloads the row. The shared connection sends a revision-checked `edit` command to the page. The page applies it to the real Bag, and the panel copy changes only when the page reports the change back. A Source attribute change updates the page DOM through the Gramlot renderer.

Bag values and node insertion or removal are not editable from the panel.

<a id="gdt-010-015"></a>

## 015 · Frames

Block ID: **GDT-010-015**.

Each frame has one agent and at most one Gramlot instance. The selector lists the base window and visible iframes with an instance, by page title (path in the tooltip); hidden iframes are excluded. A newly visible iframe is selected automatically, refreshing Data and Source. A manual choice lasts until the next iframe visibility change. When a fallback is needed, visible iframes are preferred in frame-id order, then the base window. Iframes outside the host permissions are skipped. Visibility is measured by intersection with the viewport, including ancestor clipping; browser-tab focus does not choose a frame.

<a id="gdt-010-020"></a>

## 020 · Breakpoints

Block ID: **GDT-010-020**.

Breakpoints imitate the GenroPy legacy data breakpoints and also apply to the Source.

- Hover a tree row or focus its action and click the grey outlined circle on the left. The dialog asks for **Breakpoint mode** (Debugger, Console, None to remove) and an optional **Condition**.
- A breakpoint fires on the exact path of the changed node, for every event (`upd_value`, `upd_attrs`, `upd_value_attr`, `ins`, `del`).
- The condition is a JavaScript expression over `evt`, `node`, `value`, `oldvalue`, `attrs_diff`, `reason`, `path`, for example `value > 78` or `evt === 'upd_attrs'`. The agent compiles it in the page. Under a page CSP without `'unsafe-eval'` the compilation is refused and the panel shows the error; breakpoints without a condition always work.
- **Debugger** pauses the page in `hit`; the caller of `setItem` or `setAttr` is lower in the call stack. **Console** logs `** Gramlot breakpoint **` with root, path, event and reason.
- The Properties breakpoint counter opens the active list, including paths deleted from the Bag.
- The panel keeps the breakpoints and sends them again after every reconnection, so they survive reloads and frame changes.

The left circle is visible on hover or keyboard focus. Active breakpoints remain visible: red without a condition, yellow with one. Invalid or blocked conditions report an error and preserve the previous breakpoint configuration. Marks update without changing tree expansion, selection or focus. The toolbar and dialogs use compact controls.

<a id="gdt-010-025"></a>

## 025 · Lifecycle

Block ID: **GDT-010-025**.

- Page reload, restore from the back/forward cache and a service worker restart reconnect the panel with new snapshots.
- A page without Gramlot shows `No Gramlot instance in this page.`; a disposed instance shows `The Gramlot instance was removed.`
- Closing DevTools unsubscribes the agent from both Bags and removes its listeners and its marker `window[Symbol.for('gramlot-devtools.agent')]`.

<a id="gdt-010-030"></a>

## 030 · Styles and CSS download

Block ID: **GDT-010-030**.

**Styles** edits existing `--gramlot-*` variables on the selected document root.
Each row is name, value, colour picker, reset. Text saves with Enter or when focus
leaves the field; hexadecimal RGB colours also have a native picker. Refresh
reads external theme changes; Reset all removes the preview stylesheet.

Download CSS saves applied overrides in `theme-overrides.css`, including CSS
expressions and `!important`. Load it after the theme stylesheet. The link is
unavailable while an operation is pending or when there are no overrides.
These are temporary previews: changing the selected frame, reloading the page
or closing DevTools removes them. There is no persistence endpoint or theme
catalogue. The page must already load a Gramlot theme (or define root variables).

Strings, finite numbers, safe integers, booleans, null and UTC dates/times are
editable. Bag branches and unsupported values are read-only; `_meta` is omitted.
Deferred resolvers are never evaluated by inspection.
