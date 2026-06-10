from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from chemical_search.models import ProviderDiagnostics, ProviderResult, SearchItem
from chemical_search.normalize import detect_input_type, normalize_structure
from chemical_search.pipeline import SearchPipeline
from chemical_search.rendering import render_csv, render_markdown


def diagnostics(message: str | None = None) -> ProviderDiagnostics:
    return ProviderDiagnostics(
        latency_ms=1,
        retrieved_at=datetime.now(timezone.utc).isoformat(),
        message=message,
    )


def candidate() -> SearchItem:
    return SearchItem(
        id="pubchem:2244",
        source="pubchem",
        kind="compound",
        title="Aspirin",
        source_url="https://pubchem.ncbi.nlm.nih.gov/compound/2244",
        match_reason="PubChem name lookup candidate.",
        data={"canonical_smiles": "CC(=O)Oc1ccccc1C(=O)O"},
    )


class FakePubChem:
    def resolve_candidates(self, query: str, input_type: str, limit: int) -> ProviderResult:
        return ProviderResult("pubchem", f"resolve_{input_type}", "ok", [candidate()], diagnostics())


class FakeChembl:
    def search(self, compound, operation: str, *, threshold: int, limit: int) -> ProviderResult:
        item = SearchItem(
            id=f"chembl:{operation}",
            source="chembl",
            kind="compound",
            title=f"ChEMBL {operation}",
            source_url="https://www.ebi.ac.uk/chembl/",
            match_reason=f"{operation} match",
        )
        return ProviderResult("chembl", operation, "ok", [item], diagnostics())


class FakePaperProvider:
    def __init__(self, source: str, status: str = "ok"):
        self.source = source
        self.status = status

    def search(self, query: str, limit: int) -> ProviderResult:
        items = []
        message = "rate limited" if self.status != "ok" else None
        if self.status == "ok":
            items.append(
                SearchItem(
                    id=f"{self.source}:paper",
                    source=self.source,
                    kind="paper",
                    title="Aspirin paper",
                    source_url="https://doi.org/10.1000/example",
                    match_reason=f"{self.source} bibliographic search",
                )
            )
        return ProviderResult(self.source, "paper_search", self.status, items, diagnostics(message))


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


class PipelineTests(unittest.TestCase):
    def test_runs_full_pipeline_and_renders_sources_and_reasons(self):
        pipeline = SearchPipeline(
            pubchem=FakePubChem(),
            chembl=FakeChembl(),
            semantic_scholar=FakePaperProvider("semantic_scholar"),
            crossref=FakePaperProvider("crossref"),
        )
        report = pipeline.run("aspirin")
        markdown = render_markdown(report)
        csv_text = render_csv(report)

        self.assertEqual(report.status, "ok")
        self.assertEqual(report.selected_compound.inchi_key, "BSYNRYMUTXBXSQ-UHFFFAOYSA-N")
        self.assertTrue(report.results)
        self.assertIn("https://doi.org/10.1000/example", markdown)
        self.assertIn("Evidence:", markdown)
        self.assertIn("evidence_count", csv_text)
        self.assertIn("Aspirin", csv_text)

    def test_provider_failure_keeps_partial_results(self):
        pipeline = SearchPipeline(
            pubchem=FakePubChem(),
            chembl=FakeChembl(),
            semantic_scholar=FakePaperProvider("semantic_scholar", "rate_limited"),
            crossref=FakePaperProvider("crossref"),
        )
        report = pipeline.run("aspirin")

        self.assertEqual(report.status, "partial")
        self.assertIsNotNone(report.selected_compound)
        self.assertTrue(any(result.source == "crossref" and result.items for result in report.provider_results))

    def test_invalid_explicit_smiles_returns_partial_report(self):
        pipeline = SearchPipeline(
            pubchem=FakePubChem(),
            chembl=FakeChembl(),
            semantic_scholar=FakePaperProvider("semantic_scholar"),
            crossref=FakePaperProvider("crossref"),
        )
        report = pipeline.run("not-a-smiles", input_type="smiles")

        self.assertEqual(report.status, "partial")
        self.assertIsNone(report.selected_compound)
        self.assertTrue(any("could not parse" in warning.lower() for warning in report.warnings))

    def test_selected_sources_are_respected(self):
        pipeline = SearchPipeline(
            pubchem=FakePubChem(),
            chembl=FakeChembl(),
            semantic_scholar=FakePaperProvider("semantic_scholar"),
            crossref=FakePaperProvider("crossref"),
        )
        report = pipeline.run("aspirin", sources={"pubchem", "chembl"})

        self.assertFalse(
            any(result.source in {"semantic_scholar", "crossref"} for result in report.provider_results)
        )


if __name__ == "__main__":
    unittest.main()
