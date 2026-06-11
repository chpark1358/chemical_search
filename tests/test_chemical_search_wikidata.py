"""Fixture-based tests for the Wikidata Korean-name resolver and its
integration into the candidate-resolution pipeline.

No live network is used: the HttpClient is faked and returns canned SPARQL
JSON. The verified live shapes (아스피린 -> CID 2244 /
BSYNRYMUTXBXSQ-UHFFFAOYSA-N, 카페인 -> 2519, ...) are reproduced as fixtures.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from typing import Any
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from chemical_search.http_client import ProviderHttpError
from chemical_search.models import (
    CompoundCandidate,
    HttpDiagnostics,
    ProviderDiagnostics,
)
from chemical_search.pipeline import KOREAN_RESOLVED_WARNING, SearchPipeline
from chemical_search.wikidata import (
    WIKIDATA_USER_AGENT,
    contains_hangul,
    resolve_korean_name,
)


# Verified live shape: results.bindings[0].cid.value / .inchikey.value.
ASPIRIN_SPARQL_FIXTURE: dict[str, Any] = {
    "head": {"vars": ["item", "cid", "inchikey"]},
    "results": {
        "bindings": [
            {
                "item": {"type": "uri", "value": "http://www.wikidata.org/entity/Q18216"},
                "cid": {"type": "literal", "value": "2244"},
                "inchikey": {"type": "literal", "value": "BSYNRYMUTXBXSQ-UHFFFAOYSA-N"},
            }
        ]
    },
}

# CID-only shape: no P235 (InChIKey) binding.
CID_ONLY_SPARQL_FIXTURE: dict[str, Any] = {
    "head": {"vars": ["item", "cid", "inchikey"]},
    "results": {
        "bindings": [
            {
                "item": {"type": "uri", "value": "http://www.wikidata.org/entity/Q60235"},
                "cid": {"type": "literal", "value": "2519"},
            }
        ]
    },
}

EMPTY_SPARQL_FIXTURE: dict[str, Any] = {
    "head": {"vars": ["item", "cid", "inchikey"]},
    "results": {"bindings": []},
}


def http_diag() -> HttpDiagnostics:
    return HttpDiagnostics(latency_ms=3, cached=False, retry_count=0)


class FakeHttp:
    """Records calls and returns queued payloads (Exception entries raise)."""

    def __init__(self, payloads: list):
        self.payloads = list(payloads)
        self.urls: list[str] = []
        self.headers: list[dict[str, str] | None] = []

    def get_json(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        cache_ttl_seconds: int = 0,
        retries: int = 0,
    ) -> tuple[dict[str, Any], HttpDiagnostics]:
        self.urls.append(url)
        self.headers.append(headers)
        item = self.payloads.pop(0)
        if isinstance(item, Exception):
            raise item
        return item, http_diag()


class HangulDetectionTests(unittest.TestCase):
    def test_detects_hangul(self):
        self.assertTrue(contains_hangul("아스피린"))
        self.assertTrue(contains_hangul("aspirin 아스피린"))

    def test_no_hangul_for_ascii_and_structures(self):
        self.assertFalse(contains_hangul("aspirin"))
        self.assertFalse(contains_hangul("CC(=O)Oc1ccccc1C(=O)O"))
        self.assertFalse(contains_hangul("C9H8O4"))
        self.assertFalse(contains_hangul("BSYNRYMUTXBXSQ-UHFFFAOYSA-N"))
        self.assertFalse(contains_hangul(""))


class ResolveKoreanNameTests(unittest.TestCase):
    def test_resolves_cid_and_inchikey(self):
        http = FakeHttp([ASPIRIN_SPARQL_FIXTURE])

        result = resolve_korean_name("아스피린", http)

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.cid, 2244)
        self.assertEqual(result.inchi_key, "BSYNRYMUTXBXSQ-UHFFFAOYSA-N")
        self.assertEqual(result.label, "아스피린")

    def test_sends_required_user_agent_and_accept_headers(self):
        http = FakeHttp([ASPIRIN_SPARQL_FIXTURE])

        resolve_korean_name("아스피린", http)

        sent = http.headers[0] or {}
        self.assertEqual(sent.get("User-Agent"), WIKIDATA_USER_AGENT)
        self.assertEqual(sent.get("Accept"), "application/sparql-results+json")
        self.assertIn("query.wikidata.org/sparql", http.urls[0])
        # The Korean label is URL-encoded into the SPARQL query string.
        self.assertIn("query=", http.urls[0])

    def test_cid_only_binding_returns_cid_without_inchikey(self):
        http = FakeHttp([CID_ONLY_SPARQL_FIXTURE])

        result = resolve_korean_name("카페인", http)

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.cid, 2519)
        self.assertIsNone(result.inchi_key)

    def test_non_korean_input_skips_wikidata(self):
        http = FakeHttp([ASPIRIN_SPARQL_FIXTURE])

        result = resolve_korean_name("aspirin", http)

        self.assertIsNone(result)
        # No request was made: non-Hangul input never touches Wikidata.
        self.assertEqual(http.urls, [])

    def test_empty_bindings_returns_none(self):
        http = FakeHttp([EMPTY_SPARQL_FIXTURE])

        result = resolve_korean_name("타이레놀", http)

        self.assertIsNone(result)

    def test_request_failure_falls_through_to_none(self):
        error = ProviderHttpError("error", "HTTP 500", http_diag(), http_status=500)
        http = FakeHttp([error])

        result = resolve_korean_name("아스피린", http)

        self.assertIsNone(result)


class FakePubChem:
    """Scriptable PubChem stub recording how it was called."""

    def __init__(
        self,
        *,
        name_candidates: list[CompoundCandidate] | None = None,
        inchi_key_candidates: list[CompoundCandidate] | None = None,
        cid_candidates: list[CompoundCandidate] | None = None,
    ):
        self.name_candidates = name_candidates or []
        self.inchi_key_candidates = inchi_key_candidates or []
        self.cid_candidates = cid_candidates or []
        self.resolve_calls: list[tuple[str, str]] = []
        self.cid_calls: list[int] = []

    def resolve_candidates(self, query, input_type, limit):
        self.resolve_calls.append((query, input_type))
        candidates = (
            self.inchi_key_candidates if input_type == "inchi_key" else self.name_candidates
        )
        status = "ok" if candidates else "empty"
        return list(candidates), ProviderDiagnostics(name="pubchem", status=status, latency_ms=1)

    def resolve_by_cid(self, cid, limit=1):
        self.cid_calls.append(cid)
        status = "ok" if self.cid_candidates else "empty"
        return list(self.cid_candidates), ProviderDiagnostics(
            name="pubchem", status=status, latency_ms=1
        )


def candidate(cid: int, *, inchi_key: str | None = None) -> CompoundCandidate:
    return CompoundCandidate(
        candidate_id=f"pubchem:{cid}",
        title="Aspirin",
        formula="C9H8O4",
        smiles="CC(=O)Oc1ccccc1C(=O)O",
        cid=cid,
        inchi_key=inchi_key,
    )


def make_pipeline(pubchem: FakePubChem, http: FakeHttp) -> SearchPipeline:
    pipeline = SearchPipeline.__new__(SearchPipeline)
    pipeline.http = http
    pipeline.pubchem = pubchem
    pipeline.semantic_scholar = None
    pipeline.openalex = None
    pipeline.crossref = None
    pipeline.surechembl = None
    pipeline.kipris = None
    return pipeline


class KoreanResolutionIntegrationTests(unittest.TestCase):
    def test_inchikey_path_is_preferred_and_adds_warning(self):
        pubchem = FakePubChem(
            inchi_key_candidates=[candidate(2244, inchi_key="BSYNRYMUTXBXSQ-UHFFFAOYSA-N")]
        )
        http = FakeHttp([ASPIRIN_SPARQL_FIXTURE])
        pipeline = make_pipeline(pubchem, http)

        resolution = pipeline.resolve_candidates("아스피린", "auto", 20)

        self.assertEqual(resolution.detected_type, "name")
        self.assertEqual(len(resolution.candidates), 1)
        # PubChem was driven through the InChIKey path, not a name lookup.
        self.assertEqual(pubchem.resolve_calls, [("BSYNRYMUTXBXSQ-UHFFFAOYSA-N", "inchi_key")])
        self.assertEqual(pubchem.cid_calls, [])
        expected = KOREAN_RESOLVED_WARNING.format(name="아스피린", cid=2244)
        self.assertIn(expected, resolution.candidates[0].warnings)

    def test_cid_path_used_when_no_inchikey(self):
        pubchem = FakePubChem(cid_candidates=[candidate(2519)])
        http = FakeHttp([CID_ONLY_SPARQL_FIXTURE])
        pipeline = make_pipeline(pubchem, http)

        resolution = pipeline.resolve_candidates("카페인", "name", 20)

        self.assertEqual(pubchem.cid_calls, [2519])
        self.assertEqual(pubchem.resolve_calls, [])
        self.assertEqual(len(resolution.candidates), 1)
        self.assertIn(
            KOREAN_RESOLVED_WARNING.format(name="카페인", cid=2519),
            resolution.candidates[0].warnings,
        )

    def test_wikidata_miss_falls_through_to_pubchem_name_lookup(self):
        # Wikidata returns nothing -> the normal PubChem name lookup runs with
        # the original Korean query (which will usually be empty for Korean).
        pubchem = FakePubChem(name_candidates=[])
        http = FakeHttp([EMPTY_SPARQL_FIXTURE])
        pipeline = make_pipeline(pubchem, http)

        resolution = pipeline.resolve_candidates("타이레놀", "auto", 20)

        self.assertEqual(resolution.candidates, [])
        self.assertEqual(pubchem.resolve_calls, [("타이레놀", "name")])

    def test_non_korean_input_never_calls_wikidata(self):
        pubchem = FakePubChem(name_candidates=[candidate(2244)])
        http = FakeHttp([])  # would IndexError if Wikidata were queried
        pipeline = make_pipeline(pubchem, http)

        with patch.dict("os.environ", {}, clear=True):
            resolution = pipeline.resolve_candidates("aspirin", "auto", 20)

        self.assertEqual(http.urls, [])
        self.assertEqual(pubchem.resolve_calls, [("aspirin", "name")])
        self.assertEqual(len(resolution.candidates), 1)


if __name__ == "__main__":
    unittest.main()
