"""Fixture-based XML parsing + gating tests for the KIPRIS patent provider.

KIPRIS is key-gated: it runs only when ``KIPRIS_SERVICE_KEY`` is set. These
tests use a faked HttpClient (``get_text`` returns canned XML) and control the
env var with patch.dict so nothing touches the network or a real key.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from typing import Any
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from chemical_search.http_client import ProviderHttpError
from chemical_search.models import UNTITLED_PATENT, CompoundCandidate, HttpDiagnostics
from chemical_search.pipeline import SearchPipeline, default_sources
from chemical_search.providers import (
    KIPRIS_SERVICE_KEY_ENV,
    KiprisProvider,
    is_kipris_enabled,
)


KIPRIS_XML = """<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header>
    <successYN>Y</successYN>
    <resultCode>00</resultCode>
    <resultMsg>NORMAL SERVICE</resultMsg>
  </header>
  <body>
    <items>
      <item>
        <inventionTitle>아스피린 제조 방법</inventionTitle>
        <applicantName>한국화학연구원</applicantName>
        <applicationNumber>1020200012345</applicationNumber>
        <applicationDate>20200101</applicationDate>
        <openNumber>1020210099999</openNumber>
        <openDate>20210701</openDate>
        <publicationNumber>1020220011111</publicationNumber>
        <publicationDate>20220301</publicationDate>
        <registerStatus>등록</registerStatus>
        <astrtCont>아스피린의 합성에 관한 초록</astrtCont>
        <ipcNumber>C07C 51/00</ipcNumber>
      </item>
      <item>
        <inventionTitle>이부프로펜 조성물</inventionTitle>
        <applicantName></applicantName>
        <applicationNumber>2020100054321</applicationNumber>
        <applicationDate></applicationDate>
        <registerStatus>공개</registerStatus>
      </item>
    </items>
    <numOfRows>10</numOfRows>
    <pageNo>1</pageNo>
    <totalCount>1234</totalCount>
  </body>
</response>
"""

KIPRIS_EMPTY_XML = """<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header>
    <successYN>Y</successYN>
    <resultCode>00</resultCode>
    <resultMsg>NORMAL SERVICE</resultMsg>
  </header>
  <body>
    <items></items>
    <numOfRows>0</numOfRows>
    <pageNo>1</pageNo>
    <totalCount>0</totalCount>
  </body>
</response>
"""

KIPRIS_ERROR_XML = """<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header>
    <successYN>N</successYN>
    <resultCode>30</resultCode>
    <resultMsg>SERVICE KEY IS NOT REGISTERED ERROR</resultMsg>
  </header>
  <body></body>
</response>
"""


def http_diag() -> HttpDiagnostics:
    return HttpDiagnostics(latency_ms=4, cached=False, retry_count=0)


class FakeTextHttp:
    """Returns queued text payloads via ``get_text`` (Exceptions raise)."""

    def __init__(self, payloads: list):
        self.payloads = list(payloads)
        self.urls: list[str] = []

    def get_text(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        cache_ttl_seconds: int = 0,
        retries: int = 0,
    ) -> tuple[str, HttpDiagnostics]:
        self.urls.append(url)
        item = self.payloads.pop(0)
        if isinstance(item, Exception):
            raise item
        return item, http_diag()


def with_key(value: str = "test-service-key"):
    return patch.dict("os.environ", {KIPRIS_SERVICE_KEY_ENV: value})


def without_key():
    return patch.dict("os.environ", {}, clear=True)


class KiprisGatingTests(unittest.TestCase):
    def test_disabled_when_key_unset(self):
        with without_key():
            self.assertFalse(is_kipris_enabled())
            self.assertNotIn("kipris", default_sources())

    def test_blank_key_counts_as_unset(self):
        with patch.dict("os.environ", {KIPRIS_SERVICE_KEY_ENV: "   "}, clear=True):
            self.assertFalse(is_kipris_enabled())
            self.assertNotIn("kipris", default_sources())

    def test_enabled_when_key_set(self):
        with with_key():
            self.assertTrue(is_kipris_enabled())
            self.assertIn("kipris", default_sources())

    def test_provider_without_key_is_empty_no_error(self):
        # A direct call with no key returns an "empty" status (defensive); the
        # pipeline gates earlier so this never appears in providers[].
        http = FakeTextHttp([])  # would IndexError if a request were made
        provider = KiprisProvider(http)

        with without_key():
            patents, total_hits, diagnostics = provider.search_patents(word="aspirin", limit=10)

        self.assertEqual(patents, [])
        self.assertIsNone(total_hits)
        self.assertEqual(diagnostics.status, "empty")
        self.assertEqual(http.urls, [])


class KiprisParsingTests(unittest.TestCase):
    def test_parses_items_and_total_count(self):
        http = FakeTextHttp([KIPRIS_XML])
        provider = KiprisProvider(http)

        with with_key("my-key"):
            patents, total_hits, diagnostics = provider.search_patents(word="아스피린", limit=10)

        self.assertEqual(diagnostics.status, "ok")
        self.assertEqual(diagnostics.name, "kipris")
        self.assertEqual(total_hits, 1234)
        self.assertEqual(len(patents), 2)
        first = patents[0]
        self.assertEqual(first.title, "아스피린 제조 방법")
        self.assertEqual(first.assignee, "한국화학연구원")
        # publicationNumber wins over applicationNumber.
        self.assertEqual(first.publication_number, "1020220011111")
        self.assertEqual(first.date, "2020-01-01")  # applicationDate YYYYMMDD
        self.assertEqual(first.source, "kipris")
        # URL built from publication number digits.
        self.assertEqual(first.url, "https://patents.google.com/patent/KR1020220011111")

    def test_request_sends_expected_params(self):
        http = FakeTextHttp([KIPRIS_XML])
        provider = KiprisProvider(http)

        with with_key("my-key"):
            provider.search_patents(word="아스피린", limit=7)

        url = http.urls[0]
        self.assertIn("getWordSearch", url)
        self.assertIn("ServiceKey=my-key", url)
        self.assertIn("numOfRows=7", url)
        self.assertIn("pageNo=1", url)
        self.assertIn("patent=true", url)
        self.assertIn("utility=true", url)
        # Korean word is URL-encoded.
        self.assertIn("word=%", url)

    def test_missing_fields_fall_back(self):
        http = FakeTextHttp([KIPRIS_XML])
        provider = KiprisProvider(http)

        with with_key("my-key"):
            patents, _, _ = provider.search_patents(word="ibuprofen", limit=10)

        second = patents[1]
        self.assertEqual(second.title, "이부프로펜 조성물")
        # Empty applicantName element -> None.
        self.assertIsNone(second.assignee)
        # No publicationNumber -> falls back to applicationNumber.
        self.assertEqual(second.publication_number, "2020100054321")
        # Empty applicationDate -> None.
        self.assertIsNone(second.date)
        self.assertEqual(second.url, "https://patents.google.com/patent/KR2020100054321")

    def test_empty_items_is_empty_status(self):
        http = FakeTextHttp([KIPRIS_EMPTY_XML])
        provider = KiprisProvider(http)

        with with_key("my-key"):
            patents, total_hits, diagnostics = provider.search_patents(word="aspirin", limit=10)

        self.assertEqual(patents, [])
        self.assertEqual(total_hits, 0)
        self.assertEqual(diagnostics.status, "empty")

    def test_success_n_is_error_and_message_sanitized(self):
        http = FakeTextHttp([KIPRIS_ERROR_XML])
        provider = KiprisProvider(http)

        with with_key("my-key"):
            patents, total_hits, diagnostics = provider.search_patents(word="aspirin", limit=10)

        self.assertEqual(patents, [])
        self.assertIsNone(total_hits)
        self.assertEqual(diagnostics.status, "error")
        # The upstream resultMsg must not leak to the client message.
        self.assertNotIn("SERVICE KEY", diagnostics.message or "")

    def test_malformed_xml_is_error(self):
        http = FakeTextHttp(["<not-xml<<<"])
        provider = KiprisProvider(http)

        with with_key("my-key"):
            patents, total_hits, diagnostics = provider.search_patents(word="aspirin", limit=10)

        self.assertEqual(patents, [])
        self.assertIsNone(total_hits)
        self.assertEqual(diagnostics.status, "error")

    def test_url_falls_back_to_kipris_search_when_no_number(self):
        no_number_xml = """<?xml version="1.0"?>
        <response>
          <header><successYN>Y</successYN><resultCode>00</resultCode></header>
          <body><items>
            <item><inventionTitle>제목만 있는 특허</inventionTitle></item>
          </items><totalCount>1</totalCount></body>
        </response>"""
        http = FakeTextHttp([no_number_xml])
        provider = KiprisProvider(http)

        with with_key("my-key"):
            patents, _, _ = provider.search_patents(word="aspirin", limit=10)

        self.assertEqual(patents[0].publication_number, "")
        self.assertEqual(patents[0].title, "제목만 있는 특허")
        self.assertIn("kipris.or.kr/khome/search/searchResult.do", patents[0].url)

    def test_no_title_uses_placeholder(self):
        no_title_xml = """<?xml version="1.0"?>
        <response>
          <header><successYN>Y</successYN><resultCode>00</resultCode></header>
          <body><items>
            <item><applicationNumber>1020200012345</applicationNumber></item>
          </items><totalCount>1</totalCount></body>
        </response>"""
        http = FakeTextHttp([no_title_xml])
        provider = KiprisProvider(http)

        with with_key("my-key"):
            patents, _, _ = provider.search_patents(word="aspirin", limit=10)

        self.assertEqual(patents[0].title, UNTITLED_PATENT)

    def test_rate_limit_maps_to_rate_limited(self):
        error = ProviderHttpError("rate_limited", "HTTP 429", http_diag(), http_status=429)
        http = FakeTextHttp([error])
        provider = KiprisProvider(http)

        with with_key("my-key"):
            patents, total_hits, diagnostics = provider.search_patents(word="aspirin", limit=10)

        self.assertEqual(patents, [])
        self.assertIsNone(total_hits)
        self.assertEqual(diagnostics.status, "rate_limited")

    def test_timeout_maps_to_timeout(self):
        error = ProviderHttpError("timeout", "timed out", http_diag())
        http = FakeTextHttp([error])
        provider = KiprisProvider(http)

        with with_key("my-key"):
            _, _, diagnostics = provider.search_patents(word="aspirin", limit=10)

        self.assertEqual(diagnostics.status, "timeout")


# --- Pipeline-level KIPRIS integration (active vs inactive) ---


class FakePaperProvider:
    def __init__(self, name: str):
        self.name = name

    def search_papers(self, query, limit):
        from chemical_search.models import ProviderDiagnostics

        return [], ProviderDiagnostics(name=self.name, status="empty", latency_ms=1)


class FakeSureChembl:
    name = "surechembl"

    def search_patents(self, *, smiles, compound_name, inchi_key, limit):
        from chemical_search.models import ProviderDiagnostics

        return [], None, ProviderDiagnostics(name=self.name, status="empty", latency_ms=1)


class FakeKipris:
    name = "kipris"

    def __init__(self):
        self.calls: list[dict[str, Any]] = []

    def search_patents(self, *, word, limit):
        from chemical_search.models import PatentItem, ProviderDiagnostics

        self.calls.append({"word": word, "limit": limit})
        patent = PatentItem(
            id="1020200012345",
            publication_number="1020220011111",
            title="아스피린 특허",
            url="https://patents.google.com/patent/KR1020220011111",
            assignee="연구원",
            date="2020-01-01",
            source="kipris",
        )
        return [patent], 1234, ProviderDiagnostics(name="kipris", status="ok", latency_ms=2)


def aspirin_candidate() -> CompoundCandidate:
    return CompoundCandidate(
        candidate_id="pubchem:2244",
        title="Aspirin",
        formula="C9H8O4",
        smiles="CC(=O)Oc1ccccc1C(=O)O",
        cid=2244,
        inchi_key="BSYNRYMUTXBXSQ-UHFFFAOYSA-N",
    )


def make_pipeline(kipris: FakeKipris) -> SearchPipeline:
    return SearchPipeline(
        pubchem=object(),
        semantic_scholar=FakePaperProvider("semantic_scholar"),
        openalex=FakePaperProvider("openalex"),
        crossref=FakePaperProvider("crossref"),
        surechembl=FakeSureChembl(),
        kipris=kipris,
    )


class KiprisPipelineTests(unittest.TestCase):
    def test_inactive_when_no_key_default_sources(self):
        kipris = FakeKipris()
        pipeline = make_pipeline(kipris)

        with without_key():
            report = pipeline.run_papers("aspirin", aspirin_candidate(), sources=None)

        self.assertEqual(kipris.calls, [])
        self.assertNotIn("kipris", {p.name for p in report.providers})
        self.assertEqual(report.patents, [])

    def test_active_when_key_set_runs_and_parses(self):
        kipris = FakeKipris()
        pipeline = make_pipeline(kipris)

        with with_key("my-key"):
            report = pipeline.run_papers("아스피린", aspirin_candidate(), sources=None)

        self.assertEqual(len(kipris.calls), 1)
        # Korean user input is forwarded verbatim as the KIPRIS search word.
        self.assertEqual(kipris.calls[0]["word"], "아스피린")
        self.assertIn("kipris", {p.name for p in report.providers})
        self.assertEqual([p.source for p in report.patents], ["kipris"])
        self.assertEqual(report.patents_total_hits, 1234)

    def test_non_korean_query_uses_compound_name_for_kipris(self):
        kipris = FakeKipris()
        pipeline = make_pipeline(kipris)

        with with_key("my-key"):
            pipeline.run_papers("aspirin", aspirin_candidate(), sources=None)

        self.assertEqual(kipris.calls[0]["word"], "Aspirin")

    def test_explicit_kipris_source_without_key_is_dropped(self):
        kipris = FakeKipris()
        pipeline = make_pipeline(kipris)

        with without_key():
            report = pipeline.run_papers(
                "aspirin", aspirin_candidate(), sources=["kipris"]
            )

        self.assertEqual(kipris.calls, [])
        self.assertNotIn("kipris", {p.name for p in report.providers})

    def test_totals_summed_across_surechembl_and_kipris(self):
        kipris = FakeKipris()

        class SureChemblWithHits:
            name = "surechembl"

            def search_patents(self, *, smiles, compound_name, inchi_key, limit):
                from chemical_search.models import PatentItem, ProviderDiagnostics

                patent = PatentItem(
                    id="CN-1-A",
                    publication_number="CN1A",
                    title="SureChEMBL patent",
                    source="surechembl",
                )
                return [patent], 100, ProviderDiagnostics(
                    name="surechembl", status="ok", latency_ms=1
                )

        pipeline = SearchPipeline(
            pubchem=object(),
            semantic_scholar=FakePaperProvider("semantic_scholar"),
            openalex=FakePaperProvider("openalex"),
            crossref=FakePaperProvider("crossref"),
            surechembl=SureChemblWithHits(),
            kipris=kipris,
        )

        with with_key("my-key"):
            report = pipeline.run_papers("aspirin", aspirin_candidate(), sources=None)

        # 100 (surechembl) + 1234 (kipris) summed.
        self.assertEqual(report.patents_total_hits, 1334)
        self.assertEqual(len(report.patents), 2)


if __name__ == "__main__":
    unittest.main()
