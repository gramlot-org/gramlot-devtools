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

An edit is committed when focus leaves the edited row; moving between cells of the same row does not commit. The panel sends the edit to the page as a command (`setValue`, `setAttributes`, `deleteAttribute`). The page applies it to the real Bag, and the panel copy changes only when the page reports the change back. A Source attribute change updates the page DOM through the Gramlot renderer.

Bag values and node insertion or removal are not editable from the panel.

<a id="gdt-010-015"></a>

## 015 · Frames

Block ID: **GDT-010-015**.

Every frame of the inspected tab has its own agent and at most one instance (`window.gramlot` of that frame). The panel inspects one instance at a time, top frame first. When more than one frame holds an instance, a selector in the status bar lists them by page title, with the frame path as tooltip. Iframes from origins outside the host permissions are not inspected.

<a id="gdt-010-020"></a>

## 020 · Breakpoints

Block ID: **GDT-010-020**.

Breakpoints imitate the GenroPy legacy data breakpoints and also apply to the Source.

- Hover a tree row and click `●`. The dialog asks for **Mode** (Debugger, Console, None to remove) and an optional **Condition**.
- A breakpoint fires on the exact path of the changed node, for every event (`upd_value`, `upd_attrs`, `upd_value_attr`, `ins`, `del`).
- The condition is a JavaScript expression over `evt`, `node`, `value`, `oldvalue`, `attrs_diff`, `reason`, `path`, for example `value > 78` or `evt === 'upd_attrs'`. The agent compiles it in the page. Under a page CSP without `'unsafe-eval'` the compilation is refused and the panel shows the error; breakpoints without a condition always work.
- **Debugger** pauses the page in `breakpointHit`; the caller of `setItem` or `setAttr` is lower in the call stack. **Console** logs `** Gramlot breakpoint **` with root, path, event and reason.
- Active breakpoints show in a line above the properties of the selected node and in the `N breakpoints` button of the status bar, which opens the list (Edit, Remove).
- The panel keeps the breakpoints and sends them again after every reconnection, so they survive reloads and frame changes.

<a id="gdt-010-025"></a>

## 025 · Lifecycle

Block ID: **GDT-010-025**.

- Page reload, restore from the back/forward cache and a service worker restart reconnect the panel with new snapshots.
- A page without Gramlot shows `No Gramlot instance in this page.`; a disposed instance shows `The Gramlot instance was removed.`
- Closing DevTools unsubscribes the agent from both Bags and removes its listeners and its marker `window[Symbol.for('gramlot-devtools.agent')]`.
