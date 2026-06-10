from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from chemical_search.models import (
    NormalizedCompound,
    ProviderDiagnostics,
    ProviderResult,
    SearchItem,
)
from chemical_search.results import merge_and_rank


def diagnostics() -> ProviderDiagnostics:
    return ProviderDiagnostics(1, datetime.now(timezone.utc).isoformat())


class ResultMergeTests(unittest.TestCase):
    def setUp(self):
        self.compound = NormalizedCompound(
            original_input="aspirin",
            detected_type="name",
            canonical_smiles="CC(=O)Oc1ccccc1C(=O)O",
            inchi_key="BSYNRYMUTXBXSQ-UHFFFAOYSA-N",
            formula="C9H8O4",
            molecular_weight=180.159,
        )

    def test_compounds_are_merged_by_inchi_key_with_evidence(self):
        pubchem = SearchItem(
            "pubchem:2244",
            "pubchem",
            "compound",
            "Aspirin",
            "https://pubchem.example/2244",
            "name candidate",
            data={"inchi_key": self.compound.inchi_key},
        )
        chembl = SearchItem(
            "chembl:25",
            "chembl",
            "compound",
            "ASPIRIN",
            "https://chembl.example/25",
            "exact match",
            data={"structures": {"standard_inchi_key": self.compound.inchi_key}},
        )

        results = merge_and_rank(
            [
                ProviderResult("pubchem", "resolve_name", "ok", [pubchem], diagnostics()),
                ProviderResult("chembl", "exact", "ok", [chembl], diagnostics()),
            ],
            self.compound,
        )

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].data["sources"], ["pubchem", "chembl"])
        self.assertEqual(len(results[0].data["evidence"]), 2)

    def test_papers_are_merged_by_doi_and_order_is_deterministic(self):
        crossref = SearchItem(
            "crossref:doi",
            "crossref",
            "paper",
            "Aspirin Paper",
            "https://doi.org/10.1/example",
            "bibliographic",
            data={"doi": "10.1/example"},
        )
        semantic = SearchItem(
            "semantic:paper",
            "semantic_scholar",
            "paper",
            "Aspirin Paper",
            "https://semantic.example/paper",
            "bibliographic",
            data={"external_ids": {"DOI": "10.1/EXAMPLE"}, "citation_count": 200},
        )

        results = merge_and_rank(
            [
                ProviderResult("crossref", "paper_search", "ok", [crossref], diagnostics()),
                ProviderResult("semantic_scholar", "paper_search", "ok", [semantic], diagnostics()),
            ],
            self.compound,
        )

        self.assertEqual(len(results), 1)
        self.assertEqual(len(results[0].data["evidence"]), 2)
        self.assertGreater(results[0].score, 10)


if __name__ == "__main__":
    unittest.main()
