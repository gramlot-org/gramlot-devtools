# FINALDOC — Gramlot DevTools for Chrome

Date: 2026-09-25. Branch `inspector-provvisorio` of gramlot-poc, worktree
`/Users/gporcari/Sviluppo/gramlot/worktrees/inspector-provvisorio`.
Implementation commit: `5f613e3`. Not pushed.

## What is done

- Step 1, feasibility: the PoC runtime and inspector, recipe
  `inspector.tytx`, run in an MV3 extension page on local Bags with no eval.
  Result: positive. The PoC runtime contains `new Function` in
  `js/dom/src/logic/expression.js` and `js/dom/src/collections/grid-formulas.js`,
  but mounting, rendering, selecting, editing and live updates of the
  inspector never reach them. No CSP violation, no console error.
- Extension skeleton: `manifest.json` (MV3), `devtools_page`, service worker,
  content script, page agent.
- Agent and bridge: `hello`, `snapshot`, `change` for Data and Source; `bye`.
- Panel: the PoC inspector on panel-side copies. Data and Source trees,
  selection, typed property editor, live update.
- Edit commands: `setValue`, `setAttributes`, `deleteAttribute`, each with a
  `result` reply. No optimistic update.
- `evaluate`: both modes implemented and compared (see Choices).
- Lifecycle: reload reconnects with a new snapshot; closing DevTools
  unsubscribes and removes every agent listener; a page without Gramlot shows
  "No Gramlot instance in this page."; `gramlot.dispose()` shows
  "The Gramlot instance was removed.".
- README with purpose, owner interpretation, build, loading, protocol, limits.
- Tests: protocol unit tests (node) and three headless Chromium scripts.

Nothing outside `tools/gramlot-devtools-chrome/` was modified. The Gramlot
repository was only read; its `dist/gramlot.js` is copied into
`test-page/vendor/` by `build.mjs`.

## Acceptance criteria

Evidence comes from headless Chromium (Chrome for Testing 153, Playwright
1.63 from the gramlot-rosetta checkout), with the unpacked extension loaded.
Two hosting modes were used:

- **DevTools**: `tests/devtools.mjs`. DevTools opened with
  `--auto-open-devtools-for-tabs`; the Gramlot panel selected through the
  DevTools frontend; the panel iframe driven over CDP.
- **Tab**: `tests/e2e.mjs`. The same `panel.html` opened as a tab with
  `?tabId=N`. Same agent, content script, background and panel code;
  `chrome.devtools.*` absent.

The owner's Google Chrome was not used: loading an unpacked extension there
needs the owner.

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | "Gramlot" panel appears in DevTools of the test page | Verified headless (DevTools); pending in owner Chrome | DevTools tab id `chrome-extension://<id>Gramlot` present; `showPanel` loads `panel.html`, which connects (`hello`, 2 `snapshot`) |
| 2 | Data and Source trees show full structure, values, attributes, nesting | Verified (DevTools + Tab) | Copy `toTytx('json')` text identical to the page's for both roots; tree labels include `customer/orders/o1/total` and `main/div_0/ul_0/li_0`; editor on `customer.born` shows `value` (date `1815-12-10`) and `note` |
| 3 | `gramlot.data.setItem('a.b', 1)` from the page appears without reload | Verified (DevTools + Tab) | Copy has `a.b === 1`, tree shows branch `a`; delete and attribute-only updates also follow |
| 4 | Editing a Data value in the panel reaches `gramlot.data` | Verified (Tab); pending in owner Chrome | Editor edit `customer.name` → page value `Grace`, then copy `Grace`; number `99.25` stays a number |
| 5 | Editing a Source attribute (`class`) changes the page DOM | Verified (Tab); pending in owner Chrome | `main.div_0` class `x` → `y`: `#box.className === 'y'`. Attribute removal on `main.div_0.p_0` removes the DOM `class` attribute |
| 6 | Page reload reconnects the panel | Verified (DevTools + Tab) | New `hello` and snapshots after `reload()`; copies equal the page again |
| 7 | `evaluate` returns the result of a simple expression computed in the page | Verified (DevTools: both modes; Tab: agent) | `gramlot.data.getItem("customer.name") + " " + (6 * 7)` → `"Ada 42" (string)`; a date result keeps its type |
| 8 | No console errors, page or panel | Verified (DevTools + Tab), except the expected refusal on `csp.html` | Console error/warning and exception listeners on page and panel: empty. On `csp.html` the agent-mode evaluate is refused by the page CSP, as designed |
| 9 | The inspected page does not load the PoC runtime | Verified (Tab) | Requests of the test origin: `/index.html`, `/page.js`, `/vendor/gramlot.js` only; no `chrome-extension:` script element. The agent is injected by `chrome.scripting` and bundles no Bag, TYTX or PoC code |

Not verified by any script: the service worker console (only page and panel
consoles were watched); editing inside the DevTools-hosted panel (the edit
path was driven in Tab mode only).

## How to use

```sh
cd /Users/gporcari/Sviluppo/gramlot/worktrees/inspector-provvisorio/tools/gramlot-devtools-chrome
node build.mjs
cd test-page && python3 -m http.server 8765
```

1. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** →
   `tools/gramlot-devtools-chrome/dist`.
2. Open `http://127.0.0.1:8765/index.html`, open DevTools, select **Gramlot**.

Checks from the test suites:

```sh
node --test tests/protocol.test.mjs
node tests/feasibility.mjs
node tests/e2e.mjs
node tests/devtools.mjs
```

### Manual verification steps for the owner (Google Chrome)

An edit is committed when focus leaves the edited row (click outside the
row). Moving between cells of the same row does not commit.

1. Criterion 1: the **Gramlot** tab is in DevTools (it can be in the `»`
   overflow menu). The status line reads `Gramlot instance gramlot-1`.
2. Criterion 2: Data tab: expand `customer` → `orders` → `o1`; select
   `total`: value `12.5`, attribute `currency = EUR`. Source tab: expand
   `main` → `div_0` → `ul_0`; select `div_0`: attributes `id`, `class`.
3. Criterion 3: page console: `gramlot.data.setItem('a.b', 1)`. The Data tree
   shows `a` → `b` without reload.
4. Criterion 4: Data tab, select `customer.name`, type `Grace`, click
   outside the row.
   Page console: `gramlot.data.getItem('customer.name')` → `'Grace'`.
5. Criterion 5: Source tab, select `main.div_0`, set `class` to `y`, click
   outside the row. The heading turns red (`.y` rule); Elements shows `class="y"`.
6. Criterion 6: reload the page (F5). The panel shows `Page unloaded…`, then
   the instance again with fresh trees.
7. Criterion 7: type `6 * 7` in the expression field, **Evaluate**:
   `42 (number)`. Repeat with mode `agent`. On `csp.html`, `agent` returns an
   `EvalError`; `inspectedWindow.eval` returns `42 (number)`.
8. Criterion 8: during steps 1–7 the page console and the panel console
   (right-click in the panel → Inspect) show no errors, except the
   `unsafe-eval` refusal of step 7 on `csp.html`. In the panel console,
   `gramlotDevtools.violations` is `[]`.
9. Criterion 9: Network tab of the page, reload: only `index.html`,
   `page.js`, `vendor/gramlot.js`.
10. Lifecycle: navigate to `plain.html`: `No Gramlot instance in this page.`
    Close DevTools, then in the page console:
    `window[Symbol.for('gramlot-devtools.agent')]` → `undefined`.

## Limits

See README "Known limits". Main ones:

- One instance (`window.gramlot`), top frame only.
- After a committed edit the editor reloads the node when the change comes
  back; focus moved to another row of the same node is lost.
- Bag values and node insertion/removal are not editable from the panel.
- `tests/devtools.mjs` depends on an internal DevTools frontend module path.

## Choices

- **evaluate: default `inspectedWindow.eval`.** Observed: on `csp.html`
  (`script-src 'self'`) the agent mode fails with `EvalError`, because the
  agent's `new Function` runs in the page and the page CSP applies.
  `chrome.devtools.inspectedWindow.eval` works on both pages. Both modes stay
  selectable; outside DevTools only the agent mode exists. Both evaluate in
  the page and return TYTX-encoded results built with the page's Bag class.
  `inspectedWindow.eval` does not travel over the extension protocol: the
  panel builds the code string and DevTools runs it.
- **Panel recipe: `inspector-embedded.tytx`.** Step 1 used `inspector.tytx`
  as the brief states. In the panel, `inspector.tytx` renders a floating
  palette whose close button hides the whole inspector with no way to reopen
  it (the toggle is keyboard/launcher based). The embedded recipe, from the
  same generated build, fills the panel. Both recipes are copies of
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
  (permission `scripting`, host permissions `http://localhost/*` and
  `http://127.0.0.1/*`), not a static
  content script on every page.
- **Instance detection:** the agent checks `window.gramlot` at `connect` and
  every 500 ms while connected; the timer stops at `disconnect`.

## Owner decisions (2026-09-25)

1. `evaluate`: default `inspectedWindow.eval`; the agent mode stays
   selectable. No change.
2. Panel recipe: `inspector-embedded.tytx`. No change.
3. Host permissions restricted to `http://localhost/*` and
   `http://127.0.0.1/*` (any port). Changed in `src/manifest.json`.
4. Status line and evaluate form stay plain HTML/DOM. No change.
5. `dist/` is not committed; it is built with `node build.mjs`. No change.
6. Absolute default paths overridable by environment variables are
   acceptable; they are documented in the README. No change.
7. Null attributes: not a defect, no report. In a Bag an absent attribute and
   a null attribute are the same thing, so `Bag.fromTytx` is consistent in
   not rebuilding them. TYTX encodes nulls correctly. The wrapper encoding of
   `attrs` stays, because in a partial update absent means unchanged and null
   means remove. Comments in `src/protocol.js` and the README were corrected.
