"""Validate the paired documentation identities and build both views."""
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
NAMESPACE = "GDT"


def check_pairing():
    views = [{p.relative_to(ROOT / view): p for p in (ROOT / view).rglob("[0-9][0-9][0-9]-*.md")
              if "_build" not in p.relative_to(ROOT / view).parts}
             for view in ("docs", "docs_llm")]
    if not views[0] or views[0].keys() != views[1].keys():
        raise SystemExit("Numbered documentation guides must have matching paired paths.")
    identity = re.compile(rf"(?:Document|Block) ID: \*\*({NAMESPACE}-[0-9]{{3}}(?:-[0-9]{{3}})?)\*\*")
    seen = set()
    for path in sorted(views[0]):
        signatures = []
        for view in views:
            content = view[path].read_text()
            ids = identity.findall(content)
            anchors = re.findall(r'<a id="([^"]+)"></a>', content)
            if not ids or anchors != [item.lower() for item in ids[1:]]:
                raise SystemExit(f"Missing or inconsistent documentation identities: {path}")
            if len(re.findall(r"^## ", content, re.M)) != len(anchors):
                raise SystemExit(f"Each level-two section needs an identity: {path}")
            signatures.append(ids)
        if signatures[0] != signatures[1]:
            raise SystemExit(f"Paired identities differ: {path}")
        for item in signatures[0]:
            if item in seen:
                raise SystemExit(f"Duplicate documentation identity: {item}")
            seen.add(item)
    print(f"Validated {len(views[0])} paired guides and {len(seen)} stable identities.", flush=True)


def main():
    check_pairing()
    for view in ("docs", "docs_llm"):
        subprocess.run([sys.executable, "-m", "sphinx", "-E", "-W", "--keep-going", "-b", "html",
                        view, f"docs/_build/{view}"], cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
