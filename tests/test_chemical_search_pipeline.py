from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from chemical_search.models import (
    CompoundCandidate,
    PaperItem,
    PatentItem,
    ProviderDiagnostics,
)
from chemical_search.normalize import detect_input_type, normalize_structure
from chemical_search.pipeline import SearchPipeline, default_sources
from chemical_search.providers import (
    KIPRIS_SERVICE_KEY_ENV,
    SEMANTIC_SCHOLAR_API_KEY_ENV,
)


# Most behavior tests below predate source-gating and assume Semantic Scholar
# runs in the DEFAULT set (so the S2 fake provider is queried when sources=None).
# S2 is now only in defaults when its API key is set, so we set a dummy key for
# the whole module. Gating tests (DefaultSourcesGatingTests) override the env
# explicitly via patch.dict so they assert the real key-gated behavior.
_module_env = None


def setUpModule() -> None:
    global _module_env
    _module_env = patch.dict(
        "os.environ", {SEMANTIC_SCHOLAR_API_KEY_ENV: "test-s2-key"}
    )
    _module_env.start()


def tearDownModule() -> None:
    if _module_env is not None:
        _module_env.stop()


def aspirin_candidate() -> CompoundCandidate:
    return CompoundCandidate(
        candidate_id="pubchem:2244",
        title="Aspirin",
        formula="C9H8O4",
        smiles="CC(=O)Oc1ccccc1C(=O)O",
        cid=2244,
        inchi_key="BSYNRYMUTXBXSQ-UHFFFAOYSA-N",
    )


def paper(
    source: str,
    *,
    suffix: str = "1",
    title: str = "Aspirin paper",
    doi: str | None = None,
    citations: int | None = None,
    year: int | None = 2020,
    venue: str | None = None,
    abstract: str | None = None,
) -> PaperItem:
    return PaperItem(
        id=f"{source}:{suffix}",
        title=title,
        authors=["J. Smith"],
        venue=venue,
        year=year,
        doi=doi,
        url=f"https://example.org/{source}/{suffix}",
        citations=citations,
        abstract=abstract,
        source=source,
    )


class ExplodingPubChem:
    """Fails the test if the pipeline tries to re-fetch candidates."""

    def resolve_candidates(self, query: str, input_type: str, limit: int):
        raise AssertionError("run_papers must not re-fetch candidates from PubChem.")


class FakePaperProvider:
    def __init__(self, name: str, papers: list[PaperItem] | None = None, status: str = "ok"):
        self.name = name
        self.papers = papers if papers is not None else []
        self.status = status
        self.calls: list[str] = []

    def search_papers(self, query: str, limit: int) -> tuple[list[PaperItem], ProviderDiagnostics]:
        self.calls.append(query)
        message = None if self.status in {"ok", "empty"} else f"{self.name} failed"
        papers = self.papers if self.status == "ok" else []
        return list(papers), ProviderDiagnostics(
            name=self.name,
            status=self.status,
            latency_ms=1,
            message=message,
        )


def patent(suffix: str = "1", title: str = "Aspirin patent") -> PatentItem:
    return PatentItem(
        id=f"CN-{suffix}-A",
        publication_number=f"CN{suffix}A",
        title=title,
        url=f"https://patents.google.com/patent/CN{suffix}A/en",
        assignee="ACME Corp",
        date="2020-01-01",
        source="surechembl",
    )


class FakeSureChemblProvider:
    name = "surechembl"

    def __init__(
        self,
        patents: list[PatentItem] | None = None,
        status: str = "ok",
        total_hits: int | None = None,
    ):
        self.patents = patents if patents is not None else []
        self.status = status
        self.total_hits = total_hits
        self.calls: list[dict] = []

    def search_patents(self, *, smiles, compound_name, inchi_key, limit):
        self.calls.append(
            {
                "smiles": smiles,
                "compound_name": compound_name,
                "inchi_key": inchi_key,
                "limit": limit,
            }
        )
        message = None if self.status in {"ok", "empty"} else f"{self.name} failed"
        patents = self.patents if self.status == "ok" else []
        return (
            list(patents),
            self.total_hits,
            ProviderDiagnostics(
                name=self.name,
                status=self.status,
                latency_ms=1,
                message=message,
            ),
        )


def google_patent(suffix: str = "g1", title: str = "Aspirin google patent") -> PatentItem:
    return PatentItem(
        id=f"US{suffix}A1",
        publication_number=f"US{suffix}A1",
        title=title,
        url=f"https://patents.google.com/patent/US{suffix}A1/en",
        assignee="Google Assignee",
        date="2021-01-01",
        source="google_patents",
    )


class FakeGooglePatentsProvider:
    name = "google_patents"

    def __init__(
        self,
        patents: list[PatentItem] | None = None,
        status: str = "ok",
        total_hits: int | None = None,
    ):
        self.patents = patents if patents is not None else []
        self.status = status
        self.total_hits = total_hits
        self.calls: list[dict] = []

    def search_patents(self, *, query, limit):
        self.calls.append({"query": query, "limit": limit})
        message = None if self.status in {"ok", "empty"} else f"{self.name} failed"
        patents = self.patents if self.status == "ok" else []
        return (
            list(patents),
            self.total_hits,
            ProviderDiagnostics(
                name=self.name,
                status=self.status,
                latency_ms=1,
                message=message,
            ),
        )


def make_pipeline(
    semantic_scholar: FakePaperProvider,
    crossref: FakePaperProvider,
    openalex: FakePaperProvider | None = None,
    surechembl: FakeSureChemblProvider | None = None,
    google_patents: FakeGooglePatentsProvider | None = None,
) -> SearchPipeline:
    return SearchPipeline(
        pubchem=ExplodingPubChem(),
        semantic_scholar=semantic_scholar,
        openalex=openalex or FakePaperProvider("openalex", status="empty"),
        crossref=crossref,
        google_patents=google_patents or FakeGooglePatentsProvider(status="empty"),
        surechembl=surechembl or FakeSureChemblProvider(status="empty"),
    )


class NormalizeTests(unittest.TestCase):
    def test_detects_supported_input_types(self):
        self.assertEqual(detect_input_type("BSYNRYMUTXBXSQ-UHFFFAOYSA-N"), "inchi_key")
        self.assertEqual(detect_input_type("C9H8O4"), "formula")
        self.assertEqual(detect_input_type("CC(=O)Oc1ccccc1C(=O)O"), "smiles")
        self.assertEqual(detect_input_type("aspirin"), "name")

    def test_normalizes_aspirin(self):
        compound = normalize_structure("CC(=O)Oc1ccccc1C(=O)O", "smiles")
        self.assertEqual(compound.formula, "C9H8O4")
        self.assertEqual(compound.inchi_key, "BSYNRYMUTXBXSQ-UHFFFAOYSA-N")


class PipelineStatusTests(unittest.TestCase):
    def test_done_when_all_providers_return_papers(self):
        pipeline = make_pipeline(
            FakePaperProvider("semantic_scholar", [paper("semantic_scholar")]),
            FakePaperProvider("crossref", [paper("crossref", title="Other paper")]),
            openalex=FakePaperProvider("openalex", [paper("openalex", title="Third paper")]),
        )
        report = pipeline.run_papers("aspirin", aspirin_candidate(), detected_type="name")

        self.assertEqual(report.status, "done")
        self.assertIsNone(report.error)
        self.assertEqual(len(report.papers), 3)
        self.assertEqual(report.compound.inchi_key, "BSYNRYMUTXBXSQ-UHFFFAOYSA-N")
        self.assertEqual(report.compound.cid, 2244)

    def test_partial_when_one_provider_hard_errors(self):
        pipeline = make_pipeline(
            FakePaperProvider("semantic_scholar", status="rate_limited"),
            FakePaperProvider("crossref", [paper("crossref")]),
        )
        report = pipeline.run_papers("aspirin", aspirin_candidate())

        self.assertEqual(report.status, "partial")
        self.assertEqual(len(report.papers), 1)

    def test_failed_when_all_providers_hard_error(self):
        pipeline = make_pipeline(
            FakePaperProvider("semantic_scholar", status="timeout"),
            FakePaperProvider("crossref", status="error"),
            openalex=FakePaperProvider("openalex", status="rate_limited"),
            google_patents=FakeGooglePatentsProvider(status="error"),
            surechembl=FakeSureChemblProvider(status="error"),
        )
        report = pipeline.run_papers("aspirin", aspirin_candidate())

        self.assertEqual(report.status, "failed")
        self.assertIsNotNone(report.error)
        self.assertEqual(report.papers, [])
        self.assertEqual(report.patents, [])

    def test_empty_results_are_done_not_failed(self):
        pipeline = make_pipeline(
            FakePaperProvider("semantic_scholar", status="empty"),
            FakePaperProvider("crossref", status="empty"),
        )
        report = pipeline.run_papers("aspirin", aspirin_candidate())

        self.assertEqual(report.status, "done")
        self.assertIsNone(report.error)
        self.assertEqual(report.papers, [])
        self.assertEqual(report.patents, [])

    def test_done_with_patents_only_when_papers_empty(self):
        pipeline = make_pipeline(
            FakePaperProvider("semantic_scholar", status="empty"),
            FakePaperProvider("crossref", status="empty"),
            surechembl=FakeSureChemblProvider([patent()], total_hits=7),
        )
        report = pipeline.run_papers("aspirin", aspirin_candidate())

        self.assertEqual(report.status, "done")
        self.assertEqual(report.papers, [])
        self.assertEqual(len(report.patents), 1)
        self.assertEqual(report.patents_total_hits, 7)

    def test_partial_when_only_patent_provider_hard_errors(self):
        pipeline = make_pipeline(
            FakePaperProvider("semantic_scholar", [paper("semantic_scholar")]),
            FakePaperProvider("crossref", status="empty"),
            surechembl=FakeSureChemblProvider(status="rate_limited"),
        )
        report = pipeline.run_papers("aspirin", aspirin_candidate())

        self.assertEqual(report.status, "partial")
        self.assertEqual(len(report.papers), 1)
        self.assertEqual(report.patents, [])


class PipelineBehaviorTests(unittest.TestCase):
    def test_papers_are_deduplicated_by_doi(self):
        doi = "10.1000/Example"
        pipeline = make_pipeline(
            FakePaperProvider(
                "semantic_scholar",
                [paper("semantic_scholar", doi=doi.lower(), citations=None, venue=None)],
            ),
            FakePaperProvider(
                "crossref",
                [paper("crossref", title="Different title", doi=doi, citations=42, venue="J. Chem")],
            ),
        )
        report = pipeline.run_papers("aspirin", aspirin_candidate())

        self.assertEqual(len(report.papers), 1)
        merged = report.papers[0]
        self.assertEqual(merged.source, "semantic_scholar")
        self.assertEqual(merged.citations, 42)
        self.assertEqual(merged.venue, "J. Chem")

    def test_selected_candidate_object_is_used_without_refetch(self):
        semantic_scholar = FakePaperProvider("semantic_scholar", [paper("semantic_scholar")])
        crossref = FakePaperProvider("crossref", [paper("crossref")])
        pipeline = make_pipeline(semantic_scholar, crossref)
        candidate = aspirin_candidate()

        report = pipeline.run_papers("C9H8O4", candidate, detected_type="formula")

        # ExplodingPubChem would have raised on any re-fetch.
        self.assertEqual(report.compound.name, "Aspirin")
        self.assertEqual(report.compound.cid, candidate.cid)
        # The paper query uses the resolved compound name, not the raw query.
        self.assertEqual(semantic_scholar.calls, ["Aspirin"])
        self.assertEqual(crossref.calls, ["Aspirin"])

    def test_candidate_warnings_are_propagated_to_compound(self):
        candidate = aspirin_candidate()
        candidate.warnings = ["입체화학 정보가 없는 SMILES로 정규화되었습니다."]
        pipeline = make_pipeline(
            FakePaperProvider("semantic_scholar", [paper("semantic_scholar")]),
            FakePaperProvider("crossref", status="empty"),
        )
        report = pipeline.run_papers("aspirin", candidate)

        self.assertIn("입체화학 정보가 없는 SMILES로 정규화되었습니다.", report.compound.warnings)

    def test_sources_none_queries_all_paper_and_patent_providers(self):
        semantic_scholar = FakePaperProvider("semantic_scholar", [paper("semantic_scholar")])
        crossref = FakePaperProvider("crossref", [paper("crossref", title="Other")])
        openalex = FakePaperProvider("openalex", [paper("openalex", title="Third")])
        google_patents = FakeGooglePatentsProvider([google_patent()], total_hits=8)
        surechembl = FakeSureChemblProvider([patent()], total_hits=42)
        pipeline = make_pipeline(
            semantic_scholar,
            crossref,
            openalex=openalex,
            google_patents=google_patents,
            surechembl=surechembl,
        )

        report = pipeline.run_papers("aspirin", aspirin_candidate(), sources=None)

        self.assertEqual(len(semantic_scholar.calls), 1)
        self.assertEqual(len(openalex.calls), 1)
        self.assertEqual(len(crossref.calls), 1)
        self.assertEqual(len(google_patents.calls), 1)
        self.assertEqual(len(surechembl.calls), 1)
        self.assertEqual(
            {item.name for item in report.providers},
            {"semantic_scholar", "openalex", "crossref", "google_patents", "surechembl"},
        )
        self.assertEqual(len(report.patents), 2)
        # Google Patents (relevance-ranked) is ordered first, then SureChEMBL.
        self.assertEqual(
            [item.source for item in report.patents], ["google_patents", "surechembl"]
        )
        # patents_total_hits sums each patent source's reported total: 8 + 42.
        self.assertEqual(report.patents_total_hits, 50)

    def test_sources_subset_skips_other_providers(self):
        semantic_scholar = FakePaperProvider("semantic_scholar", [paper("semantic_scholar")])
        crossref = FakePaperProvider("crossref", [paper("crossref")])
        openalex = FakePaperProvider("openalex", [paper("openalex")])
        pipeline = make_pipeline(semantic_scholar, crossref, openalex=openalex)

        report = pipeline.run_papers("aspirin", aspirin_candidate(), sources=["crossref"])

        self.assertEqual(semantic_scholar.calls, [])
        self.assertEqual(openalex.calls, [])
        self.assertEqual(len(crossref.calls), 1)
        self.assertEqual([item.name for item in report.providers], ["crossref"])

    def test_sources_openalex_only_queries_only_openalex(self):
        semantic_scholar = FakePaperProvider("semantic_scholar", [paper("semantic_scholar")])
        crossref = FakePaperProvider("crossref", [paper("crossref")])
        openalex = FakePaperProvider("openalex", [paper("openalex", title="OpenAlex paper")])
        pipeline = make_pipeline(semantic_scholar, crossref, openalex=openalex)

        report = pipeline.run_papers("aspirin", aspirin_candidate(), sources=["openalex"])

        self.assertEqual(semantic_scholar.calls, [])
        self.assertEqual(crossref.calls, [])
        self.assertEqual(openalex.calls, ["Aspirin"])
        self.assertEqual([item.name for item in report.providers], ["openalex"])
        self.assertEqual([item.title for item in report.papers], ["OpenAlex paper"])

    def test_surechembl_only_source_skips_paper_providers(self):
        semantic_scholar = FakePaperProvider("semantic_scholar", [paper("semantic_scholar")])
        crossref = FakePaperProvider("crossref", [paper("crossref")])
        openalex = FakePaperProvider("openalex", [paper("openalex")])
        surechembl = FakeSureChemblProvider([patent()], total_hits=3)
        pipeline = make_pipeline(
            semantic_scholar, crossref, openalex=openalex, surechembl=surechembl
        )

        report = pipeline.run_papers(
            "aspirin", aspirin_candidate(), sources=["surechembl"]
        )

        self.assertEqual(semantic_scholar.calls, [])
        self.assertEqual(crossref.calls, [])
        self.assertEqual(openalex.calls, [])
        self.assertEqual(len(surechembl.calls), 1)
        self.assertEqual([item.name for item in report.providers], ["surechembl"])
        self.assertEqual(report.papers, [])
        self.assertEqual(len(report.patents), 1)
        self.assertEqual(report.patents_total_hits, 3)

    def test_surechembl_receives_resolved_compound_fields(self):
        surechembl = FakeSureChemblProvider([patent()])
        pipeline = make_pipeline(
            FakePaperProvider("semantic_scholar", status="empty"),
            FakePaperProvider("crossref", status="empty"),
            surechembl=surechembl,
        )

        pipeline.run_papers("aspirin", aspirin_candidate())

        call = surechembl.calls[0]
        self.assertEqual(call["compound_name"], "Aspirin")
        self.assertEqual(call["inchi_key"], "BSYNRYMUTXBXSQ-UHFFFAOYSA-N")
        self.assertTrue(call["smiles"])

    def test_google_patents_runs_with_resolved_compound_name(self):
        google_patents = FakeGooglePatentsProvider([google_patent()], total_hits=5)
        pipeline = make_pipeline(
            FakePaperProvider("semantic_scholar", status="empty"),
            FakePaperProvider("crossref", status="empty"),
            google_patents=google_patents,
        )

        # Korean input still resolves to the English compound name (Aspirin),
        # which is what Google Patents searches by.
        pipeline.run_papers("아스피린", aspirin_candidate(), sources=None)

        self.assertEqual(google_patents.calls[0]["query"], "Aspirin")

    def test_google_patents_only_source_skips_other_patent_providers(self):
        google_patents = FakeGooglePatentsProvider([google_patent()], total_hits=9)
        surechembl = FakeSureChemblProvider([patent()], total_hits=3)
        pipeline = make_pipeline(
            FakePaperProvider("semantic_scholar", status="empty"),
            FakePaperProvider("crossref", status="empty"),
            google_patents=google_patents,
            surechembl=surechembl,
        )

        report = pipeline.run_papers(
            "aspirin", aspirin_candidate(), sources=["google_patents"]
        )

        self.assertEqual(len(google_patents.calls), 1)
        self.assertEqual(surechembl.calls, [])
        self.assertEqual([item.name for item in report.providers], ["google_patents"])
        self.assertEqual([item.source for item in report.patents], ["google_patents"])
        self.assertEqual(report.patents_total_hits, 9)

    def test_merged_patents_order_google_first_then_surechembl(self):
        google_patents = FakeGooglePatentsProvider(
            [google_patent(suffix="g1", title="Google first")], total_hits=2
        )
        surechembl = FakeSureChemblProvider(
            [patent(suffix="2", title="SureChEMBL second")], total_hits=3
        )
        pipeline = make_pipeline(
            FakePaperProvider("semantic_scholar", status="empty"),
            FakePaperProvider("crossref", status="empty"),
            google_patents=google_patents,
            surechembl=surechembl,
        )

        report = pipeline.run_papers("aspirin", aspirin_candidate(), sources=None)

        self.assertEqual(
            [item.title for item in report.patents], ["Google first", "SureChEMBL second"]
        )
        self.assertEqual(
            [item.source for item in report.patents], ["google_patents", "surechembl"]
        )

    def test_cross_source_dedup_keeps_google_over_surechembl(self):
        # Both sources return the same publication_number; Google (first-seen,
        # relevance-ranked) must win the dedup.
        shared = "US20100130542A1"
        google_patents = FakeGooglePatentsProvider(
            [
                PatentItem(
                    id=shared,
                    publication_number=shared,
                    title="From Google",
                    source="google_patents",
                )
            ]
        )
        surechembl = FakeSureChemblProvider(
            [
                PatentItem(
                    id=shared,
                    publication_number=shared,
                    title="From SureChEMBL",
                    source="surechembl",
                )
            ]
        )
        pipeline = make_pipeline(
            FakePaperProvider("semantic_scholar", status="empty"),
            FakePaperProvider("crossref", status="empty"),
            google_patents=google_patents,
            surechembl=surechembl,
        )

        report = pipeline.run_papers("aspirin", aspirin_candidate(), sources=None)

        self.assertEqual(len(report.patents), 1)
        self.assertEqual(report.patents[0].source, "google_patents")
        self.assertEqual(report.patents[0].title, "From Google")

    def test_cross_source_dedup_collapses_hyphen_variants(self):
        # Google keeps the raw "CN-102369480-A" while SureChEMBL strips hyphens
        # ("CN102369480A"); normalized dedup must collapse them to one record
        # (Google first-seen wins) with Google's original display string.
        google_patents = FakeGooglePatentsProvider(
            [
                PatentItem(
                    id="CN-102369480-A",
                    publication_number="CN-102369480-A",
                    title="From Google",
                    source="google_patents",
                )
            ]
        )
        surechembl = FakeSureChemblProvider(
            [
                PatentItem(
                    id="CN102369480A",
                    publication_number="CN102369480A",
                    title="From SureChEMBL",
                    source="surechembl",
                )
            ]
        )
        pipeline = make_pipeline(
            FakePaperProvider("semantic_scholar", status="empty"),
            FakePaperProvider("crossref", status="empty"),
            google_patents=google_patents,
            surechembl=surechembl,
        )

        report = pipeline.run_papers("aspirin", aspirin_candidate(), sources=None)

        self.assertEqual(len(report.patents), 1)
        self.assertEqual(report.patents[0].source, "google_patents")
        self.assertEqual(report.patents[0].publication_number, "CN-102369480-A")

    def test_patents_are_deduplicated_by_publication_number(self):
        surechembl = FakeSureChemblProvider(
            [
                patent(suffix="1", title="First"),
                patent(suffix="1", title="Duplicate"),
                patent(suffix="2", title="Second"),
            ]
        )
        pipeline = make_pipeline(
            FakePaperProvider("semantic_scholar", status="empty"),
            FakePaperProvider("crossref", status="empty"),
            surechembl=surechembl,
        )

        report = pipeline.run_papers("aspirin", aspirin_candidate())

        self.assertEqual([item.title for item in report.patents], ["First", "Second"])

    def test_invalid_source_raises_value_error(self):
        pipeline = make_pipeline(
            FakePaperProvider("semantic_scholar"),
            FakePaperProvider("crossref"),
        )
        with self.assertRaises(ValueError):
            pipeline.run_papers("aspirin", aspirin_candidate(), sources=["chembl"])
        with self.assertRaises(ValueError):
            pipeline.run_papers("aspirin", aspirin_candidate(), sources=[])

    def test_extra_providers_are_prepended_to_report(self):
        pipeline = make_pipeline(
            FakePaperProvider("semantic_scholar", [paper("semantic_scholar")]),
            FakePaperProvider("crossref", status="empty"),
        )
        resolution_diag = ProviderDiagnostics(name="pubchem", status="ok", latency_ms=3)

        report = pipeline.run_papers(
            "aspirin",
            aspirin_candidate(),
            extra_providers=[resolution_diag],
        )

        self.assertEqual(report.providers[0].name, "pubchem")
        # Resolution diagnostics must not affect paper status derivation.
        self.assertEqual(report.status, "done")


class DefaultSourcesGatingTests(unittest.TestCase):
    """Semantic Scholar is key-gated in the DEFAULT source set.

    Unauthenticated S2 reliably 429s, so without SEMANTIC_SCHOLAR_API_KEY it is
    absent from default_sources(); OpenAlex + Crossref + SureChEMBL stay always
    on. These tests clear the environment so neither S2 nor KIPRIS leak in from
    a real key, then toggle each key explicitly.
    """

    def test_semantic_scholar_excluded_without_key(self):
        with patch.dict("os.environ", {}, clear=True):
            sources = default_sources()
        self.assertNotIn("semantic_scholar", sources)
        # The always-on sources remain present.
        self.assertIn("openalex", sources)
        self.assertIn("crossref", sources)
        self.assertIn("google_patents", sources)
        self.assertIn("surechembl", sources)
        # KIPRIS is also key-gated and absent without its key.
        self.assertNotIn("kipris", sources)
        self.assertEqual(
            set(sources), {"openalex", "crossref", "google_patents", "surechembl"}
        )

    def test_blank_s2_key_counts_as_unset(self):
        with patch.dict(
            "os.environ", {SEMANTIC_SCHOLAR_API_KEY_ENV: "   "}, clear=True
        ):
            sources = default_sources()
        self.assertNotIn("semantic_scholar", sources)

    def test_semantic_scholar_included_with_key(self):
        with patch.dict(
            "os.environ", {SEMANTIC_SCHOLAR_API_KEY_ENV: "s2-key"}, clear=True
        ):
            sources = default_sources()
        self.assertIn("semantic_scholar", sources)
        self.assertIn("openalex", sources)
        self.assertIn("crossref", sources)
        self.assertIn("google_patents", sources)
        self.assertIn("surechembl", sources)
        self.assertNotIn("kipris", sources)

    def test_both_s2_and_kipris_keys_set_includes_both(self):
        with patch.dict(
            "os.environ",
            {
                SEMANTIC_SCHOLAR_API_KEY_ENV: "s2-key",
                KIPRIS_SERVICE_KEY_ENV: "kipris-key",
            },
            clear=True,
        ):
            sources = default_sources()
        self.assertEqual(
            set(sources),
            {
                "semantic_scholar",
                "openalex",
                "crossref",
                "google_patents",
                "surechembl",
                "kipris",
            },
        )

    def test_default_sources_none_without_s2_key_skips_semantic_scholar(self):
        # End-to-end through the pipeline: sources=None with no S2 key must not
        # query the S2 provider nor list it in providers[].
        semantic_scholar = FakePaperProvider("semantic_scholar", [paper("semantic_scholar")])
        crossref = FakePaperProvider("crossref", [paper("crossref")])
        openalex = FakePaperProvider("openalex", [paper("openalex")])
        pipeline = make_pipeline(semantic_scholar, crossref, openalex=openalex)

        with patch.dict("os.environ", {}, clear=True):
            report = pipeline.run_papers("aspirin", aspirin_candidate(), sources=None)

        self.assertEqual(semantic_scholar.calls, [])
        self.assertNotIn("semantic_scholar", {item.name for item in report.providers})
        self.assertEqual(
            {item.name for item in report.providers},
            {"openalex", "crossref", "google_patents", "surechembl"},
        )

    def test_explicit_semantic_scholar_runs_even_without_key(self):
        # S2 remains a valid EXPLICIT source: sources=["semantic_scholar"] runs
        # it (the caller's choice) even when no key is configured.
        semantic_scholar = FakePaperProvider("semantic_scholar", [paper("semantic_scholar")])
        crossref = FakePaperProvider("crossref", [paper("crossref")])
        pipeline = make_pipeline(semantic_scholar, crossref)

        with patch.dict("os.environ", {}, clear=True):
            report = pipeline.run_papers(
                "aspirin", aspirin_candidate(), sources=["semantic_scholar"]
            )

        self.assertEqual(len(semantic_scholar.calls), 1)
        self.assertEqual([item.name for item in report.providers], ["semantic_scholar"])


if __name__ == "__main__":
    unittest.main()
