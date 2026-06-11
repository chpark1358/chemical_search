from __future__ import annotations

import hashlib
import json
import logging
import time
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4


logger = logging.getLogger(__name__)


class JsonFileCache:
    """Small hashed file cache that does not store request URLs or headers."""

    def __init__(self, directory: Path | None, *, now_fn: Callable[[], float] = time.time):
        self.directory = directory
        self.now_fn = now_fn

    def get(self, key_material: str) -> dict[str, Any] | None:
        path = self._path(key_material)
        if path is None or not path.exists():
            return None
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            if payload["expires_at"] <= self.now_fn():
                path.unlink(missing_ok=True)
                return None
            return payload["data"]
        except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError):
            try:
                path.unlink(missing_ok=True)
            except OSError:
                pass
            return None

    def set(self, key_material: str, data: dict[str, Any], ttl_seconds: int) -> None:
        """Write to the cache; failures are logged and never propagated."""
        path = self._path(key_material)
        if path is None or ttl_seconds <= 0:
            return
        payload = {
            "expires_at": self.now_fn() + ttl_seconds,
            "data": data,
        }
        # Unique temporary name per write so concurrent writers never clobber
        # each other's in-progress files.
        temporary = path.with_name(f"{path.name}.{uuid4().hex}.tmp")
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            temporary.replace(path)
        except OSError:
            logger.warning("Cache write failed; continuing without cache.", exc_info=True)
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass

    def _path(self, key_material: str) -> Path | None:
        if self.directory is None:
            return None
        digest = hashlib.sha256(key_material.encode("utf-8")).hexdigest()
        return self.directory / digest[:2] / f"{digest}.json"
