"""Build the concise documentation with the shared configuration."""
from pathlib import Path
import runpy

globals().update({key: value for key, value in runpy.run_path(
    str(Path(__file__).resolve().parents[1] / "docs/conf.py")
).items() if not key.startswith("__")})
html_logo = "../docs/_static/gramlot-logo.png"
