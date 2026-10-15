# gramlot-devtools repository instructions

Read README.md and the guides in `docs/` before changing this repository.

- This is an external development tool for Gramlot pages. Gramlot does not
  import it, depend on it or distribute it. Owner confirmation 2026-10-15:
  "ok per collegamento e istruzioni" allows the Gramlot README and manual to
  link to this tool's releases and explain installation (core amendment 11.67).
  This documentation exception permits no runtime hook, dependency or bundled ZIP.
  If the tool needs a runtime change in Gramlot, stop and ask the owner.
- The page agent uses only `window.gramlot`, `gramlot.data`, `gramlot.src.source`
  and public Bag APIs. Reading `gramlot.src.renderer` for Source ↔ DOM work is an
  accepted owner decision; any other internal access needs the owner.
- The panel (an extension page) never evaluates code: no `eval`, no
  `new Function`. Only the agent compiles breakpoint conditions, in the page.
- Keep code, comments and maintained documentation in English.
- Owner confirmation 2026-10-15: "sì facciamo un unico inspector condiviso anche nei devtools"
  authorizes importing the shared optional inspector and page agent from Gramlot
  (core amendment 11.74). Keep Chrome discovery and routing here; do not restore
  a vendored or independently adapted inspector. No core runtime hook is authorized.
- Pair `docs` and `docs_llm` guides; namespace **GDT**; three-digit filenames
  spaced by five; shared document IDs, block IDs and lowercase anchors. Run
  `python scripts/check_docs.py` after changing documentation.
- Before a commit: `npm test` and `node build.mjs`;
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
