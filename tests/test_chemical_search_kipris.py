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
    KIPRIS_CACHE_TTL,
    KIPRIS_SERVICE_KEY_ENV,
    KiprisProvider,
    is_kipris_enabled,
)


# KIPRIS Plus REST freeSearchInfo response shape: resultCode "00" on success,
# rows are <PatentUtilityInfo> under body/items, total in <count>/<TotalSearchCount>.
KIPRIS_XML = """<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header>
    <requestMsgID/>
    <responseTime>2026-06-11 17:45:20</responseTime>
    <successYN/>
    <resultCode>00</resultCode>
    <resultMsg>success</resultMsg>
  </header>
  <body>
    <items>
      <PatentUtilityInfo>
        <InventionName>아스피린 제조 방법</InventionName>
        <Applicant>한국화학연구원</Applicant>
        <ApplicationNumber>1020200012345</ApplicationNumber>
        <ApplicationDate>20200101</ApplicationDate>
        <OpeningNumber>1020210099999</OpeningNumber>
        <OpeningDate>20210701</OpeningDate>
        <PublicNumber>1020220011111</PublicNumber>
        <PublicDate>20220301</PublicDate>
        <RegistrationStatus>등록</RegistrationStatus>
        <Abstract>아스피린의 합성에 관한 초록</Abstract>
        <InternationalpatentclassificationNumber>C07C 51/00</InternationalpatentclassificationNumber>
      </PatentUtilityInfo>
      <PatentUtilityInfo>
        <InventionName>이부프로펜 조성물</InventionName>
        <Applicant></Applicant>
        <ApplicationNumber>2020100054321</ApplicationNumber>
        <ApplicationDate></ApplicationDate>
        <RegistrationStatus>공개</RegistrationStatus>
      </PatentUtilityInfo>
    </items>
  </body>
  <count>
    <TotalSearchCount>1234</TotalSearchCount>
    <PageNo>1</PageNo>
    <NumOfRows>10</NumOfRows>
  </count>
</response>
"""

KIPRIS_EMPTY_XML = """<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header>
    <resultCode>00</resultCode>
    <resultMsg>success</resultMsg>
  </header>
  <body>
    <items></items>
  </body>
  <count>
    <TotalSearchCount>0</TotalSearchCount>
  </count>
</response>
"""

KIPRIS_ERROR_XML = """<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header>
    <resultCode>10</resultCode>
    <resultMsg>INVALID_REQUEST_PARAMETER_ERROR</resultMsg>
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
        self.get_text_ttls: list[int] = []

    def get_text(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        cache_ttl_seconds: int = 0,
        retries: int = 0,
    ) -> tuple[str, HttpDiagnostics]:
        self.urls.append(url)
        self.get_text_ttls.append(cache_ttl_seconds)
        item = self.payloads.pop(0)
        if isinstance(item, Exception):
            raise item
        return item, http_diag()


class FakeCachingTextHttp(FakeTextHttp):
    """Adds an in-memory success-only cache mirroring HttpClient's text cache.

    ``get_text`` never auto-caches (the provider always passes
    ``cache_ttl_seconds=0``); only explicit ``set_cached_text`` calls populate
    the store, so this lets tests assert that KIPRIS caches successes but not
    error/quota responses, and that a cache hit avoids a second fetch.
    """

    def __init__(self, payloads: list):
        super().__init__(payloads)
        self._store: dict[str, str] = {}
        self.set_calls: list[tuple[str, int]] = []

    def get_cached_text(
        self, url: str, *, headers: dict[str, str] | None = None
    ) -> str | None:
        return self._store.get(url)

    def set_cached_text(
        self,
        url: str,
        text: str,
        cache_ttl_seconds: int,
        *,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.set_calls.append((url, cache_ttl_seconds))
        if cache_ttl_seconds > 0:
            self._store[url] = text


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

    def test_request_sends_fixed_num_of_rows_independent_of_limit(self):
        # numOfRows must be the FIXED page size (not the caller's limit) so the
        # cache key does not fragment across 20/30/50-row requests and burn the
        # free-tier quota; the provider slices client-side instead.
        http = FakeTextHttp([KIPRIS_XML])
        provider = KiprisProvider(http)

        with with_key("my-key"):
            provider.search_patents(word="아스피린", limit=7)

        url = http.urls[0]
        self.assertIn("freeSearchInfo", url)
        self.assertIn("accessKey=my-key", url)
        self.assertIn(f"numOfRows={KiprisProvider.KIPRIS_NUM_OF_ROWS}", url)
        # The requested limit must NOT appear in the URL.
        self.assertNotIn("numOfRows=7", url)
        self.assertIn("pageNo=1", url)
        self.assertIn("patent=true", url)
        self.assertIn("utility=true", url)
        # Korean word is URL-encoded.
        self.assertIn("word=%", url)

    def test_results_sliced_to_requested_limit_client_side(self):
        # The fixture carries 2 rows; a limit of 1 must slice client-side while
        # the URL still asks for the fixed page size.
        http = FakeTextHttp([KIPRIS_XML])
        provider = KiprisProvider(http)

        with with_key("my-key"):
            patents, total_hits, _ = provider.search_patents(word="아스피린", limit=1)

        self.assertEqual(len(patents), 1)
        self.assertEqual(patents[0].title, "아스피린 제조 방법")
        # total_hits still reflects the upstream count, not the sliced length.
        self.assertEqual(total_hits, 1234)
        self.assertIn(
            f"numOfRows={KiprisProvider.KIPRIS_NUM_OF_ROWS}", http.urls[0]
        )

    def test_missing_fields_fall_back(self):
        http = FakeTextHttp([KIPRIS_XML])
        provider = KiprisProvider(http)

        with with_key("my-key"):
            patents, _, _ = provider.search_patents(word="ibuprofen", limit=10)

        second = patents[1]
        self.assertEqual(second.title, "이부프로펜 조성물")
        # Empty applicantName element -> None.
        self.assertIsNone(second.assignee)
        # No publication number -> publication_number falls back to the
        # application number for display.
        self.assertEqual(second.publication_number, "2020100054321")
        # Empty applicationDate -> None.
        self.assertIsNone(second.date)
        # ...but a Korean APPLICATION number does not map to a Google Patents
        # publication URL, so the link falls back to a KIPRIS search (no dead
        # patents.google.com/patent/KR... link).
        self.assertNotIn("patents.google.com", second.url or "")
        self.assertIn("kipris.or.kr/khome/search/searchResult.do", second.url or "")

    def test_empty_items_is_empty_status(self):
        http = FakeTextHttp([KIPRIS_EMPTY_XML])
        provider = KiprisProvider(http)

        with with_key("my-key"):
            patents, total_hits, diagnostics = provider.search_patents(word="aspirin", limit=10)

        self.assertEqual(patents, [])
        self.assertEqual(total_hits, 0)
        self.assertEqual(diagnostics.status, "empty")

    def test_error_result_code_is_error_and_message_sanitized(self):
        http = FakeTextHttp([KIPRIS_ERROR_XML])
        provider = KiprisProvider(http)

        with with_key("my-key"):
            patents, total_hits, diagnostics = provider.search_patents(word="aspirin", limit=10)

        self.assertEqual(patents, [])
        self.assertIsNone(total_hits)
        self.assertEqual(diagnostics.status, "error")
        # The upstream resultMsg must not leak to the client message.
        self.assertNotIn("INVALID_REQUEST", diagnostics.message or "")

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
          <header><resultCode>00</resultCode></header>
          <body><items>
            <PatentUtilityInfo><InventionName>제목만 있는 특허</InventionName></PatentUtilityInfo>
          </items></body>
          <count><TotalSearchCount>1</TotalSearchCount></count>
        </response>"""
        http = FakeTextHttp([no_number_xml])
        provider = KiprisProvider(http)

        with with_key("my-key"):
            patents, _, _ = provider.search_patents(word="aspirin", limit=10)

        self.assertEqual(patents[0].publication_number, "")
        self.assertEqual(patents[0].title, "제목만 있는 특허")
        self.assertIn("kipris.or.kr/khome/search/searchResult.do", patents[0].url)

    def test_registration_number_builds_google_patents_url(self):
        # A RegistrationNumber (a true publication/registration number) DOES map
        # to a Google Patents KR page, unlike an application number.
        reg_xml = """<?xml version="1.0"?>
        <response>
          <header><resultCode>00</resultCode></header>
          <body><items>
            <PatentUtilityInfo>
              <InventionName>등록 특허</InventionName>
              <ApplicationNumber>1020200012345</ApplicationNumber>
              <RegistrationNumber>1012345670000</RegistrationNumber>
            </PatentUtilityInfo>
          </items></body>
          <count><TotalSearchCount>1</TotalSearchCount></count>
        </response>"""
        http = FakeTextHttp([reg_xml])
        provider = KiprisProvider(http)

        with with_key("my-key"):
            patents, _, _ = provider.search_patents(word="aspirin", limit=10)

        self.assertEqual(patents[0].publication_number, "1012345670000")
        self.assertEqual(patents[0].url, "https://patents.google.com/patent/KR1012345670000")

    def test_application_number_only_does_not_build_google_url(self):
        # Application-number-only hit: publication_number falls back to the
        # application number for display, but the URL must be the KIPRIS search
        # fallback (Korean application numbers are not Google publication URLs).
        app_only_xml = """<?xml version="1.0"?>
        <response>
          <header><resultCode>00</resultCode></header>
          <body><items>
            <PatentUtilityInfo>
              <InventionName>출원만 된 특허</InventionName>
              <ApplicationNumber>1020200012345</ApplicationNumber>
            </PatentUtilityInfo>
          </items></body>
          <count><TotalSearchCount>1</TotalSearchCount></count>
        </response>"""
        http = FakeTextHttp([app_only_xml])
        provider = KiprisProvider(http)

        with with_key("my-key"):
            patents, _, _ = provider.search_patents(word="aspirin", limit=10)

        self.assertEqual(patents[0].publication_number, "1020200012345")
        self.assertNotIn("patents.google.com", patents[0].url or "")
        self.assertIn("kipris.or.kr/khome/search/searchResult.do", patents[0].url or "")

    def test_no_title_uses_placeholder(self):
        no_title_xml = """<?xml version="1.0"?>
        <response>
          <header><resultCode>00</resultCode></header>
          <body><items>
            <PatentUtilityInfo><ApplicationNumber>1020200012345</ApplicationNumber></PatentUtilityInfo>
          </items></body>
          <count><TotalSearchCount>1</TotalSearchCount></count>
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


class KiprisCachingTests(unittest.TestCase):
    def test_get_text_called_with_zero_ttl_no_raw_caching(self):
        # KIPRIS must fetch with cache_ttl_seconds=0 so the HTTP layer does not
        # blindly cache a 2xx body (which could be a quota/error envelope).
        http = FakeTextHttp([KIPRIS_XML])
        provider = KiprisProvider(http)

        with with_key("my-key"):
            provider.search_patents(word="아스피린", limit=10)

        self.assertEqual(http.get_text_ttls, [0])

    def test_success_response_is_cached(self):
        http = FakeCachingTextHttp([KIPRIS_XML])
        provider = KiprisProvider(http)

        with with_key("my-key"):
            patents, _, _ = provider.search_patents(word="아스피린", limit=10)

        self.assertEqual(len(patents), 2)
        # Exactly one cache write, with the 24h KIPRIS TTL (>0).
        self.assertEqual(len(http.set_calls), 1)
        _, ttl = http.set_calls[0]
        self.assertEqual(ttl, KIPRIS_CACHE_TTL)
        self.assertGreater(ttl, 0)

    def test_empty_success_response_is_cached(self):
        # resultCode "00" with zero rows is still a success and may be cached.
        http = FakeCachingTextHttp([KIPRIS_EMPTY_XML])
        provider = KiprisProvider(http)

        with with_key("my-key"):
            patents, total_hits, diagnostics = provider.search_patents(word="x", limit=10)

        self.assertEqual(patents, [])
        self.assertEqual(total_hits, 0)
        self.assertEqual(diagnostics.status, "empty")
        self.assertEqual(len(http.set_calls), 1)

    def test_error_result_code_response_is_not_cached(self):
        # resultCode != "00" (quota/parameter errors) signalled as HTTP 200 must
        # NOT be cached, or a quota error would stick for 24h after a reset.
        http = FakeCachingTextHttp([KIPRIS_ERROR_XML])
        provider = KiprisProvider(http)

        with with_key("my-key"):
            _, _, diagnostics = provider.search_patents(word="aspirin", limit=10)

        self.assertEqual(diagnostics.status, "error")
        self.assertEqual(http.set_calls, [])

    def test_malformed_xml_response_is_not_cached(self):
        http = FakeCachingTextHttp(["<not-xml<<<"])
        provider = KiprisProvider(http)

        with with_key("my-key"):
            _, _, diagnostics = provider.search_patents(word="aspirin", limit=10)

        self.assertEqual(diagnostics.status, "error")
        self.assertEqual(http.set_calls, [])

    def test_second_call_served_from_cache_without_refetch(self):
        # The first call caches the success body; the second must be served from
        # the cache (only ONE get_text fetch total) and report cached=True.
        http = FakeCachingTextHttp([KIPRIS_XML])  # one payload -> IndexError on a 2nd fetch
        provider = KiprisProvider(http)

        with with_key("my-key"):
            first, _, first_diag = provider.search_patents(word="아스피린", limit=10)
            second, _, second_diag = provider.search_patents(word="아스피린", limit=10)

        self.assertEqual(len(first), 2)
        self.assertEqual(len(second), 2)
        self.assertEqual(len(http.urls), 1)  # only the first call hit the network
        self.assertFalse(first_diag.cached)
        self.assertTrue(second_diag.cached)
        # The cache hit must not re-write the cache.
        self.assertEqual(len(http.set_calls), 1)

    def test_error_then_success_recovers_after_quota_reset(self):
        # An error response is not cached, so a follow-up retry (e.g. after the
        # quota resets) fetches fresh and succeeds instead of serving the error.
        http = FakeCachingTextHttp([KIPRIS_ERROR_XML, KIPRIS_XML])
        provider = KiprisProvider(http)

        with with_key("my-key"):
            _, _, first_diag = provider.search_patents(word="아스피린", limit=10)
            patents, _, second_diag = provider.search_patents(word="아스피린", limit=10)

        self.assertEqual(first_diag.status, "error")
        self.assertEqual(second_diag.status, "ok")
        self.assertEqual(len(patents), 2)
        self.assertEqual(len(http.urls), 2)  # both calls fetched (no error caching)


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


class FakeGooglePatents:
    name = "google_patents"

    def search_patents(self, *, query, limit):
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
        google_patents=FakeGooglePatents(),
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
            google_patents=FakeGooglePatents(),
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
