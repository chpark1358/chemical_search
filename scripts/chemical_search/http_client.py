from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests

from .cache import JsonFileCache
from .models import ProviderDiagnostics


class ProviderHttpError(RuntimeError):
    def __init__(self, status: str, message: str, diagnostics: ProviderDiagnostics):
        super().__init__(message)
        self.status = status
        self.diagnostics = diagnostics


class HttpClient:
    def __init__(
        self,
        timeout_seconds: int = 10,
        *,
        cache_dir: Path | None = None,
        cache_enabled: bool = True,
        min_interval_seconds: float = 0.2,
        sleep_fn=time.sleep,
        monotonic_fn=time.monotonic,
    ):
        self.timeout_seconds = timeout_seconds
        self.min_interval_seconds = min_interval_seconds
        self.sleep_fn = sleep_fn
        self.monotonic_fn = monotonic_fn
        self.last_request_at: dict[str, float] = {}
        if cache_enabled and cache_dir is None:
            configured_cache = os.getenv("CHEMICAL_SEARCH_CACHE_DIR", "output/chemical-search/cache")
            cache_dir = Path(configured_cache) if configured_cache else None
        if not cache_enabled:
            cache_dir = None
        self.cache = JsonFileCache(cache_dir)
        self.session = requests.Session()
        user_agent = "chemical-search-poc/0.2"
        if contact := os.getenv("CROSSREF_MAILTO"):
            user_agent += f" (mailto:{contact})"
        self.session.headers.update({"user-agent": user_agent})

    def get_json(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        cache_ttl_seconds: int = 0,
        retries: int = 0,
    ) -> tuple[dict[str, Any], ProviderDiagnostics]:
        started = time.perf_counter()
        retrieved_at = datetime.now(timezone.utc).isoformat()
        request_headers = headers or {}
        cache_key = json.dumps([url, sorted(request_headers.items())], separators=(",", ":"))
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached, ProviderDiagnostics(
                latency_ms=int((time.perf_counter() - started) * 1000),
                retrieved_at=retrieved_at,
                cached=True,
            )

        last_error: Exception | None = None
        for attempt in range(retries + 1):
            self._throttle(url)
            try:
                response = self.session.get(
                    url,
                    timeout=self.timeout_seconds,
                    headers=request_headers,
                )
                if response.status_code == 429 or response.status_code >= 500:
                    last_error = requests.HTTPError(
                        f"Retryable HTTP {response.status_code}.",
                        response=response,
                    )
                    if attempt < retries:
                        self.sleep_fn(self._retry_delay(response, attempt))
                        continue
                latency_ms = int((time.perf_counter() - started) * 1000)
                diagnostics = ProviderDiagnostics(
                    latency_ms=latency_ms,
                    retrieved_at=retrieved_at,
                    retry_count=attempt,
                )
                if response.status_code == 429:
                    diagnostics.message = "Provider returned HTTP 429 after retries."
                    raise ProviderHttpError(
                        "rate_limited",
                        "Provider returned HTTP 429 after retries.",
                        diagnostics,
                    )
                response.raise_for_status()
                data = response.json()
                self.cache.set(cache_key, data, cache_ttl_seconds)
                return data, diagnostics
            except requests.Timeout as exc:
                last_error = exc
                if attempt < retries:
                    self.sleep_fn(0.5 * (2**attempt))
                    continue
                diagnostics = ProviderDiagnostics(
                    latency_ms=int((time.perf_counter() - started) * 1000),
                    retrieved_at=retrieved_at,
                    retry_count=attempt,
                    message=str(exc),
                )
                raise ProviderHttpError("timeout", "Provider request timed out.", diagnostics) from exc
            except ProviderHttpError:
                raise
            except Exception as exc:
                last_error = exc
                if (
                    isinstance(exc, requests.HTTPError)
                    and exc.response is not None
                    and exc.response.status_code >= 500
                    and attempt < retries
                ):
                    self.sleep_fn(0.5 * (2**attempt))
                    continue
                break

        diagnostics = ProviderDiagnostics(
            latency_ms=int((time.perf_counter() - started) * 1000),
            retrieved_at=retrieved_at,
            retry_count=attempt,
            message=repr(last_error),
        )
        raise ProviderHttpError("error", "Provider request failed.", diagnostics) from last_error

    def _throttle(self, url: str) -> None:
        host = urlparse(url).netloc
        now = self.monotonic_fn()
        wait_seconds = self.min_interval_seconds - (now - self.last_request_at.get(host, 0.0))
        if wait_seconds > 0:
            self.sleep_fn(wait_seconds)
        self.last_request_at[host] = self.monotonic_fn()

    def _retry_delay(self, response: requests.Response, attempt: int) -> float:
        retry_after = response.headers.get("retry-after")
        if retry_after:
            try:
                return min(30.0, max(0.0, float(retry_after)))
            except ValueError:
                try:
                    retry_at = parsedate_to_datetime(retry_after)
                    return min(30.0, max(0.0, retry_at.timestamp() - time.time()))
                except (TypeError, ValueError):
                    pass
        return min(30.0, 0.5 * (2**attempt))
