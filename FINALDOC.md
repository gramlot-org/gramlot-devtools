# FINALDOC — Gramlot DevTools for Chrome

Date: 2026-09-25. Branch `inspector-provvisorio` of gramlot-poc, worktree
`/Users/gporcari/Sviluppo/gramlot/worktrees/inspector-provvisorio`.
First delivery: `5f613e3`. Changes after the owner's review: `4eeed7b` to
`4262876` (list below). Not pushed.

## What is done

- Feasibility: the PoC runtime and inspector run in an MV3 extension page on
  local Bags with no eval. The PoC runtime contains `new Function` in
  `js/dom/src/logic/expression.js` and `js/dom/src/collections/grid-formulas.js`,
  but mounting, rendering, selecting, editing and live updates of the
  inspector never reach them. No CSP violation, no console error.
- Extension: `manifest.json` (MV3), `devtools_page`, service worker, content
  script, page agent, panel.
- Agent and bridge: `hello`, `snapshot`, `change` for Data and Source; `bye`.
  One agent per frame.
- Panel: the PoC inspector on panel-side copies. Data and Source trees,
  selection, typed property editor, live update. Frame selector when more
  than one frame holds an instance.
- Edit commands: `setValue`, `setAttributes`, `deleteAttribute`, each with a
  `result` reply. No optimistic update.
- Lifecycle: reload, back/forward cache restore and service worker restart
  reconnect with new snapshots; closing DevTools unsubscribes and removes
  every agent listener; a page without Gramlot shows
  "No Gramlot instance in this page."; `gramlot.dispose()` shows
  "The Gramlot instance was removed.".
- README with purpose, owner interpretation, build, loading, protocol, limits.
- Tests: protocol unit tests (node) and three headless Chromium scripts.

Nothing outside `tools/gramlot-devtools-chrome/` was modified. The Gramlot
repository was only read; its `dist/gramlot.js` is copied into
`test-page/vendor/` by `build.mjs`.

## Acceptance criteria

Verified in two ways:

- **Owner's Google Chrome** 154.0.8037.57, unpacked extension from `dist/`,
  test page `http://127.0.0.1:8765/index.html`, the 10 manual steps below.
  All passed on 2026-09-25.
- **Headless Chromium** (Chrome for Testing 153, Playwright 1.63 from the
  gramlot-rosetta checkout), back/forward cache enabled:
  - `tests/devtools.mjs`: DevTools opened with `--auto-open-devtools-for-tabs`,
    the Gramlot panel selected through the DevTools frontend, the panel
    iframe driven over CDP. 8 checks pass.
  - `tests/e2e.mjs`: the same `panel.html` opened as a tab with `?tabId=N`.
    21 checks pass.

| # | Criterion | Owner's Chrome | Headless evidence |
| --- | --- | --- | --- |
| 1 | "Gramlot" panel appears in DevTools of the test page | Passed | DevTools tab id `chrome-extension://<id>Gramlot` present; the panel connects (`hello`, 2 `snapshot`) |
| 2 | Data and Source trees show structure, values, attributes, nesting | Passed: `orders.o1.total` = `12.5`, `currency = EUR`; `div_0` shows `id`, `class` | Copy `toTytx('json')` identical to the page's for both roots |
| 3 | `gramlot.data.setItem('a.b', 1)` from the page appears without reload | Passed | Copy has `a.b === 1`; delete and attribute-only updates also follow |
| 4 | Editing a Data value in the panel reaches `gramlot.data` | Passed: `customer.name` → `'Grace'` | Page value `Grace`, then copy `Grace`; number `99.25` stays a number |
| 5 | Editing a Source attribute (`class`) changes the page DOM | Passed: heading turned red | `#box.className === 'y'`; attribute removal removes the DOM attribute |
| 6 | Page reload reconnects the panel | Passed | New `hello` and snapshots; copies equal the page again |
| 7 | `evaluate` returns a value computed in the page | Passed, then **removed by owner decision** (see Owner decisions) | — |
| 8 | No console errors, page or panel | Passed after fix `a2a9c61` (see below) | Page and panel console listeners: empty |
| 9 | The inspected page does not load the PoC runtime | Passed: Network shows only `index.html`, `page.js`, `gramlot.js` | Same request list |
| 10 | Lifecycle (manual step) | Passed: `plain.html` shows "No Gramlot instance"; Back reconnects; after closing DevTools the agent marker is `undefined` | Checks for navigation, back/forward cache, closing |

Criterion 8 in the owner's Chrome, panel console:

- `Unrecognized feature: 'proofreader'` (warning, `lit.js`): DevTools
  frontend, also present headless before the panel acts. Not the extension.
- `Unchecked runtime.lastError: The page keeping the extension port is moved
  into back/forward cache…` (twice): the extension. Fixed in `a2a9c61`.
- `Extension server error: Invalid argument entries: unexpected shortcut key`
  (`common.js`): not reproduced. It did not reappear after reloading with the
  other extensions still enabled, and never appears headless.

Not verified by any script: the DevTools frontend console and the service
worker console.

## How to use

```sh
cd /Users/gporcari/Sviluppo/gramlot/worktrees/inspector-provvisorio/tools/gramlot-devtools-chrome
node build.mjs
cd test-page && python3 -m http.server 8765
```

1. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** →
   `tools/gramlot-devtools-chrome/dist`.
2. For `file://` pages: extension **Details** → **Allow access to file URLs**.
3. Open `http://127.0.0.1:8765/index.html`, open DevTools, select **Gramlot**.
   Extension panels live in the main DevTools tab bar only; the drawer
   cannot hold them.
4. After a rebuild: reload icon on the extension card, then close and reopen
   DevTools.

Checks from the test suites:

```sh
node --test tests/protocol.test.mjs
node tests/feasibility.mjs
node tests/e2e.mjs
node tests/devtools.mjs
```

### Manual verification steps (Google Chrome)

An edit is committed when focus leaves the edited row (click outside the
row). Moving between cells of the same row does not commit.

1. The **Gramlot** tab is in DevTools (it can be in the `»` overflow menu).
   Once connected with one instance, the status bar is hidden; the trees fill
   the panel.
2. Data tab: expand `customer` → `orders` → `o1`; select `total`: value
   `12.5`, attribute `currency = EUR`. Source tab: expand `main` → `div_0`;
   select `div_0`: attributes `id`, `class`.
3. Page console: `gramlot.data.setItem('a.b', 1)`. The Data tree shows
   `a` → `b` without reload.
4. Data tab, select `customer.name`, type `Grace`, click outside the row.
   Page console: `gramlot.data.getItem('customer.name')` → `'Grace'`.
5. Source tab, select `main.div_0`, set `class` to `y`, click outside the
   row. The heading turns red (`.y` rule); Elements shows `class="y"`.
6. Reload the page. The panel shows `Page unloaded…`, then fresh trees.
7. Open `csp.html` (`script-src 'self'`): the panel connects as on
   `index.html`.
8. The page console and the panel console (right-click in the panel →
   Inspect) show no errors. In the panel console, `gramlotDevtools.violations`
   is `[]`.
9. Network tab, reload: only `index.html`, `page.js`, `vendor/gramlot.js`.
10. Navigate to `plain.html`: `No Gramlot instance in this page.` Back: the
    panel reconnects without reload. Switch to Console, close DevTools,
    reopen it (it opens on Console, so the agent is not injected again):
    `window[Symbol.for('gramlot-devtools.agent')]` → `undefined`.

For iframes: `http://127.0.0.1:8765/frames.html`; the selector lists the two
frames by page title, with the frame path as tooltip.

## Limits

See README "Known limits". Main ones:

- One instance per frame (`window.gramlot` of each frame). Iframes from
  origins outside the host permissions are not inspected.
- After a committed edit the editor reloads the node when the change comes
  back; focus moved to another row of the same node is lost.
- Bag values and node insertion/removal are not editable from the panel.
- The test page shows no Data in the page: its Source has fixed texts and
  the Gramlot runtime does not resolve `^` pointers yet (binding, plan phases
  S01/S02). The owner will look at it after the binding.
- `tests/devtools.mjs` depends on an internal DevTools frontend module path.

## Choices

- **Panel recipe: `inspector-embedded.tytx`.** `inspector.tytx` renders a
  floating palette whose close button hides the whole inspector with no way
  to reopen it (the toggle is keyboard/launcher based). The embedded recipe,
  from the same generated build, fills the panel. Both recipes are copies of
  `gramlot-poc/src/gramlot/resources/pages/*.tytx`; the source hashes in
  that build's `manifest.json` match this worktree's `inspector.py`,
  `inspector.js` and `inspector-editor.js`.
- **Adapted copies, not imports,** of `inspector.js`, `inspector-editor.js`
  and `builder.js`: the editor's `apply()` hands the edit to a sink instead of
  writing the Bag; the builder registers only `layout`, `storeTree`,
  `palette`; no shortcuts or DeveloperTools registry.
- **Library versions:** in the panel bundle `genro-bag-js` and `genro-tytx`
  resolve to Gramlot's `@jsr/genro__bag` 0.5.3 and `@jsr/genro__tytx` 0.15.1,
  so both sides share library versions.
- **SourceBag suffix:** Gramlot's SourceBag (`@jsr/genro__builders`) uses TYTX
  suffix `SOURCE`; the PoC SourceBag uses `XS`. The panel registers a plain
  Bag subclass for `SOURCE` (`src/panel-bags.js`) instead of bundling the
  Gramlot builder.
- **The agent bundles no library.** It encodes with the page's own Bag class
  (`gramlot.data.constructor`). A second TYTX registry in the agent would not
  know the page's Bag classes.
- **On-demand injection** with `chrome.scripting` while the panel is open
  (permissions `scripting` and `webNavigation`, host permissions
  `http://localhost/*`, `http://127.0.0.1/*` and `file:///*`), not a static
  content script on every page.
- **Instance detection:** the agent checks `window.gramlot` at `connect` and
  every 500 ms while connected; the timer stops at `disconnect`.
- **Data/Source tabs:** darker and larger through the custom properties of
  the PoC tab container, set in `src/panel.css`; the PoC is not modified.

## Owner decisions (2026-09-25)

1. `evaluate`: first `inspectedWindow.eval` as default (the agent mode fails
   with `EvalError` under a strict page CSP). Then removed entirely: the
   DevTools Console already evaluates in the page. No code is evaluated by
   the panel or the agent. Criterion 7 of the brief is dropped.
2. Panel recipe: `inspector-embedded.tytx`.
3. Host permissions `http://localhost/*` and `http://127.0.0.1/*` (any port),
   plus `file:///*`.
4. The status bar stays plain HTML/DOM; it shows only messages and the frame
   selector, and is hidden when it has nothing to show.
5. `dist/` is not committed; it is built with `node build.mjs`.
6. Absolute default paths overridable by environment variables are
   acceptable; they are documented in the README.
7. Null attributes: not a defect, no report. In a Bag an absent attribute and
   a null attribute are the same thing, so `Bag.fromTytx` is consistent in
   not rebuilding them. TYTX encodes nulls correctly. The wrapper encoding of
   `attrs` stays, because in a partial update absent means unchanged and null
   means remove.
8. Iframes are inspected; the selector labels frames by page title.
9. Source ↔ DOM (next work): read `gramlot.renderer` (`records`: Source node
   → record with `element`; `elements`: element → record with `node`) in read
   only. In GenroPy legacy the link sits on the objects themselves
   (`genro_wdg.js` `linkSourceNode`: `sourceNode.domNode` or
   `sourceNode.widget`, and `newobj.sourceNode`); restoring it in Gramlot is
   a separate Gramlot decision.

## Changes after the first delivery

| Commit | Change | Found by |
| --- | --- | --- |
| `4eeed7b` | Host permissions restricted; owner decisions recorded | Owner decision |
| `315d64f` | Panel pings the service worker every 20 s and reconnects if the port closes: Chrome stopped the idle worker and the panel went empty. Headless missed it because Playwright keeps a debugger attached to the worker | Owner's Chrome |
| `18c9e33` | `file:///*`; iframes: one agent per frame, per-frame routing, frame selector, injection on each frame load | Owner request |
| `5bb8797`, `5e3fedc` | Frame labels: page title, path as tooltip; darker Data/Source tabs | Owner request |
| `0eabf90` | Evaluate mode selector and connected status text removed | Owner request |
| `a2a9c61` | `runtime.lastError` read when ports close (back/forward cache) | Owner's Chrome |
| `bc3086c` | Reconnect after a back/forward cache restore: the content script closes its port on `pagehide` (persisted) and opens a new one on `pageshow`. Headless missed it because Playwright disables the cache; the browser tests now enable it | Owner's Chrome |
| `4262876` | `evaluate` removed | Owner decision |

## Next work (agreed order)

1. Watches on a Data or Source path: value or attribute, structured
   conditions (`>`, `>=`, `<`, `<=`, `==`, `!=`, contains, any change),
   action `log` or `break` (`debugger` in the agent), kept by the panel and
   sent again at every `hello`. No eval.
2. Source ↔ DOM through `gramlot.renderer`: "Reveal in Elements", selection
   from Elements to the Source tree, a "Gramlot" sidebar pane in Elements.
3. Tests: watch the DevTools frontend console and the service worker
   console in `tests/devtools.mjs`.
