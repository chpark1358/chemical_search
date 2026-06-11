"""Fixture-based parsing tests for the PubChem/Semantic Scholar/OpenAlex/Crossref providers."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from typing import Any
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from chemical_search.http_client import ProviderHttpError
from chemical_search.models import UNTITLED_PAPER, UNTITLED_PATENT, HttpDiagnostics
from chemical_search.providers import (
    GOOGLE_PATENTS_USER_AGENT,
    MISSING_STEREO_WARNING,
    OPENALEX_ABSTRACT_MAX_CHARS,
    CrossrefProvider,
    GooglePatentsProvider,
    OpenAlexProvider,
    PubChemProvider,
    SemanticScholarProvider,
    SureChemblProvider,
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

OPENALEX_FIXTURE: dict[str, Any] = {
    "meta": {"count": 2, "page": 1, "per_page": 10},
    "results": [
        {
            "id": "https://openalex.org/W2741809807",
            "display_name": "Aspirin in the primary prevention of cardiovascular disease",
            "publication_year": 2017,
            "doi": "https://doi.org/10.1016/j.jacc.2017.03.001",
            "cited_by_count": 321,
            "authorships": [
                {"author": {"id": "https://openalex.org/A1", "display_name": "Jane Roe"}},
                {"author": {"id": "https://openalex.org/A2", "display_name": "John Doe"}},
            ],
            "primary_location": {
                "source": {"display_name": "Journal of the American College of Cardiology"},
                "landing_page_url": "https://www.sciencedirect.com/science/article/pii/S0735",
            },
            "abstract_inverted_index": {
                "Aspirin": [0],
                "irreversibly": [1],
                "inhibits": [2],
                "platelet": [3],
                "cyclooxygenase.": [4],
            },
        },
        {
            # Missing-field case: null title/year/doi/citations, empty
            # authorships, null primary_location and abstract_inverted_index.
            "id": "https://openalex.org/W0000000000",
            "display_name": None,
            "publication_year": None,
            "doi": None,
            "cited_by_count": None,
            "authorships": [],
            "primary_location": None,
            "abstract_inverted_index": None,
        },
    ],
}

OPENALEX_EMPTY_FIXTURE: dict[str, Any] = {"meta": {"count": 0}, "results": []}

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


SURECHEMBL_SMILES_FIXTURE: dict[str, Any] = {
    "status": "OK",
    "timestamp": 1700000000,
    "error_message": "",
    "data": {
        "CC(=O)OC1=CC=CC=C1C(=O)O": {
            "id": "1353",
            "chemical_id": "1353",
            "name": "aspirin",
            "inchi_key": "BSYNRYMUTXBXSQ-UHFFFAOYSA-N",
            "smiles": "CC(=O)OC1=CC=CC=C1C(=O)O",
            "global_frequency": 22,
        }
    },
}

SURECHEMBL_SMILES_EMPTY_FIXTURE: dict[str, Any] = {
    "status": "OK",
    "timestamp": 1700000000,
    "error_message": "",
    "data": {},
}

SURECHEMBL_NAME_FIXTURE: dict[str, Any] = {
    "status": "OK",
    "timestamp": 1700000000,
    "error_message": "",
    "data": [
        {
            "chemical_id": "999",
            "name": "aspirin (other)",
            "inchi_key": "ZZZZZZZZZZZZZZ-UHFFFAOYSA-N",
            "global_frequency": 5,
        },
        {
            "chemical_id": "1353",
            "name": "aspirin",
            "inchi_key": "BSYNRYMUTXBXSQ-UHFFFAOYSA-N",
            "global_frequency": 22,
        },
    ],
}

SURECHEMBL_DOCUMENTS_FIXTURE: dict[str, Any] = {
    "status": "OK",
    "timestamp": 1700000000,
    "error_message": "",
    "data": {
        "results": {
            "total_hits": 692924,
            "documents": [
                {
                    "docId": "CN-102369480-A",
                    "metadata": {
                        "pd": "2012-03-07",
                        "titles": [
                            {"lang": "fr", "titles": ["Composé de revêtement"]},
                            {"lang": "en", "titles": ["Coating compound"]},
                        ],
                        "pdfLink": "",
                    },
                    "pa": "ACME Corp",
                },
                {
                    # "null" string sentinels and a non-en-only title block.
                    "docId": "US-1234567-B2",
                    "metadata": {
                        "pd": "null",
                        "titles": [
                            {"lang": "de", "titles": ["Beschichtungsmittel"]},
                        ],
                        "pdfLink": "",
                    },
                    "pa": "null",
                },
                {
                    # Missing metadata/titles entirely.
                    "docId": "JP-7654321-B",
                },
            ],
            "query": "chemicalIds:1353",
        }
    },
}

SURECHEMBL_DOCUMENTS_EMPTY_FIXTURE: dict[str, Any] = {
    "status": "OK",
    "timestamp": 1700000000,
    "error_message": "",
    "data": {"results": {"total_hits": 0, "documents": [], "query": "chemicalIds:1353"}},
}


# Realistic patents.google.com XHR shape: results.total_num_results plus a
# relevance-ordered cluster[0].result[] of {patent: {...}} entries.
GOOGLE_PATENTS_FIXTURE: dict[str, Any] = {
    "results": {
        "total_num_results": 12345,
        "cluster": [
            {
                "result": [
                    {
                        "patent": {
                            "publication_number": "US20100130542A1",
                            # HTML entities (&hellip;) + <b> tags must be cleaned.
                            "title": "Composition Comprising <b>Aspirin</b> and a &hellip;",
                            "snippet": "A composition comprising aspirin&hellip;",
                            "assignee": "The Curators Of The University Of Missouri",
                            "inventor": "Jane Researcher",
                            "priority_date": "2008-11-26",
                            "filing_date": "2009-11-25",
                            "publication_date": "2010-05-27",
                            "grant_date": "",
                            "pdf": "pdfs/US20100130542A1.pdf",
                        }
                    },
                    {
                        # No publication_date: must fall back to grant_date.
                        # No assignee: stays None. Plain title (no entities).
                        "patent": {
                            "publication_number": "EP1234567B1",
                            "title": "Aspirin formulation",
                            "snippet": "An aspirin formulation.",
                            "assignee": "",
                            "inventor": "John Inventor",
                            "priority_date": "2005-01-01",
                            "filing_date": "2006-01-01",
                            "publication_date": "",
                            "grant_date": "2012-08-15",
                            "pdf": "",
                        }
                    },
                    {
                        # No publication/grant: must fall back to filing_date.
                        # Missing title entirely -> UNTITLED placeholder.
                        "patent": {
                            "publication_number": "JP2007123456A",
                            "assignee": "Acme KK",
                            "priority_date": "2004-02-02",
                            "filing_date": "2007-03-03",
                        }
                    },
                ]
            }
        ],
    }
}

GOOGLE_PATENTS_EMPTY_FIXTURE: dict[str, Any] = {
    "results": {"total_num_results": 0, "cluster": [{"result": []}]}
}


def http_diag() -> HttpDiagnostics:
    return HttpDiagnostics(latency_ms=5, cached=False, retry_count=0)


class FakeHttp:
    """Returns queued payloads; an Exception entry is raised instead.

    Both ``get_json`` and ``post_json`` draw from the same FIFO queue so the
    SureChEMBL two-call flow (POST/GET resolve then POST documents) can be
    scripted in order.
    """

    def __init__(self, payloads: list):
        self.payloads = list(payloads)
        self.urls: list[str] = []
        self.methods: list[str] = []
        self.headers: list[dict[str, str]] = []

    def _next(
        self, method: str, url: str, headers: dict[str, str] | None
    ) -> tuple[dict[str, Any], HttpDiagnostics]:
        self.urls.append(url)
        self.methods.append(method)
        self.headers.append(headers or {})
        item = self.payloads.pop(0)
        if isinstance(item, Exception):
            raise item
        return item, http_diag()

    def get_json(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        cache_ttl_seconds: int = 0,
        retries: int = 0,
    ) -> tuple[dict[str, Any], HttpDiagnostics]:
        return self._next("GET", url, headers)

    def post_json(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        json_body: Any | None = None,
        cache_ttl_seconds: int = 0,
        retries: int = 0,
    ) -> tuple[dict[str, Any], HttpDiagnostics]:
        return self._next("POST", url, headers)


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


class OpenAlexTests(unittest.TestCase):
    def test_parses_papers_from_fixture(self):
        provider = OpenAlexProvider(FakeHttp([OPENALEX_FIXTURE]))

        papers, diagnostics = provider.search_papers("aspirin", 10)

        self.assertEqual(diagnostics.status, "ok")
        self.assertEqual(diagnostics.name, "openalex")
        self.assertEqual(len(papers), 2)
        first = papers[0]
        self.assertEqual(first.id, "openalex:https://openalex.org/W2741809807")
        self.assertEqual(
            first.title, "Aspirin in the primary prevention of cardiovascular disease"
        )
        self.assertEqual(first.authors, ["Jane Roe", "John Doe"])
        self.assertEqual(first.venue, "Journal of the American College of Cardiology")
        self.assertEqual(first.year, 2017)
        self.assertEqual(first.doi, "10.1016/j.jacc.2017.03.001")
        self.assertEqual(first.url, "https://doi.org/10.1016/j.jacc.2017.03.001")
        self.assertEqual(first.citations, 321)
        self.assertEqual(first.abstract, "Aspirin irreversibly inhibits platelet cyclooxygenase.")
        self.assertEqual(first.source, "openalex")

    def test_missing_fields_become_none_or_defaults(self):
        provider = OpenAlexProvider(FakeHttp([OPENALEX_FIXTURE]))

        papers, _ = provider.search_papers("aspirin", 10)
        sparse = papers[1]

        self.assertEqual(sparse.title, UNTITLED_PAPER)
        self.assertEqual(sparse.authors, [])
        self.assertIsNone(sparse.venue)
        self.assertIsNone(sparse.year)
        self.assertIsNone(sparse.doi)
        self.assertIsNone(sparse.citations)
        self.assertIsNone(sparse.abstract)
        # No DOI and a null primary_location fall back to the work id URL.
        self.assertEqual(sparse.url, "https://openalex.org/W0000000000")

    def test_doi_prefix_stripping_is_case_insensitive(self):
        fixture = {
            "meta": {"count": 1},
            "results": [
                {
                    "id": "https://openalex.org/W1",
                    "display_name": "Shouting DOI",
                    "doi": "HTTPS://DOI.ORG/10.1000/UPPER.case",
                }
            ],
        }
        provider = OpenAlexProvider(FakeHttp([fixture]))

        papers, _ = provider.search_papers("aspirin", 10)

        self.assertEqual(papers[0].doi, "10.1000/UPPER.case")
        self.assertEqual(papers[0].url, "https://doi.org/10.1000/UPPER.case")

    def test_url_falls_back_to_landing_page_when_doi_missing(self):
        fixture = {
            "meta": {"count": 1},
            "results": [
                {
                    "id": "https://openalex.org/W2",
                    "display_name": "Landing page only",
                    "primary_location": {
                        "source": None,
                        "landing_page_url": "https://example.org/landing",
                    },
                }
            ],
        }
        provider = OpenAlexProvider(FakeHttp([fixture]))

        papers, _ = provider.search_papers("aspirin", 10)

        self.assertIsNone(papers[0].doi)
        self.assertEqual(papers[0].url, "https://example.org/landing")
        self.assertIsNone(papers[0].venue)

    def test_abstract_reconstruction_orders_words_by_position(self):
        fixture = {
            "meta": {"count": 1},
            "results": [
                {
                    "id": "https://openalex.org/W3",
                    "display_name": "Inverted index",
                    "abstract_inverted_index": {
                        "the": [0, 3],
                        "sat": [2],
                        "mat.": [4],
                        "cat": [1],
                    },
                }
            ],
        }
        provider = OpenAlexProvider(FakeHttp([fixture]))

        papers, _ = provider.search_papers("aspirin", 10)

        self.assertEqual(papers[0].abstract, "the cat sat the mat.")

    def test_abstract_is_capped(self):
        fixture = {
            "meta": {"count": 1},
            "results": [
                {
                    "id": "https://openalex.org/W4",
                    "display_name": "Very long abstract",
                    "abstract_inverted_index": {"verbose": list(range(1000))},
                }
            ],
        }
        provider = OpenAlexProvider(FakeHttp([fixture]))

        papers, _ = provider.search_papers("aspirin", 10)

        self.assertEqual(len(papers[0].abstract), OPENALEX_ABSTRACT_MAX_CHARS)

    def test_uses_search_and_per_page_params(self):
        http = FakeHttp([OPENALEX_FIXTURE])
        with patch.dict("os.environ", {}, clear=True):
            OpenAlexProvider(http).search_papers("acetylsalicylic acid", 7)

        self.assertIn("search=acetylsalicylic%20acid", http.urls[0])
        self.assertIn("per-page=7", http.urls[0])
        self.assertNotIn("mailto", http.urls[0])

    def test_mailto_prefers_openalex_env_over_crossref(self):
        http = FakeHttp([OPENALEX_FIXTURE])
        env = {"OPENALEX_MAILTO": "openalex@example.org", "CROSSREF_MAILTO": "crossref@example.org"}
        with patch.dict("os.environ", env, clear=True):
            OpenAlexProvider(http).search_papers("aspirin", 10)

        self.assertIn("mailto=openalex%40example.org", http.urls[0])

    def test_mailto_falls_back_to_crossref_env(self):
        http = FakeHttp([OPENALEX_FIXTURE])
        with patch.dict("os.environ", {"CROSSREF_MAILTO": "crossref@example.org"}, clear=True):
            OpenAlexProvider(http).search_papers("aspirin", 10)

        self.assertIn("mailto=crossref%40example.org", http.urls[0])

    def test_empty_response_is_empty_status(self):
        provider = OpenAlexProvider(FakeHttp([OPENALEX_EMPTY_FIXTURE]))

        papers, diagnostics = provider.search_papers("aspirin", 10)

        self.assertEqual(papers, [])
        self.assertEqual(diagnostics.status, "empty")

    def test_rate_limit_maps_to_rate_limited_status(self):
        error = ProviderHttpError("rate_limited", "HTTP 429", http_diag(), http_status=429)
        provider = OpenAlexProvider(FakeHttp([error]))

        papers, diagnostics = provider.search_papers("aspirin", 10)

        self.assertEqual(papers, [])
        self.assertEqual(diagnostics.status, "rate_limited")

    def test_timeout_maps_to_timeout_status(self):
        error = ProviderHttpError("timeout", "timed out", http_diag())
        provider = OpenAlexProvider(FakeHttp([error]))

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


class SureChemblTests(unittest.TestCase):
    def test_smiles_lookup_then_documents_parses_patents(self):
        http = FakeHttp([SURECHEMBL_SMILES_FIXTURE, SURECHEMBL_DOCUMENTS_FIXTURE])
        provider = SureChemblProvider(http)

        patents, total_hits, diagnostics = provider.search_patents(
            smiles="CC(=O)OC1=CC=CC=C1C(=O)O",
            compound_name="aspirin",
            inchi_key="BSYNRYMUTXBXSQ-UHFFFAOYSA-N",
            limit=10,
        )

        self.assertEqual(diagnostics.status, "ok")
        self.assertEqual(diagnostics.name, "surechembl")
        self.assertEqual(total_hits, 692924)
        # The two-call flow: POST smiles lookup, then POST documents.
        self.assertEqual(http.methods, ["POST", "POST"])
        self.assertIn("/chemical/smiles/?smiles=", http.urls[0])
        self.assertIn("documents_for_structures?chemicalIds=1353", http.urls[1])
        self.assertIn("itemsPerPage=10", http.urls[1])

        first = patents[0]
        self.assertEqual(first.id, "CN-102369480-A")
        self.assertEqual(first.publication_number, "CN102369480A")
        self.assertEqual(first.title, "Coating compound")  # prefers lang "en"
        self.assertEqual(first.url, "https://patents.google.com/patent/CN102369480A/en")
        self.assertEqual(first.date, "2012-03-07")
        self.assertEqual(first.assignee, "ACME Corp")
        self.assertEqual(first.source, "surechembl")

    def test_null_strings_become_none_and_non_en_title_used(self):
        http = FakeHttp([SURECHEMBL_SMILES_FIXTURE, SURECHEMBL_DOCUMENTS_FIXTURE])
        provider = SureChemblProvider(http)

        patents, _, _ = provider.search_patents(
            smiles="CC(=O)OC1=CC=CC=C1C(=O)O",
            compound_name="aspirin",
            inchi_key=None,
            limit=10,
        )

        second = patents[1]
        self.assertEqual(second.publication_number, "US1234567B2")
        # No English title block: fall back to the first available title.
        self.assertEqual(second.title, "Beschichtungsmittel")
        # The literal string "null" maps to None.
        self.assertIsNone(second.date)
        self.assertIsNone(second.assignee)

    def test_missing_metadata_uses_untitled_placeholder(self):
        http = FakeHttp([SURECHEMBL_SMILES_FIXTURE, SURECHEMBL_DOCUMENTS_FIXTURE])
        provider = SureChemblProvider(http)

        patents, _, _ = provider.search_patents(
            smiles="CC(=O)OC1=CC=CC=C1C(=O)O",
            compound_name="aspirin",
            inchi_key=None,
            limit=10,
        )

        third = patents[2]
        self.assertEqual(third.publication_number, "JP7654321B")
        self.assertEqual(third.title, UNTITLED_PATENT)
        self.assertIsNone(third.date)
        self.assertIsNone(third.assignee)

    def test_name_fallback_prefers_inchi_key_match(self):
        # Empty smiles lookup forces the name fallback; the inchi_key match
        # (chemical_id 1353) must win over the higher-frequency-ordered first
        # entry.
        http = FakeHttp(
            [
                SURECHEMBL_SMILES_EMPTY_FIXTURE,
                SURECHEMBL_NAME_FIXTURE,
                SURECHEMBL_DOCUMENTS_FIXTURE,
            ]
        )
        provider = SureChemblProvider(http)

        patents, total_hits, diagnostics = provider.search_patents(
            smiles="CC(=O)OC1=CC=CC=C1C(=O)O",
            compound_name="aspirin",
            inchi_key="BSYNRYMUTXBXSQ-UHFFFAOYSA-N",
            limit=10,
        )

        self.assertEqual(diagnostics.status, "ok")
        self.assertEqual(http.methods, ["POST", "GET", "POST"])
        self.assertIn("/chemical/name/aspirin", http.urls[1])
        self.assertIn("chemicalIds=1353", http.urls[2])
        self.assertEqual(total_hits, 692924)
        self.assertTrue(patents)

    def test_name_fallback_inchi_key_match_is_case_insensitive(self):
        http = FakeHttp(
            [
                SURECHEMBL_SMILES_EMPTY_FIXTURE,
                SURECHEMBL_NAME_FIXTURE,
                SURECHEMBL_DOCUMENTS_FIXTURE,
            ]
        )
        provider = SureChemblProvider(http)

        provider.search_patents(
            smiles="CC(=O)OC1=CC=CC=C1C(=O)O",
            compound_name="aspirin",
            inchi_key="bsynrymutxbxsq-uhfffaoysa-n",
            limit=10,
        )

        self.assertIn("chemicalIds=1353", http.urls[2])

    def test_name_fallback_without_inchi_key_picks_highest_frequency(self):
        http = FakeHttp(
            [
                SURECHEMBL_SMILES_EMPTY_FIXTURE,
                SURECHEMBL_NAME_FIXTURE,
                SURECHEMBL_DOCUMENTS_FIXTURE,
            ]
        )
        provider = SureChemblProvider(http)

        provider.search_patents(
            smiles="CC(=O)OC1=CC=CC=C1C(=O)O",
            compound_name="aspirin",
            inchi_key=None,
            limit=10,
        )

        # global_frequency 22 (id 1353) beats 5 (id 999).
        self.assertIn("chemicalIds=1353", http.urls[2])

    def test_no_smiles_uses_name_lookup_directly(self):
        http = FakeHttp([SURECHEMBL_NAME_FIXTURE, SURECHEMBL_DOCUMENTS_FIXTURE])
        provider = SureChemblProvider(http)

        patents, _, diagnostics = provider.search_patents(
            smiles=None,
            compound_name="aspirin",
            inchi_key="BSYNRYMUTXBXSQ-UHFFFAOYSA-N",
            limit=10,
        )

        self.assertEqual(diagnostics.status, "ok")
        self.assertEqual(http.methods, ["GET", "POST"])
        self.assertTrue(patents)

    def test_unresolved_chemical_id_is_empty_status(self):
        # SMILES empty and no name available -> nothing to resolve.
        http = FakeHttp([SURECHEMBL_SMILES_EMPTY_FIXTURE])
        provider = SureChemblProvider(http)

        patents, total_hits, diagnostics = provider.search_patents(
            smiles="CC(=O)OC1=CC=CC=C1C(=O)O",
            compound_name=None,
            inchi_key=None,
            limit=10,
        )

        self.assertEqual(patents, [])
        self.assertIsNone(total_hits)
        self.assertEqual(diagnostics.status, "empty")

    def test_documents_empty_is_empty_status(self):
        http = FakeHttp([SURECHEMBL_SMILES_FIXTURE, SURECHEMBL_DOCUMENTS_EMPTY_FIXTURE])
        provider = SureChemblProvider(http)

        patents, total_hits, diagnostics = provider.search_patents(
            smiles="CC(=O)OC1=CC=CC=C1C(=O)O",
            compound_name="aspirin",
            inchi_key=None,
            limit=10,
        )

        self.assertEqual(patents, [])
        self.assertEqual(total_hits, 0)
        self.assertEqual(diagnostics.status, "empty")

    def test_rate_limit_maps_to_rate_limited_status(self):
        error = ProviderHttpError("rate_limited", "HTTP 429", http_diag(), http_status=429)
        provider = SureChemblProvider(FakeHttp([error]))

        patents, total_hits, diagnostics = provider.search_patents(
            smiles="CCO",
            compound_name="ethanol",
            inchi_key=None,
            limit=10,
        )

        self.assertEqual(patents, [])
        self.assertIsNone(total_hits)
        self.assertEqual(diagnostics.status, "rate_limited")

    def test_documents_error_maps_to_error_status(self):
        error = ProviderHttpError("error", "HTTP 503", http_diag(), http_status=503)
        http = FakeHttp([SURECHEMBL_SMILES_FIXTURE, error])
        provider = SureChemblProvider(http)

        patents, _, diagnostics = provider.search_patents(
            smiles="CC(=O)OC1=CC=CC=C1C(=O)O",
            compound_name="aspirin",
            inchi_key=None,
            limit=10,
        )

        self.assertEqual(patents, [])
        self.assertEqual(diagnostics.status, "error")


class GooglePatentsTests(unittest.TestCase):
    def test_parses_relevance_ranked_patents_from_fixture(self):
        http = FakeHttp([GOOGLE_PATENTS_FIXTURE])
        provider = GooglePatentsProvider(http)

        patents, total_hits, diagnostics = provider.search_patents(query="aspirin", limit=10)

        self.assertEqual(diagnostics.status, "ok")
        self.assertEqual(diagnostics.name, "google_patents")
        self.assertEqual(total_hits, 12345)
        self.assertEqual(len(patents), 3)

        first = patents[0]
        self.assertEqual(first.id, "US20100130542A1")
        self.assertEqual(first.publication_number, "US20100130542A1")
        # HTML tags stripped and entities decoded.
        self.assertEqual(first.title, "Composition Comprising Aspirin and a …")
        self.assertEqual(first.url, "https://patents.google.com/patent/US20100130542A1/en")
        self.assertEqual(first.assignee, "The Curators Of The University Of Missouri")
        # publication_date preferred.
        self.assertEqual(first.date, "2010-05-27")
        self.assertEqual(first.source, "google_patents")

    def test_date_falls_back_to_grant_then_filing(self):
        http = FakeHttp([GOOGLE_PATENTS_FIXTURE])
        provider = GooglePatentsProvider(http)

        patents, _, _ = provider.search_patents(query="aspirin", limit=10)

        # Empty publication_date -> grant_date.
        self.assertEqual(patents[1].date, "2012-08-15")
        self.assertIsNone(patents[1].assignee)  # empty assignee string -> None
        # No publication/grant -> filing_date.
        self.assertEqual(patents[2].date, "2007-03-03")

    def test_missing_title_uses_untitled_placeholder(self):
        http = FakeHttp([GOOGLE_PATENTS_FIXTURE])
        provider = GooglePatentsProvider(http)

        patents, _, _ = provider.search_patents(query="aspirin", limit=10)

        self.assertEqual(patents[2].title, UNTITLED_PATENT)

    def test_request_wraps_query_and_sends_browser_user_agent(self):
        http = FakeHttp([GOOGLE_PATENTS_FIXTURE])
        provider = GooglePatentsProvider(http)

        provider.search_patents(query="acetylsalicylic acid", limit=7)

        url = http.urls[0]
        self.assertIn("patents.google.com/xhr/query", url)
        # The inner "q=...&num=..." string is URL-encoded as the outer url= value.
        self.assertIn("url=q%3Dacetylsalicylic%2520acid%26num%3D7", url)
        self.assertTrue(url.endswith("&exp="))
        # A browser User-Agent header is required or Google returns 403.
        self.assertEqual(http.headers[0]["User-Agent"], GOOGLE_PATENTS_USER_AGENT)

    def test_empty_results_is_empty_status(self):
        provider = GooglePatentsProvider(FakeHttp([GOOGLE_PATENTS_EMPTY_FIXTURE]))

        patents, total_hits, diagnostics = provider.search_patents(query="aspirin", limit=10)

        self.assertEqual(patents, [])
        self.assertEqual(total_hits, 0)
        self.assertEqual(diagnostics.status, "empty")

    def test_missing_results_block_is_graceful_error(self):
        # Google occasionally returns an unexpected shape (e.g. a parsed block
        # page); the provider degrades to an "error" diagnostic, not a crash.
        provider = GooglePatentsProvider(FakeHttp([{"unexpected": "shape"}]))

        patents, total_hits, diagnostics = provider.search_patents(query="aspirin", limit=10)

        self.assertEqual(patents, [])
        self.assertIsNone(total_hits)
        self.assertEqual(diagnostics.status, "error")

    def test_blocked_datacenter_ip_403_maps_to_error(self):
        # Google blocks datacenter IPs (e.g. the HF Space) with HTTP 403; this
        # must surface as a graceful "error" so the patents tab still renders
        # SureChEMBL/KIPRIS results.
        error = ProviderHttpError("error", "HTTP 403", http_diag(), http_status=403)
        provider = GooglePatentsProvider(FakeHttp([error]))

        patents, total_hits, diagnostics = provider.search_patents(query="aspirin", limit=10)

        self.assertEqual(patents, [])
        self.assertIsNone(total_hits)
        self.assertEqual(diagnostics.status, "error")

    def test_rate_limit_maps_to_rate_limited_status(self):
        error = ProviderHttpError("rate_limited", "HTTP 429", http_diag(), http_status=429)
        provider = GooglePatentsProvider(FakeHttp([error]))

        patents, total_hits, diagnostics = provider.search_patents(query="aspirin", limit=10)

        self.assertEqual(patents, [])
        self.assertIsNone(total_hits)
        self.assertEqual(diagnostics.status, "rate_limited")


if __name__ == "__main__":
    unittest.main()
