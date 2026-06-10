from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

import requests


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from chemical_search.http_client import HttpClient


class FakeResponse:
    def __init__(self, status_code: int, payload: dict, headers: dict[str, str] | None = None):
        self.status_code = status_code
        self.payload = payload
        self.headers = headers or {}

    def raise_for_status(self):
        if self.status_code >= 400:
            error = requests.HTTPError(f"HTTP {self.status_code}")
            error.response = self
            raise error

    def json(self):
        return self.payload


class FakeSession:
    def __init__(self, responses: list[FakeResponse]):
        self.responses = responses
        self.calls = 0
        self.headers = {}

    def get(self, url, timeout, headers):
        response = self.responses[self.calls]
        self.calls += 1
        return response


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
            cache_text = "".join(path.read_text(encoding="utf-8") for path in Path(directory).rglob("*.json"))
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


if __name__ == "__main__":
    unittest.main()
