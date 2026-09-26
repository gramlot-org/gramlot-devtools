# Contributing

## Setup

```sh
npm install
npx playwright install chromium   # browser tests only
git config core.hooksPath hooks
python3 -m venv .venv && .venv/bin/pip install -r requirements-docs.txt   # documentation only
```

## Checks before a commit

```sh
node --test tests/protocol.test.mjs
node build.mjs
npm run test:browser                  # when behavior changes
.venv/bin/python scripts/check_docs.py   # when documentation changes
```

## Commits and branches

- New work on `develop`; `main` holds verified, owner-accepted work.
- Messages: `<type>: <subject>`, present tense, English. Types: `feat`, `fix`,
  `docs`, `refactor`, `test`, `chore`.
- Use `git switch`, never `git checkout`. Never force-push a pushed branch:
  fixes land as new commits.
- No AI, LLM or assistant references in commits, pull requests, code, comments
  or documents; no assistant `Co-Authored-By` trailers; no `Generated with …`
  lines. `hooks/commit-msg` rejects the usual forms.

## Releases

Only with owner authorization: push a tag `v<version>` equal to `version` in
`src/manifest.json`. See `docs/025-development.md`.
