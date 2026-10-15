# Gramlot DevTools for Chrome

Current version: **0.1.2**.

A Chrome extension (Manifest V3, loaded unpacked) that adds a **Gramlot**
panel to Chrome DevTools. The panel shows and edits the **Data Bag** and the
**Source Bag** of an open Gramlot page.

The panel UI is the gramlot-poc inspector (tree, tabs, property editor) with
the PoC runtime, vendored in `vendor/gramlot-poc/` until Gramlot is published. It runs outside the page, in the extension. The page only
receives a small agent (about 9 KB, no Bag or TYTX library, no PoC code),
injected by the extension while the panel is open.

## Documentation

- Guides: `docs/` (expanded) and `docs_llm/` (concise), namespace GDT, built
  with Sphinx and the Read the Docs theme (`.readthedocs.yaml`).
  Build locally: `python scripts/check_docs.py` (see `CONTRIBUTING.md`).
- Rules for contributors and coding agents: `AGENTS.md`, `CONTRIBUTING.md`.
  No AI, LLM or assistant references in commits, pull requests, code or
  documents.

## Owner interpretation

- This is an external development tool. Gramlot does not import it, depend on
  it, document it as its own or distribute it. For this reason amendment 11.22
  (`gramlot/docs/00-constitution.md:553-554`) does not apply.
- The Gramlot repository is not modified. The agent uses only
  `window.gramlot`, `gramlot.data`, `gramlot.src.source` and public Bag APIs
  (`getNode`, `subscribe`, `unsubscribe`, `toTytx`, `fromTytx`,
  `node.setAttr`, `node.setValue`).
- Chrome only.
- The panel runs no page code and uses no `eval`/`new Function` (forbidden in
  MV3 extension pages). The agent evaluates no code either. The owner removed
  the `evaluate` command: the DevTools Console already evaluates in the page.
- It replaces option A (bundle injected by a bookmarklet).

## Install a release

1. Download `gramlot-devtools-<version>.zip` from the
   [releases](https://github.com/gramlot-org/gramlot-devtools/releases) and
   unzip it.
2. Load the unzipped folder as described in "Load in Chrome".

## Build from source

Node 22 or later. Dependencies are installed locally from npm:

```sh
npm install --package-lock=false
npx playwright install chromium   # only for the browser tests
node build.mjs
```

Output: `dist/` (the extension) and `test-page/vendor/gramlot.js` (a copy of
the Gramlot runtime for the test page). Both are git-ignored.

| Variable | Default | Used for |
| --- | --- | --- |
| `GRAMLOT_RUNTIME` | `../gramlot/js/dist/gramlot.js` (sibling checkout of gramlot-org/gramlot) | test page runtime; skipped with a message when missing |

- Bag and TYTX: maintained npm packages `@genrojs/bag` and `@genrojs/tytx`.
  First-party dependencies are unconstrained and not frozen by a lockfile;
  refresh them with `npm update --package-lock=false`. Compatibility is checked
  through exact snapshots and live updates.
- PoC runtime: `vendor/gramlot-poc/`, an unmodified copy of the modules the
  panel bundle reaches, from gramlot-poc commit `10478b5`. It is removed when
  the panel moves to the published Gramlot package. See its README.

The inspected page must use the current Gramlot proxy API: Data at `gramlot.data`
and Source at `gramlot.src.source`. Legacy top-level Source aliases are not used.
The same detection applies to hosted pages and standalone pages; local files also
require the file-URL permission below.

## Load in Chrome

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select `dist/` (or the unzipped release folder).
3. For pages opened as `file://`: **Details** of the extension → enable
   **Allow access to file URLs**. Chrome requires this switch in addition to
   the `file:///*` host permission.
4. After a rebuild, press the reload icon of the extension card, then close
   and reopen DevTools.

## Test page

```sh
cd test-page
python3 -m http.server 8765
```

- `http://127.0.0.1:8765/index.html`: Gramlot page, embedded Source,
  `window.gramlot` set as in the real bootstrap.
- `http://127.0.0.1:8765/csp.html`: the same page with
  `Content-Security-Policy: script-src 'self'`.
- `http://127.0.0.1:8765/plain.html`: no Gramlot.
- `http://127.0.0.1:8765/frames.html`: no Gramlot in the top frame; two
  iframes, each with its own Gramlot instance.

Open DevTools on the page and select the **Gramlot** panel.

## Architecture

```text
Inspected tab
  agent.js    MAIN world: finds window.gramlot, serialises, subscribes, applies commands
     │ window.postMessage (channel 'gramlot-devtools', random session per connection)
  content.js  ISOLATED world
     │ chrome.runtime port 'gramlot-devtools-content'
  background.js (service worker): pairs panel and tab, injects on demand
     │ chrome.runtime port 'gramlot-devtools-panel'
DevTools
  devtools.html/js  chrome.devtools.panels.create('Gramlot')
  panel.html/js     PoC runtime + inspector on COPIES of the Bags
```

- The panel copies change only from `snapshot` and `change` messages.
- Edits in the panel become commands. The page applies them to the real Bags;
  the copy follows the change event that comes back. No optimistic update.
- One agent and one content script per frame. Injection: in all accessible
  frames when the panel opens (`attach`), and in one frame after each
  completed load of that frame (`chrome.webNavigation.onCompleted`), which
  covers reloads, navigation and iframes added later. Frames the host
  permissions do not cover are skipped.
- Frames: the panel keeps the frames that hold an instance. It inspects one
  at a time, automatically following visible iframes. When more than one
  eligible frame holds an instance, a selector in the status bar lists them by page title (`(top)` marks the top
  frame). Without a title, and in the option tooltip, a frame is shown by its
  path: `top`, or the frame URL relative to the top frame directory (path
  from the root on the same origin, full URL on another origin).
  The selector includes the base window and visible iframes only. Each agent
  observes its document with IntersectionObserver, so hidden ancestor panels
  exclude their iframes without runner-specific knowledge. A newly visible
  iframe is selected automatically; otherwise visible iframes are preferred
  in frame-id order, with the base window as fallback. A manual choice lasts
  until the next iframe visibility change. Choosing another frame unsubscribes
  the previous one and takes new Data and Source snapshots.
- Service worker lifetime: Chrome stops an idle MV3 service worker after
  about 30 s and closes its ports. The panel sends `{control: 'ping'}` every
  20 s while it is open; if the port closes anyway, the panel connects again,
  sends `attach` and receives new snapshots.
- Closing DevTools: background sends `detach`; content tells the agent to
  `disconnect`. The agent unsubscribes from both Bags, stops its timer,
  disconnects its visibility observer, removes its `message` and `pagehide`
  listeners and its marker
  (`window[Symbol.for('gramlot-devtools.agent')]`).

### Files

| File | Role |
| --- | --- |
| `src/manifest.json` | MV3 manifest: `scripting` and `webNavigation` permissions, host permissions `http://localhost/*`, `http://127.0.0.1/*`, `file:///*` |
| `src/protocol.js` | Protocol v1 constants, TYTX encoding helpers, change application. Imports nothing. |
| `src/agent.js` | Page agent |
| `src/content.js` | Content script bridge |
| `src/background.js` | Service worker router and injector |
| `src/devtools.*` | Registers the panel |
| `src/panel.*` | Panel |
| `src/panel-bags.js` | Bag classes of the copies (registers TYTX suffix `SOURCE`) |
| `src/inspector/panel-inspector.js` | Adapted copy of `js/pages/src/inspector.js` |
| `src/inspector/panel-editor.js` | Adapted copy of `js/pages/src/inspector-editor.js` |
| `src/inspector/panel-builder.js` | Adapted copy of `js/pages/src/builder.js` |
| `src/inspector/*.tytx` | Copies of the generated recipes `inspector.tytx` / `inspector-embedded.tytx` |
| `src/feasibility.*` | Step 1 page: inspector on local Bags in an extension page (not in release zips) |
| `vendor/gramlot-poc/` | Vendored PoC runtime modules and `inspector.css` (temporary) |

## Protocol (version 1)

Every message: `{channel: 'gramlot-devtools', v: 1, id, type, payload}`.
Between content script and agent two routing fields are added: `dir`
(`to-page` / `to-panel`) and `session`.

Values travel as TYTX text:

- `tytxValue`: a Bag value is its own `toTytx('json')` text, with `bag` set to
  its TYTX suffix (`X`, or `SOURCE` for a Gramlot SourceBag). Any other value
  is the TYTX text of a one-node wrapper Bag (`v`), so dates, decimals and
  nulls keep their type.
- `attrs`: TYTX text of a one-node wrapper Bag carrying the attributes. When an
  attribute is null, the wrapper value is the ordered list of attribute names.
  In a Bag an absent attribute and a null attribute are the same thing, so
  `Bag.fromTytx` does not rebuild null attributes; in a partial update they
  differ (absent: unchanged; null: remove), and the list keeps the nulls.

Page → panel:

| Type | Payload |
| --- | --- |
| `visibility` | `{visible: boolean}`, independent of an instance; sent on connection and visibility changes |
| `hello` | `{instances: [{instanceId, pageId, title}]}`; `title` is `document.title` when the instance appears; `instances: []` when the page has no Gramlot |
| `snapshot` | `{instanceId, root: 'data'\|'source', tytx}` or `{..., error}` |
| `change` | `{instanceId, root, evt: 'ins'\|'upd'\|'del', path, ind?, tytxValue?, bag?, attrs?}` |
| `result` | `{requestId, ok, tytxValue?, bag?, text?, error?}` |
| `bye` | `{instanceId}` on `pagehide`, or when `window.gramlot` is replaced or disposed |

`change` details: `path` is the full node path. `ins` carries `ind`, value and
attributes. `upd` carries attributes, plus the value unless only attributes
changed. `del` carries only the path. A `clear()` becomes one `del` per node.
The agent reads `node.staticValue`, so it never triggers a resolver.

Panel → page:

| Type | Payload |
| --- | --- |
| `subscribe` / `unsubscribe` | `{instanceId, root}`; `subscribe` answers with a `snapshot` |
| `setValue` | `{requestId, instanceId, root, path, tytxValue}` → `node.setValue` |
| `setAttributes` | `{requestId, instanceId, root, path, attrs}` → `node.setAttr(attrs, true, true, false)` |
| `deleteAttribute` | `{requestId, instanceId, root, path, name}` → `node.setAttr(rest, true, false, false)` |
| `setBreakpoints` | `{requestId, instanceId, breakpoints: [{root, path, mode: 'debugger'\|'console', condition}]}` replaces the whole set; `result.errors` maps `root:path` to a compile error |

Transport-level messages: `connect {session}` (content → agent) and
`disconnect` (content → agent). Background ↔ panel/content use control
messages; protocol messages are not rewritten, the frame travels around them:

- panel → background: `{control: 'attach', tabId}`, `{control: 'ping'}`,
  `{control: 'to-frame', frameId, msg}`;
- background → panel: `{control: 'frame', frameId, url, msg}`,
  `{control: 'frame-detached', frameId}`, `{control: 'inject-failed', error}`;
- background → content: `{control: 'detach'}`.

Instance ids are unique within a frame; the panel identifies an instance by
frame id and instance id.

`deleteAttribute` replaces the attribute set, because `node.delAttr()` emits
no event. A command with `requestId` always gets a `result`.

## Breakpoints

An imitation of the GenroPy legacy data breakpoints (`genro_dev.js`
`handleDebugPath`, `genro.js` `setDebugPath` and `dataTrigger`), extended to
the Source.

- Setting: hover a tree row or focus its action and click the grey outlined circle on the left. The
  dialog asks for **Mode** (Debugger, Console, None to remove) and an
  optional **Condition**. A double click is not used: on a branch it opens
  and closes the `<details>` row.
- Match: the exact path of the changed node, for every event (`upd_value`,
  `upd_attrs`, `upd_value_attr`, `ins`, `del`). A change of a value or of an
  attribute is told apart in the condition (`evt`, `attrs_diff`).
- Condition: a JavaScript expression over `evt`, `node`, `value`,
  `oldvalue`, `attrs_diff`, `reason`, `path`. The agent compiles it with
  `new Function` in the page (the legacy used `funcApply`); the panel
  evaluates nothing. Under a page CSP without `'unsafe-eval'` the compilation
  is refused: the panel shows the error and the breakpoint does not fire.
  Breakpoints without a condition always work.
- Action: **Debugger** runs `debugger` in the agent (`breakpointHit`); the
  caller of `setItem`/`setAttr` is lower in the call stack. **Console** logs
  `** Gramlot breakpoint **` with root, path, event and reason in the page
  console.
- The panel keeps the breakpoints and sends the whole set to the inspected
  instance after every `hello`, so they survive reloads, back/forward cache
  restores and frame changes.
- Where they show: the editor line above the properties of the selected
  node, and the `N breakpoints` button in the status bar, which opens the
  list (Edit, Remove). A solid red circle marks an active unconditional breakpoint; yellow marks
  a conditional one. Active circles stay visible. Failed conditions have no
  active mark; the error remains in the editor line and breakpoint list.

## Tests

After `node build.mjs`:

```sh
npm test                            # protocol and agent, with the real Bag
node tests/feasibility.mjs            # step 1: inspector in an extension page, no eval
node tests/e2e.mjs                    # extension in headless Chromium, panel opened as a tab
node tests/devtools.mjs               # panel inside real DevTools, driven over CDP
```

The browser tests use Playwright (development dependency) and its Chromium
(`npx playwright install chromium`).
`tests/devtools.mjs` reaches the DevTools frontend through an internal
module path (`./ui/legacy/legacy.js`), which can change between Chromium
versions.

## Release

Push a tag `v<version>` matching `version` in `src/manifest.json`. The
workflow `.github/workflows/release.yml` builds `dist/`, zips it without the
`feasibility.*` files and attaches `gramlot-devtools-<version>.zip` to a
GitHub release.

## Known limits

- One instance per frame: `window.gramlot` of each frame.
- The copy is rebuilt from a new snapshot when a change cannot be applied.
- Values that TYTX cannot encode (for example functions) make the snapshot
  fail; the panel shows the error.
- Nodes with resolvers: the agent does not resolve them; what the snapshot
  contains is what `Bag.toTytx` produces for them.
- After a committed edit the editor reloads the node when the change comes
  back; focus moved to another row of the same node is lost.
- Bag values cannot be edited (as in the PoC editor: complex values are
  read-only). Nodes cannot be added or removed from the panel.
- The page can see the agent's `window.postMessage` traffic and could forge
  messages. This is a development tool.
- Host permissions cover only `http://localhost/*` and `http://127.0.0.1/*`
  (any port) and `file:///*`. `file://` pages also need **Allow access to
  file URLs**. On other origins the injection fails and the panel shows the
  error; iframes from other origins are not inspected. The extension injects
  only while its panel is open for that tab.
- The status bar of the panel is plain HTML and DOM code, not Gramlot/PoC
  Source. It is hidden when there is nothing to show (one instance,
  connected).
