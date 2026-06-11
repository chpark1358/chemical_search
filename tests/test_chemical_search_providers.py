"""Fixture-based parsing tests for the PubChem/Semantic Scholar/Crossref providers."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from typing import Any


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from chemical_search.http_client import ProviderHttpError
from chemical_search.models import HttpDiagnostics
from chemical_search.providers import (
    MISSING_STEREO_WARNING,
    CrossrefProvider,
    PubChemProvider,
    SemanticScholarProvider,
)


SEMANTIC_SCHOLAR_FIXTURE: dict[str, Any] = {
    "total": 2,
    "offset": 0,
    "data": [
        {
            "paperId": "649def34f8be52c8b66281af98ae884c09aef38b",
            "externalIds": {"DOI": "10.1182/blood.V91.5.1479", "PubMed": "9473211"},
            "url": "https://www.semanticscholar.org/paper/649def34",
            "title": "Aspirin as an Antiplatelet Drug",
            "abstract": "Aspirin irreversibly inhibits platelet cyclooxygenase.",
            "venue": "Blood",
            "year": 1998,
            "citationCount": 1543,
            "authors": [
                {"authorId": "2262347", "name": "C. Patrono"},
                {"authorId": "2989283", "name": "B. Coller"},
            ],
        },
        {
            # Missing-field case: no externalIds, empty venue, no year/citations.
            "paperId": "deadbeef",
            "url": None,
            "title": "Untracked aspirin note",
            "abstract": None,
            "venue": "",
            "year": None,
            "citationCount": None,
            "authors": [],
        },
    ],
}

SEMANTIC_SCHOLAR_EMPTY_FIXTURE: dict[str, Any] = {"total": 0, "offset": 0, "data": []}

CROSSREF_FIXTURE: dict[str, Any] = {
    "status": "ok",
    "message-type": "work-list",
    "message": {
        "total-results": 2,
        "items": [
            {
                "DOI": "10.1016/j.tips.2015.03.001",
                "title": ["Aspirin chemistry and pharmacology"],
                "container-title": ["Trends in Pharmacological Sciences"],
                "author": [
                    {"given": "Jane", "family": "Doe"},
                    {"name": "Aspirin Research Consortium"},
                ],
                "issued": {"date-parts": [[2015, 4, 1]]},
                "URL": "https://doi.org/10.1016/j.tips.2015.03.001",
                "is-referenced-by-count": 87,
                "abstract": "<jats:p>Aspirin remains widely used.</jats:p>",
            },
            {
                # Missing-field case: no title/author/issued/abstract/URL.
                "DOI": "10.9999/no.meta",
                "is-referenced-by-count": 0,
            },
        ],
    },
}

CROSSREF_EMPTY_FIXTURE: dict[str, Any] = {
    "status": "ok",
    "message-type": "work-list",
    "message": {"total-results": 0, "items": []},
}

PUBCHEM_NAME_FIXTURE: dict[str, Any] = {
    "PropertyTable": {
        "Properties": [
            {
                "CID": 2244,
                "Title": "Aspirin",
                "MolecularFormula": "C9H8O4",
                "IsomericSMILES": "CC(=O)OC1=CC=CC=C1C(=O)O",
                "SMILES": "CC(=O)OC1=CC=CC=C1C(=O)O",
                "CanonicalSMILES": "CC(=O)OC1=CC=CC=C1C(=O)O",
                "ConnectivitySMILES": "CC(=O)OC1=CC=CC=C1C(=O)O",
                "InChIKey": "BSYNRYMUTXBXSQ-UHFFFAOYSA-N",
            }
        ]
    }
}


def http_diag() -> HttpDiagnostics:
    return HttpDiagnostics(latency_ms=5, cached=False, retry_count=0)


class FakeHttp:
    """Returns queued payloads; an Exception entry is raised instead."""

    def __init__(self, payloads: list):
        self.payloads = list(payloads)
        self.urls: list[str] = []

    def get_json(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        cache_ttl_seconds: int = 0,
        retries: int = 0,
    ) -> tuple[dict[str, Any], HttpDiagnostics]:
        self.urls.append(url)
        item = self.payloads.pop(0)
        if isinstance(item, Exception):
            raise item
        return item, http_diag()


class SemanticScholarTests(unittest.TestCase):
    def test_parses_papers_from_fixture(self):
        provider = SemanticScholarProvider(FakeHttp([SEMANTIC_SCHOLAR_FIXTURE]))

        papers, diagnostics = provider.search_papers("aspirin", 10)

        self.assertEqual(diagnostics.status, "ok")
        self.assertEqual(diagnostics.name, "semantic_scholar")
        self.assertEqual(len(papers), 2)
        first = papers[0]
        self.assertEqual(first.title, "Aspirin as an Antiplatelet Drug")
        self.assertEqual(first.authors, ["C. Patrono", "B. Coller"])
        self.assertEqual(first.venue, "Blood")
        self.assertEqual(first.year, 1998)
        self.assertEqual(first.doi, "10.1182/blood.V91.5.1479")
        self.assertEqual(first.citations, 1543)
        self.assertEqual(first.abstract, "Aspirin irreversibly inhibits platelet cyclooxygenase.")
        self.assertEqual(first.source, "semantic_scholar")

    def test_missing_fields_become_none_or_defaults(self):
        provider = SemanticScholarProvider(FakeHttp([SEMANTIC_SCHOLAR_FIXTURE]))

        papers, _ = provider.search_papers("aspirin", 10)
        sparse = papers[1]

        self.assertEqual(sparse.authors, [])
        self.assertIsNone(sparse.venue)
        self.assertIsNone(sparse.year)
        self.assertIsNone(sparse.doi)
        self.assertIsNone(sparse.citations)
        self.assertIsNone(sparse.abstract)
        self.assertIn("deadbeef", sparse.url)

    def test_requests_required_fields(self):
        http = FakeHttp([SEMANTIC_SCHOLAR_FIXTURE])
        SemanticScholarProvider(http).search_papers("aspirin", 10)

        for field in ("externalIds", "citationCount", "abstract", "venue", "year", "authors", "url"):
            self.assertIn(field, http.urls[0])

    def test_empty_response_is_empty_status(self):
        provider = SemanticScholarProvider(FakeHttp([SEMANTIC_SCHOLAR_EMPTY_FIXTURE]))

        papers, diagnostics = provider.search_papers("aspirin", 10)

        self.assertEqual(papers, [])
        self.assertEqual(diagnostics.status, "empty")

    def test_rate_limit_maps_to_rate_limited_status(self):
        error = ProviderHttpError("rate_limited", "HTTP 429", http_diag(), http_status=429)
        provider = SemanticScholarProvider(FakeHttp([error]))

        papers, diagnostics = provider.search_papers("aspirin", 10)

        self.assertEqual(papers, [])
        self.assertEqual(diagnostics.status, "rate_limited")

    def test_timeout_maps_to_timeout_status(self):
        error = ProviderHttpError("timeout", "timed out", http_diag())
        provider = SemanticScholarProvider(FakeHttp([error]))

        _, diagnostics = provider.search_papers("aspirin", 10)

        self.assertEqual(diagnostics.status, "timeout")


class CrossrefTests(unittest.TestCase):
    def test_parses_papers_from_fixture(self):
        provider = CrossrefProvider(FakeHttp([CROSSREF_FIXTURE]))

        papers, diagnostics = provider.search_papers("aspirin", 10)

        self.assertEqual(diagnostics.status, "ok")
        self.assertEqual(diagnostics.name, "crossref")
        first = papers[0]
        self.assertEqual(first.title, "Aspirin chemistry and pharmacology")
        self.assertEqual(first.authors, ["Jane Doe", "Aspirin Research Consortium"])
        self.assertEqual(first.venue, "Trends in Pharmacological Sciences")
        self.assertEqual(first.year, 2015)
        self.assertEqual(first.doi, "10.1016/j.tips.2015.03.001")
        self.assertEqual(first.citations, 87)
        self.assertEqual(first.abstract, "Aspirin remains widely used.")
        self.assertEqual(first.source, "crossref")

    def test_missing_fields_become_none_or_defaults(self):
        provider = CrossrefProvider(FakeHttp([CROSSREF_FIXTURE]))

        papers, _ = provider.search_papers("aspirin", 10)
        sparse = papers[1]

        self.assertEqual(sparse.title, "(제목 없음)")
        self.assertEqual(sparse.authors, [])
        self.assertIsNone(sparse.venue)
        self.assertIsNone(sparse.year)
        self.assertIsNone(sparse.abstract)
        self.assertEqual(sparse.url, "https://doi.org/10.9999/no.meta")

    def test_uses_bibliographic_query(self):
        http = FakeHttp([CROSSREF_FIXTURE])
        CrossrefProvider(http).search_papers("acetylsalicylic acid", 10)

        self.assertIn("query.bibliographic=acetylsalicylic%20acid", http.urls[0])

    def test_empty_response_is_empty_status(self):
        provider = CrossrefProvider(FakeHttp([CROSSREF_EMPTY_FIXTURE]))

        papers, diagnostics = provider.search_papers("aspirin", 10)

        self.assertEqual(papers, [])
        self.assertEqual(diagnostics.status, "empty")


class PubChemTests(unittest.TestCase):
    def test_prefers_isomeric_smiles_without_warning(self):
        provider = PubChemProvider(FakeHttp([PUBCHEM_NAME_FIXTURE]))

        candidates, diagnostics = provider.resolve_candidates("aspirin", "name", 5)

        self.assertEqual(diagnostics.status, "ok")
        candidate = candidates[0]
        self.assertEqual(candidate.candidate_id, "pubchem:2244")
        self.assertEqual(candidate.cid, 2244)
        self.assertEqual(candidate.smiles, "CC(=O)OC1=CC=CC=C1C(=O)O")
        self.assertEqual(candidate.warnings, [])

    def test_new_smiles_property_is_stereo_bearing(self):
        fixture = {
            "PropertyTable": {
                "Properties": [
                    {
                        "CID": 5288826,
                        "Title": "Morphine",
                        "MolecularFormula": "C17H19NO3",
                        "SMILES": "CN1CC[C@]23c4c5ccc(O)c4O[C@H]2[C@@H](O)C=C[C@H]3[C@H]1C5",
                        "ConnectivitySMILES": "CN1CCC23c4c5ccc(O)c4OC2C(O)C=CC3C1C5",
                        "InChIKey": "BQJCRHHNABKAKU-KBQPJGBKSA-N",
                    }
                ]
            }
        }
        provider = PubChemProvider(FakeHttp([fixture]))

        candidates, _ = provider.resolve_candidates("morphine", "name", 5)

        self.assertIn("[C@]", candidates[0].smiles)
        self.assertEqual(candidates[0].warnings, [])

    def test_connectivity_only_smiles_adds_stereo_warning(self):
        fixture = {
            "PropertyTable": {
                "Properties": [
                    {
                        "CID": 999,
                        "Title": "Stereo-free compound",
                        "MolecularFormula": "C2H6O",
                        "ConnectivitySMILES": "CCO",
                        "InChIKey": "LFQSCWFLJHTTHZ-UHFFFAOYSA-N",
                    }
                ]
            }
        }
        provider = PubChemProvider(FakeHttp([fixture]))

        candidates, _ = provider.resolve_candidates("ethanol", "name", 5)

        self.assertEqual(candidates[0].smiles, "CCO")
        self.assertEqual(candidates[0].warnings, [MISSING_STEREO_WARNING])

    def test_canonical_only_smiles_adds_stereo_warning(self):
        fixture = {
            "PropertyTable": {
                "Properties": [
                    {
                        "CID": 1000,
                        "Title": "Legacy compound",
                        "CanonicalSMILES": "CCN",
                    }
                ]
            }
        }
        provider = PubChemProvider(FakeHttp([fixture]))

        candidates, _ = provider.resolve_candidates("legacy", "name", 5)

        self.assertEqual(candidates[0].smiles, "CCN")
        self.assertEqual(candidates[0].warnings, [MISSING_STEREO_WARNING])

    def test_formula_resolution_quotes_url_and_chains_requests(self):
        cid_payload = {"IdentifierList": {"CID": [2244]}}
        http = FakeHttp([cid_payload, PUBCHEM_NAME_FIXTURE])
        provider = PubChemProvider(http)

        candidates, diagnostics = provider.resolve_candidates("C9H8O4", "formula", 5)

        self.assertEqual(diagnostics.status, "ok")
        self.assertEqual(len(candidates), 1)
        self.assertIn("fastformula/C9H8O4/cids/JSON", http.urls[0])
        self.assertIn("/compound/cid/2244/property/", http.urls[1])

    def test_formula_with_no_cids_is_empty(self):
        provider = PubChemProvider(FakeHttp([{"IdentifierList": {"CID": []}}]))

        candidates, diagnostics = provider.resolve_candidates("C99H99O99", "formula", 5)

        self.assertEqual(candidates, [])
        self.assertEqual(diagnostics.status, "empty")

    def test_pubchem_404_is_empty_not_error(self):
        error = ProviderHttpError("not_found", "HTTP 404", http_diag(), http_status=404)
        provider = PubChemProvider(FakeHttp([error]))

        candidates, diagnostics = provider.resolve_candidates("nonexistium", "name", 5)

        self.assertEqual(candidates, [])
        self.assertEqual(diagnostics.status, "empty")

    def test_pubchem_http_error_is_error_status(self):
        error = ProviderHttpError("error", "HTTP 503", http_diag(), http_status=503)
        provider = PubChemProvider(FakeHttp([error]))

        candidates, diagnostics = provider.resolve_candidates("aspirin", "name", 5)

        self.assertEqual(candidates, [])
        self.assertEqual(diagnostics.status, "error")


if __name__ == "__main__":
    unittest.main()
