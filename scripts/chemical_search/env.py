"""Minimal, dependency-free ``.env`` loader.

uvicorn does not read ``.env`` on its own, and on WSL environment variables
set in a bash shell do not propagate to a Windows ``python.exe`` process. To
make the documented workflow ("copy ``.env.example`` to ``.env``") actually
take effect regardless of how the app is launched, we parse the repo-root
``.env`` once at import time and populate ``os.environ`` for keys that are not
already set (real environment variables always win over the file).
"""

from __future__ import annotations

import os
from pathlib import Path

# scripts/chemical_search/env.py -> repo root is two parents up from this dir.
_REPO_ROOT = Path(__file__).resolve().parents[2]


def _parse_line(line: str) -> tuple[str, str] | None:
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in stripped:
        return None
    key, _, value = stripped.partition("=")
    key = key.strip()
    if not key:
        return None
    value = value.strip()
    # Strip a single matching pair of surrounding quotes.
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        value = value[1:-1]
    return key, value


def load_dotenv(path: Path | None = None) -> None:
    """Load ``.env`` into ``os.environ`` without overriding existing vars."""
    env_path = path or (_REPO_ROOT / ".env")
    try:
        text = env_path.read_text(encoding="utf-8")
    except OSError:
        return
    for line in text.splitlines():
        parsed = _parse_line(line)
        if parsed is None:
            continue
        key, value = parsed
        os.environ.setdefault(key, value)
