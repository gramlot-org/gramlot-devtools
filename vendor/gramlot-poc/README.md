# Vendored Gramlot PoC runtime (temporary)

The DevTools panel is built with the Gramlot PoC runtime and inspector: tree,
tabs, property editor and the runtime that drives them. These files are an
unmodified copy from `gramlot-org/gramlot-poc`, commit `10478b5`:

- `js/dom/src/…`: only the modules reached by the panel bundle
  (`src/panel.js`, `src/feasibility.js`), computed from the esbuild metafile;
- `js/pages/src/inspector.css`;
- `LICENSE` and `NOTICE` of the PoC (Apache-2.0).

Adapted copies (inspector, editor, builder) live in `src/inspector/`, not
here.

This folder is temporary. When Gramlot is published, the panel will depend on
the published Gramlot package and this folder will be removed.
