from __future__ import annotations

import json
import logging
import os
import threading
import time
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

import requests

from .cache import JsonFileCache
from .models import HttpDiagnostics


logger = logging.getLogger(__name__)

_RETRYABLE_CONNECTION_ERRORS = (
    requests.ConnectionError,
    requests.exceptions.ChunkedEncodingError,
)

# Per-host minimum interval overrides (seconds). Hosts not listed fall back to
# ``min_interval_seconds``. SureChEMBL asks callers to be polite, so we throttle
# its host more conservatively than the default. Wikidata's public SPARQL
# endpoint asks for >=1s between requests plus a descriptive User-Agent.
_HOST_MIN_INTERVAL_SECONDS: dict[str, float] = {
    "www.surechembl.org": 0.34,
    "query.wikidata.org": 1.0,
}


class ProviderHttpError(RuntimeError):
    """Raised when a provider request fails after retries.

    ``status`` is one of: "rate_limited", "timeout", "not_found", "error".
    Providers map these onto the public diagnostics statuses.
    """

    def __init__(
        self,
        status: str,
        message: str,
        diagnostics: HttpDiagnostics,
        *,
        http_status: int | None = None,
    ):
        super().__init__(message)
        self.status = status
        self.diagnostics = diagnostics
        self.http_status = http_status


class HttpClient:
    def __init__(
        self,
        timeout_seconds: int = 10,
        *,
        cache_dir: Path | None = None,
        cache_enabled: bool = True,
        min_interval_seconds: float = 0.2,
        sleep_fn: Callable[[float], None] = time.sleep,
        monotonic_fn: Callable[[], float] = time.monotonic,
    ):
        self.timeout_seconds = timeout_seconds
        self.min_interval_seconds = min_interval_seconds
        self.sleep_fn = sleep_fn
        self.monotonic_fn = monotonic_fn
        self.last_request_at: dict[str, float] = {}
        self._throttle_lock = threading.Lock()
        if cache_enabled and cache_dir is None:
            configured_cache = os.getenv("CHEMICAL_SEARCH_CACHE_DIR", "output/chemical-search/cache")
            cache_dir = Path(configured_cache) if configured_cache else None
        if not cache_enabled:
            cache_dir = None
        self.cache = JsonFileCache(cache_dir)
        self.session = requests.Session()
        user_agent = "chemical-search-poc/0.3"
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
    ) -> tuple[dict[str, Any], HttpDiagnostics]:
        return self._request_json(
            "GET",
            url,
            headers=headers,
            cache_ttl_seconds=cache_ttl_seconds,
            retries=retries,
        )

    def post_json(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        json_body: Any | None = None,
        cache_ttl_seconds: int = 0,
        retries: int = 0,
    ) -> tuple[dict[str, Any], HttpDiagnostics]:
        """POST a (usually empty) JSON body. SureChEMBL passes all params as
        query string and expects no/empty body, so ``json_body`` defaults to
        ``None``."""
        return self._request_json(
            "POST",
            url,
            headers=headers,
            json_body=json_body,
            cache_ttl_seconds=cache_ttl_seconds,
            retries=retries,
        )

    def get_text(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        cache_ttl_seconds: int = 0,
        retries: int = 0,
    ) -> tuple[str, HttpDiagnostics]:
        """GET a non-JSON body (e.g. XML) as decoded text.

        Shares the throttle/retry/error handling and on-disk cache with
        ``get_json`` (the raw string is JSON-serializable so the same cache
        works), but skips JSON parsing so XML endpoints like KIPRIS can be
        consumed by callers using ``xml.etree``.
        """
        return self._request_text(
            url,
            headers=headers,
            cache_ttl_seconds=cache_ttl_seconds,
            retries=retries,
        )

    def _cache_key(
        self,
        method: str,
        url: str,
        request_headers: dict[str, str],
        json_body: Any | None,
    ) -> str:
        # GET keeps its original two-element cache key so existing on-disk
        # caches stay valid; other methods add method/body to the key.
        if method == "GET":
            return json.dumps(
                [url, sorted(request_headers.items())], separators=(",", ":")
            )
        return json.dumps(
            [method, url, sorted(request_headers.items()), json_body],
            separators=(",", ":"),
            sort_keys=True,
        )

    def _request_json(
        self,
        method: str,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        json_body: Any | None = None,
        cache_ttl_seconds: int = 0,
        retries: int = 0,
    ) -> tuple[dict[str, Any], HttpDiagnostics]:
        started = time.perf_counter()
        request_headers = headers or {}
        method = method.upper()
        cache_key = self._cache_key(method, url, request_headers, json_body)
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached, self._diagnostics(started, 0, cached=True)

        response, attempt = self._send(
            method, url, request_headers, json_body, started, retries
        )
        try:
            data = response.json()
        except ValueError as exc:
            raise ProviderHttpError(
                "error",
                "Provider returned invalid JSON.",
                self._diagnostics(started, attempt, message="Invalid JSON response."),
            ) from exc
        diagnostics = self._diagnostics(started, attempt)
        self._cache_set(cache_key, data, cache_ttl_seconds)
        return data, diagnostics

    def _request_text(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        cache_ttl_seconds: int = 0,
        retries: int = 0,
    ) -> tuple[str, HttpDiagnostics]:
        started = time.perf_counter()
        request_headers = headers or {}
        cache_key = self._cache_key("GET", url, request_headers, None)
        cached = self.cache.get(cache_key)
        if isinstance(cached, str):
            return cached, self._diagnostics(started, 0, cached=True)

        response, attempt = self._send(
            "GET", url, request_headers, None, started, retries
        )
        text = response.text
        diagnostics = self._diagnostics(started, attempt)
        self._cache_set(cache_key, text, cache_ttl_seconds)
        return text, diagnostics

    def _send(
        self,
        method: str,
        url: str,
        request_headers: dict[str, str],
        json_body: Any | None,
        started: float,
        retries: int,
    ) -> tuple[requests.Response, int]:
        """Run the throttle/retry loop and return the successful response.

        Raises ``ProviderHttpError`` on timeout, connection failure, or an HTTP
        status that is not 2xx/3xx. Shared by ``_request_json`` and
        ``_request_text`` so both JSON and text responses get identical retry,
        throttle, and status handling.
        """
        attempt = 0
        for attempt in range(retries + 1):
            self._throttle(url)
            try:
                if method == "GET":
                    response = self.session.get(
                        url,
                        timeout=self.timeout_seconds,
                        headers=request_headers,
                    )
                else:
                    response = self.session.post(
                        url,
                        timeout=self.timeout_seconds,
                        headers=request_headers,
                        json=json_body,
                    )
            except requests.Timeout as exc:
                # ConnectTimeout subclasses both Timeout and ConnectionError;
                # catching Timeout first classifies it as a timeout.
                if attempt < retries:
                    self.sleep_fn(0.5 * (2**attempt))
                    continue
                logger.warning("Provider request timed out after %d attempt(s).", attempt + 1)
                raise ProviderHttpError(
                    "timeout",
                    "Provider request timed out.",
                    self._diagnostics(started, attempt, message="Request timed out."),
                ) from exc
            except _RETRYABLE_CONNECTION_ERRORS as exc:
                if attempt < retries:
                    self.sleep_fn(0.5 * (2**attempt))
                    continue
                logger.warning(
                    "Provider connection failed after %d attempt(s): %s",
                    attempt + 1,
                    type(exc).__name__,
                )
                raise ProviderHttpError(
                    "error",
                    "Provider connection failed.",
                    self._diagnostics(
                        started,
                        attempt,
                        message=f"Connection failed: {type(exc).__name__}.",
                    ),
                ) from exc

            status_code = response.status_code
            if status_code == 429 or status_code >= 500:
                if attempt < retries:
                    self.sleep_fn(self._retry_delay(response, attempt))
                    continue
                if status_code == 429:
                    raise ProviderHttpError(
                        "rate_limited",
                        "Provider returned HTTP 429 after retries.",
                        self._diagnostics(started, attempt, message="HTTP 429 after retries."),
                        http_status=status_code,
                    )
                raise ProviderHttpError(
                    "error",
                    f"Provider returned HTTP {status_code} after retries.",
                    self._diagnostics(started, attempt, message=f"HTTP {status_code} after retries."),
                    http_status=status_code,
                )
            if status_code == 404:
                # Providers such as PubChem signal "no results" with 404.
                raise ProviderHttpError(
                    "not_found",
                    "Provider returned HTTP 404.",
                    self._diagnostics(started, attempt, message="HTTP 404."),
                    http_status=status_code,
                )
            if status_code >= 400:
                raise ProviderHttpError(
                    "error",
                    f"Provider returned HTTP {status_code}.",
                    self._diagnostics(started, attempt, message=f"HTTP {status_code}."),
                    http_status=status_code,
                )

            return response, attempt

        raise ProviderHttpError(  # pragma: no cover - defensive, loop always returns/raises
            "error",
            "Provider request failed.",
            self._diagnostics(started, attempt),
        )

    def _cache_set(self, cache_key: str, data: Any, cache_ttl_seconds: int) -> None:
        # Cache failures must never affect request success; JsonFileCache.set
        # swallows OSError internally, this guard covers unexpected paths.
        try:
            self.cache.set(cache_key, data, cache_ttl_seconds)
        except OSError:
            logger.warning("Cache write raised OSError; ignoring.", exc_info=True)

    def _diagnostics(
        self,
        started: float,
        retry_count: int,
        *,
        cached: bool = False,
        message: str | None = None,
    ) -> HttpDiagnostics:
        return HttpDiagnostics(
            latency_ms=int((time.perf_counter() - started) * 1000),
            cached=cached,
            retry_count=retry_count,
            message=message,
        )

    def _throttle(self, url: str) -> None:
        host = urlparse(url).netloc
        interval = max(
            self.min_interval_seconds,
            _HOST_MIN_INTERVAL_SECONDS.get(host, 0.0),
        )
        with self._throttle_lock:
            now = self.monotonic_fn()
            ready_at = max(now, self.last_request_at.get(host, 0.0) + interval)
            wait_seconds = ready_at - now
            self.last_request_at[host] = ready_at
        if wait_seconds > 0:
            self.sleep_fn(wait_seconds)

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
