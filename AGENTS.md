# gramlot-devtools repository instructions

Read README.md and the guides in `docs/` before changing this repository.

- This is an external development tool for Gramlot pages. Gramlot does not
  import it, depend on it, document it or distribute it. Never add a hook,
  a dependency or a mention of this tool to the Gramlot repository; if the tool
  needs something from Gramlot, stop and ask the owner.
- The page agent uses only `window.gramlot`, `gramlot.data`, `gramlot.source`
  and public Bag APIs. Reading `gramlot.renderer` for Source ↔ DOM work is an
  accepted owner decision; any other internal access needs the owner.
- The panel (an extension page) never evaluates code: no `eval`, no
  `new Function`. Only the agent compiles breakpoint conditions, in the page.
- Keep code, comments and maintained documentation in English.
- `vendor/gramlot-poc/` is an unmodified copy. Adapt a vendored file by copying
  it into `src/`, never by editing it in place.
- Pair `docs` and `docs_llm` guides; namespace **GDT**; three-digit filenames
  spaced by five; shared document IDs, block IDs and lowercase anchors. Run
  `python scripts/check_docs.py` after changing documentation.
- Before a commit: `node --test tests/protocol.test.mjs` and `node build.mjs`;
  for behavior changes also the browser tests (`npm run test:browser`).
- Use `develop` for new work; `main` holds verified, owner-accepted work.
- Git: `git switch`, never `git checkout`; never force-push a pushed branch;
  commit messages `<type>: <subject>` in English.
- **No AI, LLM or assistant references anywhere**: not in commits, pull
  requests, code, comments or documents. Never add `Co-Authored-By` trailers
  for assistants or `Generated with …` lines. This is a contractual
  obligation. `hooks/commit-msg` blocks the usual forms.
- Do not create tags, releases or Chrome Web Store submissions without owner
  authorization.
