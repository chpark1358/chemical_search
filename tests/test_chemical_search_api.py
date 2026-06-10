from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from chemical_search.api import create_app
from chemical_search.models import (
    NormalizedCompound,
    ProviderDiagnostics,
    ProviderResult,
    SearchItem,
    SearchReport,
)


def diagnostics() -> ProviderDiagnostics:
    return ProviderDiagnostics(1, datetime.now(timezone.utc).isoformat())


def candidates() -> list[SearchItem]:
    return [
        SearchItem(
            "pubchem:2244",
            "pubchem",
            "compound",
            "Aspirin",
            "https://pubchem.example/2244",
            "formula candidate",
            data={"canonical_smiles": "CC(=O)Oc1ccccc1C(=O)O"},
        ),
        SearchItem(
            "pubchem:689043",
            "pubchem",
            "compound",
            "Caffeic Acid",
            "https://pubchem.example/689043",
            "formula candidate",
            data={"canonical_smiles": "C1=CC(=C(C=C1C=CC(=O)O)O)O"},
        ),
    ]


class FakePubChem:
    def resolve_candidates(self, query, input_type, limit):
        items = candidates() if input_type == "formula" else candidates()[:1]
        return ProviderResult("pubchem", f"resolve_{input_type}", "ok", items, diagnostics())


class FakePipeline:
    def __init__(self):
        self.pubchem = FakePubChem()

    def run(self, query, **kwargs):
        compound = NormalizedCompound(
            query,
            kwargs["input_type"],
            "CC(=O)Oc1ccccc1C(=O)O",
            "BSYNRYMUTXBXSQ-UHFFFAOYSA-N",
            "C9H8O4",
            180.159,
            ["Aspirin"],
        )
        item = candidates()[kwargs["candidate_index"]]
        item.data["sources"] = ["pubchem"]
        item.data["evidence"] = [{"source": "pubchem"}]
        item.score = 55
        result = ProviderResult("pubchem", "resolve_formula", "ok", [item], diagnostics())
        return SearchReport(
            query,
            kwargs["input_type"],
            kwargs["mode"],
            kwargs["threshold"],
            "ok",
            compound,
            candidates(),
            [result],
            [item],
        )


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(create_app(FakePipeline()))

    def test_normalize_smiles(self):
        response = self.client.post(
            "/api/chem/normalize",
            json={"input": "CC(=O)Oc1ccccc1C(=O)O", "input_type": "smiles"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["inchi_key"], "BSYNRYMUTXBXSQ-UHFFFAOYSA-N")

    def test_formula_search_requires_selection_then_exports(self):
        created = self.client.post(
            "/api/searches",
            json={"query": "C9H8O4", "input_type": "formula", "mode": "exact"},
        ).json()
        self.assertEqual(created["status"], "needs_candidate_selection")
        self.assertEqual(len(created["compound_candidates"]), 2)

        selected = self.client.post(
            f"/api/searches/{created['search_id']}/select-compound",
            json={"candidate_id": "pubchem:2244"},
        ).json()
        self.assertEqual(selected["status"], "running")

        result = self.client.get(f"/api/searches/{created['search_id']}").json()
        self.assertEqual(result["status"], "done")
        self.assertEqual(result["report"]["results"][0]["title"], "Aspirin")

        exported = self.client.get(
            f"/api/searches/{created['search_id']}/export?format=csv"
        )
        self.assertEqual(exported.status_code, 200)
        self.assertIn("evidence_count", exported.text)

    def test_unknown_source_is_rejected(self):
        response = self.client.post(
            "/api/searches",
            json={"query": "aspirin", "sources": ["unknown-provider"]},
        )

        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
