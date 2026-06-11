from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

import requests


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from chemical_search.http_client import HttpClient, ProviderHttpError


class FakeResponse:
    def __init__(
        self,
        status_code: int,
        payload: dict,
        headers: dict[str, str] | None = None,
        text: str | None = None,
    ):
        self.status_code = status_code
        self.payload = payload
        self.headers = headers or {}
        self.text = text if text is not None else ""

    def json(self) -> dict:
        return self.payload


class FakeSession:
    def __init__(self, responses: list):
        self.responses = responses
        self.calls = 0
        self.headers: dict[str, str] = {}
        self.received_headers: list[dict[str, str]] = []

    def get(self, url: str, timeout: int, headers: dict[str, str]) -> FakeResponse:
        self.received_headers.append(headers)
        item = self.responses[self.calls]
        self.calls += 1
        if isinstance(item, Exception):
            raise item
        return item


class HttpClientTests(unittest.TestCase):
    def test_success_response_is_cached_without_storing_url(self):
        with tempfile.TemporaryDirectory() as directory:
            client = HttpClient(
                cache_dir=Path(directory),
                min_interval_seconds=0,
            )
            session = FakeSession([FakeResponse(200, {"value": 1})])
            client.session = session

            first, first_diagnostics = client.get_json(
                "https://provider.example/secret-query",
                cache_ttl_seconds=60,
            )
            second, second_diagnostics = client.get_json(
                "https://provider.example/secret-query",
                cache_ttl_seconds=60,
            )

            self.assertEqual(first, second)
            self.assertFalse(first_diagnostics.cached)
            self.assertTrue(second_diagnostics.cached)
            self.assertEqual(session.calls, 1)
            cache_text = "".join(
                path.read_text(encoding="utf-8") for path in Path(directory).rglob("*.json")
            )
            self.assertNotIn("secret-query", cache_text)

    def test_rate_limit_is_retried_and_reported(self):
        sleeps: list[float] = []
        client = HttpClient(
            cache_enabled=False,
            min_interval_seconds=0,
            sleep_fn=sleeps.append,
        )
        session = FakeSession(
            [
                FakeResponse(429, {}, {"retry-after": "0"}),
                FakeResponse(200, {"value": 2}),
            ]
        )
        client.session = session

        data, diagnostics = client.get_json("https://provider.example/data", retries=1)

        self.assertEqual(data, {"value": 2})
        self.assertEqual(diagnostics.retry_count, 1)
        self.assertEqual(session.calls, 2)
        self.assertEqual(sleeps, [0.0])

    def test_rate_limit_exhaustion_raises_rate_limited(self):
        client = HttpClient(
            cache_enabled=False,
            min_interval_seconds=0,
            sleep_fn=lambda seconds: None,
        )
        client.session = FakeSession(
            [
                FakeResponse(429, {}, {"retry-after": "0"}),
                FakeResponse(429, {}, {"retry-after": "0"}),
            ]
        )

        with self.assertRaises(ProviderHttpError) as context:
            client.get_json("https://provider.example/data", retries=1)

        self.assertEqual(context.exception.status, "rate_limited")

    def test_connection_error_is_retried_with_backoff(self):
        sleeps: list[float] = []
        client = HttpClient(
            cache_enabled=False,
            min_interval_seconds=0,
            sleep_fn=sleeps.append,
        )
        session = FakeSession(
            [
                requests.ConnectionError("connection reset"),
                FakeResponse(200, {"value": 3}),
            ]
        )
        client.session = session

        data, diagnostics = client.get_json("https://provider.example/data", retries=1)

        self.assertEqual(data, {"value": 3})
        self.assertEqual(diagnostics.retry_count, 1)
        self.assertEqual(session.calls, 2)
        self.assertEqual(sleeps, [0.5])

    def test_connection_error_exhaustion_raises_error_status(self):
        client = HttpClient(
            cache_enabled=False,
            min_interval_seconds=0,
            sleep_fn=lambda seconds: None,
        )
        client.session = FakeSession(
            [
                requests.ConnectionError("boom"),
                requests.exceptions.ChunkedEncodingError("broken chunk"),
            ]
        )

        with self.assertRaises(ProviderHttpError) as context:
            client.get_json("https://provider.example/data", retries=1)

        self.assertEqual(context.exception.status, "error")
        self.assertIn("ChunkedEncodingError", context.exception.diagnostics.message)

    def test_timeout_exhaustion_raises_timeout_status(self):
        client = HttpClient(
            cache_enabled=False,
            min_interval_seconds=0,
            sleep_fn=lambda seconds: None,
        )
        client.session = FakeSession([requests.Timeout("slow")])

        with self.assertRaises(ProviderHttpError) as context:
            client.get_json("https://provider.example/data", retries=0)

        self.assertEqual(context.exception.status, "timeout")

    def test_404_raises_not_found_status(self):
        client = HttpClient(cache_enabled=False, min_interval_seconds=0)
        client.session = FakeSession([FakeResponse(404, {"Fault": "no results"})])

        with self.assertRaises(ProviderHttpError) as context:
            client.get_json("https://provider.example/data")

        self.assertEqual(context.exception.status, "not_found")
        self.assertEqual(context.exception.http_status, 404)

    def test_get_text_returns_body_and_caches(self):
        with tempfile.TemporaryDirectory() as directory:
            client = HttpClient(cache_dir=Path(directory), min_interval_seconds=0)
            xml = "<response><body>ok</body></response>"
            client.session = FakeSession([FakeResponse(200, {}, text=xml)])

            first, first_diag = client.get_text(
                "https://kipo-api.example/search", cache_ttl_seconds=60
            )
            second, second_diag = client.get_text(
                "https://kipo-api.example/search", cache_ttl_seconds=60
            )

            self.assertEqual(first, xml)
            self.assertEqual(second, xml)
            self.assertFalse(first_diag.cached)
            self.assertTrue(second_diag.cached)
            self.assertEqual(client.session.calls, 1)

    def test_get_text_retries_and_maps_error(self):
        client = HttpClient(
            cache_enabled=False,
            min_interval_seconds=0,
            sleep_fn=lambda seconds: None,
        )
        client.session = FakeSession(
            [FakeResponse(503, {}), FakeResponse(503, {})]
        )

        with self.assertRaises(ProviderHttpError) as context:
            client.get_text("https://kipo-api.example/search", retries=1)

        self.assertEqual(context.exception.status, "error")

    def test_per_request_user_agent_overrides_session_default(self):
        client = HttpClient(cache_enabled=False, min_interval_seconds=0)
        client.session = FakeSession([FakeResponse(200, {"ok": True})])

        client.get_json(
            "https://query.wikidata.org/sparql?query=x",
            headers={"User-Agent": "chemical-papers/1.0 (solutionops@jiran.com)"},
        )

        sent = client.session.received_headers[0]
        self.assertEqual(sent["User-Agent"], "chemical-papers/1.0 (solutionops@jiran.com)")

    def test_wikidata_host_throttle_is_at_least_one_second(self):
        from chemical_search.http_client import _HOST_MIN_INTERVAL_SECONDS

        self.assertGreaterEqual(_HOST_MIN_INTERVAL_SECONDS["query.wikidata.org"], 1.0)


if __name__ == "__main__":
    unittest.main()
