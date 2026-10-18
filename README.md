# Gramlot DevTools for Chrome

Current version: **0.1.4**.

A Chrome Manifest V3 extension that adds a **Gramlot** panel to DevTools.
The extension imports the same inspector used inside Gramlot pages: **Data**,
**Source** and **Styles**, scalar/attribute editing, path breakpoints and CSS
override download. It embeds the component without the movable palette.


## Documentation

- Guides: `docs/` (expanded) and `docs_llm/` (concise), namespace GDT, built
  with Sphinx and the Read the Docs theme (`.readthedocs.yaml`).
  Build locally: `python scripts/check_docs.py` (see `CONTRIBUTING.md`).
- Rules for contributors and coding agents: `AGENTS.md`, `CONTRIBUTING.md`.
  No AI, LLM or assistant references in commits, pull requests, code or
  documents.

## Shared inspector

Owner confirmation, 2026-10-15: "sì facciamo un unico inspector condiviso anche nei devtools"
(core amendment 11.74). The extension imports the optional
`@gramlot/gramlot/tools/inspector` and `@gramlot/gramlot/tools/inspector-agent`
entries. Chrome discovery, visible frame selection and transport remain here.
There is no vendored PoC inspector, core dependency on the extension or new
runtime hook. Core documentation may link to extension releases and installation
instructions (owner confirmation "ok per collegamento e istruzioni", amendment 11.67).

The panel never evaluates code. Breakpoint conditions compile in the inspected
page, under its CSP; unconditional breakpoints do not require evaluation.
The shared agent uses the page's own Bag class, Data, Source and renderer document.

## Build and load

Node 22 or later. Install without a lockfile:

```sh
npm install --package-lock=false
node build.mjs
```

For local core development, build and install the sibling checkout:

```sh
npm run build --prefix ../gramlot/js
npm install --no-save --package-lock=false ../gramlot/js
node build.mjs
```

Open `chrome://extensions`, enable Developer mode and Load unpacked from `dist/`.
After rebuilding, reload the extension and reopen DevTools. Choose the Gramlot
panel in the main DevTools tab strip. For local files also enable Allow access
to file URLs. Host permissions cover localhost, 127.0.0.1 and file URLs.

Released ZIPs remain available from the
[releases](https://github.com/gramlot-org/gramlot-devtools/releases) page.
Source changes here do not publish or replace those archives.

## Use and limits

The shared property editor saves on Enter or leaving a row; Escape reloads it.
Breakpoints use exact paths, Console or Debugger mode and optional conditions.
Successful configurations survive reloads and frame selection.
Styles rows are **name | value | picker | reset**. Download CSS saves applied
root-variable overrides as `theme-overrides.css`, to load after the theme.
Changing frame, reloading or closing DevTools clears temporary CSS previews.
No theme catalogue or persistence endpoint is included.

Copies use the shared descriptor contract: supported scalar types and attributes,
ordered branches and revision checks. `_meta` is omitted; unsupported values are
read-only and resolvers are not evaluated. Source copies are not exact TYTX
subtype round trips. Bag-valued property cells remain read-only. The shared inspector also provides Source insertion, deletion, drag/reparenting and Undo/Redo. These operations use the shared inspector; the release ZIP contains the same implementation.

See [Usage](docs/010-usage.md), [Architecture](docs/020-architecture.md) and
[Development](docs/025-development.md) for frame behavior, lifecycle and verification.

## Tests

```sh
npm test
node build.mjs
npm run test:browser
python3 scripts/check_docs.py
```

Browser tests need `npx playwright install chromium`. The build copies the test
runtime from `GRAMLOT_RUNTIME` (default `../gramlot/js/dist/gramlot.js`) into
`test-page/vendor`; it never changes the source runtime. Serve `test-page` with
`python3 -m http.server 8000 --directory test-page` for a manual fixture.
Tests cover an MV3 extension page, the routed panel, and the panel inside real
Chromium DevTools. Branded Google Chrome and direct file origins require separate
qualification. Release tags, ZIP publication and store submissions need owner authorization.
