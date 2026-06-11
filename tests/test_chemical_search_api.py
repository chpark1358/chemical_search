from __future__ import annotations

import sys
import unittest
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from chemical_search.api import (
    CANDIDATE_NOT_FOUND_DETAIL,
    SEARCH_NOT_FOUND_DETAIL,
    create_app,
)
from chemical_search.models import (
    CandidateResolution,
    CompoundCandidate,
    CompoundInfo,
    PaperItem,
    ProviderDiagnostics,
    SearchReport,
)


def candidates() -> list[CompoundCandidate]:
    return [
        CompoundCandidate(
            candidate_id="pubchem:2244",
            title="Aspirin",
            formula="C9H8O4",
            smiles="CC(=O)Oc1ccccc1C(=O)O",
            cid=2244,
        ),
        CompoundCandidate(
            candidate_id="pubchem:689043",
            title="Caffeic Acid",
            formula="C9H8O4",
            smiles="C1=CC(=C(C=C1C=CC(=O)O)O)O",
            cid=689043,
        ),
    ]


def paper(title: str = "Aspirin paper") -> PaperItem:
    return PaperItem(
        id="semantic_scholar:1",
        title=title,
        authors=["J. Smith"],
        venue="J. Chem",
        year=2020,
        doi="10.1000/example",
        url="https://doi.org/10.1000/example",
        citations=12,
        abstract="An abstract.",
        source="semantic_scholar",
        score=1.1,
    )


class FakePipeline:
    def __init__(
        self,
        *,
        candidates: list[CompoundCandidate] | None = None,
        detected_type: str = "formula",
        report_status: str = "done",
        paper_title: str = "Aspirin paper",
        run_error: Exception | None = None,
        resolve_error: Exception | None = None,
        resolution_status: str = "ok",
    ):
        self.candidates = candidates if candidates is not None else []
        self.detected_type = detected_type
        self.report_status = report_status
        self.paper_title = paper_title
        self.run_error = run_error
        self.resolve_error = resolve_error
        self.resolution_status = resolution_status
        self.resolve_calls: list[dict[str, Any]] = []
        self.run_calls: list[dict[str, Any]] = []

    def resolve_candidates(self, query: str, input_type: str, limit: int) -> CandidateResolution:
        self.resolve_calls.append({"query": query, "input_type": input_type, "limit": limit})
        if self.resolve_error is not None:
            raise self.resolve_error
        return CandidateResolution(
            detected_type=self.detected_type,
            candidates=self.candidates,
            diagnostics=ProviderDiagnostics(
                name="pubchem",
                status=self.resolution_status,
                latency_ms=2,
            ),
        )

    def run_papers(self, query: str, candidate: CompoundCandidate, **kwargs: Any) -> SearchReport:
        self.run_calls.append({"query": query, "candidate": candidate, **kwargs})
        if self.run_error is not None:
            raise self.run_error
        return SearchReport(
            query=query,
            detected_type=kwargs.get("detected_type", "name"),
            status=self.report_status,
            compound=CompoundInfo(
                name=candidate.title,
                canonical_smiles=candidate.smiles,
                inchi_key="BSYNRYMUTXBXSQ-UHFFFAOYSA-N",
                formula=candidate.formula,
                cid=candidate.cid,
            ),
            papers=[paper(self.paper_title)],
            providers=[
                *(kwargs.get("extra_providers") or []),
                ProviderDiagnostics(name="semantic_scholar", status="ok", latency_ms=5),
                ProviderDiagnostics(name="crossref", status="empty", latency_ms=7),
            ],
            error="일부 제공자에서 오류가 발생했습니다." if self.report_status == "partial" else None,
        )


def make_client(pipeline: FakePipeline, **kwargs: Any) -> TestClient:
    return TestClient(create_app(pipeline, **kwargs))


class SearchFlowTests(unittest.TestCase):
    def test_create_select_done_flow(self):
        pipeline = FakePipeline(candidates=candidates())
        client = make_client(pipeline)

        created = client.post("/api/searches", json={"query": "C9H8O4", "input_type": "formula"})
        self.assertEqual(created.status_code, 200)
        body = created.json()
        self.assertEqual(body["status"], "needs_candidate_selection")
        self.assertEqual(body["detected_type"], "formula")
        self.assertEqual(len(body["candidates"]), 2)
        self.assertEqual(
            set(body["candidates"][0].keys()),
            {"candidate_id", "title", "formula", "smiles", "cid"},
        )
        self.assertIsNone(body["compound"])
        self.assertEqual(body["papers"], [])
        self.assertIsNone(body["completed_at"])

        selected = client.post(
            f"/api/searches/{body['search_id']}/select",
            json={"candidate_id": "pubchem:689043"},
        )
        self.assertEqual(selected.status_code, 200)
        self.assertEqual(selected.json()["status"], "running")

        result = client.get(f"/api/searches/{body['search_id']}").json()
        self.assertEqual(result["status"], "done")
        self.assertEqual(result["compound"]["name"], "Caffeic Acid")
        self.assertEqual(result["papers"][0]["title"], "Aspirin paper")
        self.assertIsNotNone(result["completed_at"])
        self.assertEqual(result["providers"][0]["name"], "pubchem")

        # The selected candidate object itself was handed to the pipeline.
        self.assertEqual(len(pipeline.run_calls), 1)
        self.assertIs(pipeline.run_calls[0]["candidate"], pipeline.candidates[1])
        self.assertEqual(len(pipeline.resolve_calls), 1)

    def test_record_serialization_matches_contract_keys(self):
        client = make_client(FakePipeline(candidates=candidates()[:1], detected_type="name"))

        body = client.post("/api/searches", json={"query": "aspirin"}).json()

        self.assertEqual(
            set(body.keys()),
            {
                "search_id",
                "status",
                "query",
                "detected_type",
                "compound",
                "candidates",
                "papers",
                "providers",
                "error",
                "created_at",
                "completed_at",
            },
        )

    def test_single_candidate_auto_selects_and_runs(self):
        pipeline = FakePipeline(candidates=candidates()[:1], detected_type="name")
        client = make_client(pipeline)

        created = client.post("/api/searches", json={"query": "aspirin"}).json()
        self.assertEqual(created["status"], "running")

        result = client.get(f"/api/searches/{created['search_id']}").json()
        self.assertEqual(result["status"], "done")
        self.assertEqual(
            set(result["papers"][0].keys()),
            {
                "id",
                "title",
                "authors",
                "venue",
                "year",
                "doi",
                "url",
                "citations",
                "abstract",
                "source",
                "score",
            },
        )
        self.assertIs(pipeline.run_calls[0]["candidate"], pipeline.candidates[0])
        self.assertIsNone(pipeline.run_calls[0]["sources"])

    def test_zero_candidates_for_formula_is_failed_with_korean_error(self):
        client = make_client(FakePipeline(candidates=[], detected_type="formula"))

        body = client.post(
            "/api/searches",
            json={"query": "C99H99O99", "input_type": "formula"},
        ).json()

        self.assertEqual(body["status"], "failed")
        self.assertEqual(body["candidates"], [])
        self.assertIn("찾을 수 없습니다", body["error"])
        self.assertIsNotNone(body["completed_at"])

    def test_partial_status_is_reported(self):
        client = make_client(
            FakePipeline(candidates=candidates()[:1], detected_type="name", report_status="partial")
        )

        created = client.post("/api/searches", json={"query": "aspirin"}).json()
        result = client.get(f"/api/searches/{created['search_id']}").json()

        self.assertEqual(result["status"], "partial")


class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.client = make_client(FakePipeline(candidates=candidates()[:1]))

    def test_empty_sources_array_is_rejected(self):
        response = self.client.post("/api/searches", json={"query": "aspirin", "sources": []})
        self.assertEqual(response.status_code, 422)

    def test_unknown_source_is_rejected(self):
        response = self.client.post(
            "/api/searches",
            json={"query": "aspirin", "sources": ["chembl"]},
        )
        self.assertEqual(response.status_code, 422)

    def test_query_over_2000_chars_is_rejected(self):
        response = self.client.post("/api/searches", json={"query": "C" * 2001})
        self.assertEqual(response.status_code, 422)

    def test_limit_out_of_range_is_rejected(self):
        response = self.client.post("/api/searches", json={"query": "aspirin", "limit": 51})
        self.assertEqual(response.status_code, 422)


class NotFoundConflictTests(unittest.TestCase):
    def test_get_unknown_search_returns_404(self):
        client = make_client(FakePipeline())
        response = client.get("/api/searches/unknown-id")
        self.assertEqual(response.status_code, 404)
        self.assertIn("detail", response.json())

    def test_select_unknown_search_returns_404(self):
        client = make_client(FakePipeline())
        response = client.post(
            "/api/searches/unknown-id/select",
            json={"candidate_id": "pubchem:2244"},
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], SEARCH_NOT_FOUND_DETAIL)

    def test_select_candidate_id_equal_to_search_id_reports_candidate_not_found(self):
        client = make_client(FakePipeline(candidates=candidates()))
        created = client.post("/api/searches", json={"query": "C9H8O4"}).json()

        response = client.post(
            f"/api/searches/{created['search_id']}/select",
            json={"candidate_id": created["search_id"]},
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], CANDIDATE_NOT_FOUND_DETAIL)

    def test_select_unknown_candidate_returns_404(self):
        client = make_client(FakePipeline(candidates=candidates()))
        created = client.post("/api/searches", json={"query": "C9H8O4"}).json()

        response = client.post(
            f"/api/searches/{created['search_id']}/select",
            json={"candidate_id": "pubchem:none"},
        )
        self.assertEqual(response.status_code, 404)

    def test_select_in_wrong_state_returns_409(self):
        client = make_client(FakePipeline(candidates=candidates()))
        created = client.post("/api/searches", json={"query": "C9H8O4"}).json()
        client.post(
            f"/api/searches/{created['search_id']}/select",
            json={"candidate_id": "pubchem:2244"},
        )

        response = client.post(
            f"/api/searches/{created['search_id']}/select",
            json={"candidate_id": "pubchem:689043"},
        )
        self.assertEqual(response.status_code, 409)


class ExportTests(unittest.TestCase):
    def _done_search(self, client: TestClient) -> str:
        created = client.post("/api/searches", json={"query": "aspirin"}).json()
        return created["search_id"]

    def test_export_csv_markdown_json(self):
        client = make_client(FakePipeline(candidates=candidates()[:1]))
        search_id = self._done_search(client)

        csv_response = client.get(f"/api/searches/{search_id}/export?format=csv")
        self.assertEqual(csv_response.status_code, 200)
        self.assertIn("attachment", csv_response.headers["content-disposition"])
        self.assertIn("Aspirin paper", csv_response.text)
        self.assertIn("doi", csv_response.text)

        markdown_response = client.get(f"/api/searches/{search_id}/export?format=markdown")
        self.assertEqual(markdown_response.status_code, 200)
        self.assertIn("논문 목록", markdown_response.text)

        json_response = client.get(f"/api/searches/{search_id}/export?format=json")
        self.assertEqual(json_response.status_code, 200)
        self.assertEqual(json_response.json()["papers"][0]["title"], "Aspirin paper")

    def test_export_sanitizes_formula_injection(self):
        client = make_client(
            FakePipeline(candidates=candidates()[:1], paper_title="=HYPERLINK(\"x\")")
        )
        search_id = self._done_search(client)

        response = client.get(f"/api/searches/{search_id}/export?format=csv")
        self.assertIn("'=HYPERLINK", response.text)

    def test_export_before_ready_returns_409(self):
        client = make_client(FakePipeline(candidates=candidates()))
        created = client.post("/api/searches", json={"query": "C9H8O4"}).json()
        self.assertEqual(created["status"], "needs_candidate_selection")

        response = client.get(f"/api/searches/{created['search_id']}/export?format=csv")
        self.assertEqual(response.status_code, 409)

    def test_export_unknown_search_returns_404(self):
        client = make_client(FakePipeline())
        response = client.get("/api/searches/unknown/export?format=csv")
        self.assertEqual(response.status_code, 404)


class ErrorSanitizationTests(unittest.TestCase):
    def test_run_failure_returns_generic_korean_error(self):
        client = make_client(
            FakePipeline(
                candidates=candidates()[:1],
                run_error=RuntimeError("super-secret-internal-detail"),
            )
        )

        created = client.post("/api/searches", json={"query": "aspirin"}).json()
        result = client.get(f"/api/searches/{created['search_id']}").json()

        self.assertEqual(result["status"], "failed")
        self.assertNotIn("super-secret-internal-detail", str(result))
        self.assertNotIn("RuntimeError", str(result))
        self.assertIn("오류가 발생했습니다", result["error"])

    def test_resolve_failure_returns_generic_korean_error(self):
        client = make_client(
            FakePipeline(resolve_error=RuntimeError("pubchem-secret-url-token"))
        )

        body = client.post("/api/searches", json={"query": "aspirin"}).json()

        self.assertEqual(body["status"], "failed")
        self.assertNotIn("pubchem-secret-url-token", str(body))
        self.assertIn("오류가 발생했습니다", body["error"])


class RecordStoreTests(unittest.TestCase):
    def test_expired_records_are_evicted(self):
        client = make_client(FakePipeline(candidates=candidates()[:1]))
        created = client.post("/api/searches", json={"query": "aspirin"}).json()
        service = client.app.state.search_service

        record = service.get(created["search_id"])
        record.created_epoch -= 3700

        response = client.get(f"/api/searches/{created['search_id']}")
        self.assertEqual(response.status_code, 404)

    def test_oldest_records_are_dropped_over_max(self):
        client = make_client(FakePipeline(candidates=candidates()[:1]), max_records=2)

        ids = [
            client.post("/api/searches", json={"query": f"aspirin {index}"}).json()["search_id"]
            for index in range(3)
        ]

        self.assertEqual(client.get(f"/api/searches/{ids[0]}").status_code, 404)
        self.assertEqual(client.get(f"/api/searches/{ids[1]}").status_code, 200)
        self.assertEqual(client.get(f"/api/searches/{ids[2]}").status_code, 200)

    def test_capacity_eviction_prefers_completed_over_active_records(self):
        client = make_client(FakePipeline(candidates=candidates()), max_records=2)
        service = client.app.state.search_service

        # Oldest record stays active, as if its paper search were in flight.
        running = client.post("/api/searches", json={"query": "C9H8O4 running"}).json()
        service.get(running["search_id"]).status = "running"

        completed = client.post("/api/searches", json={"query": "C9H8O4 done"}).json()
        completed_record = service.get(completed["search_id"])
        completed_record.status = "done"
        completed_record.completed_at = "2026-06-11T00:00:00+00:00"

        newest = client.post("/api/searches", json={"query": "C9H8O4 newest"}).json()

        # The completed record is evicted even though the running one is older.
        self.assertEqual(client.get(f"/api/searches/{completed['search_id']}").status_code, 404)
        running_response = client.get(f"/api/searches/{running['search_id']}")
        self.assertEqual(running_response.status_code, 200)
        self.assertEqual(running_response.json()["status"], "running")
        self.assertEqual(client.get(f"/api/searches/{newest['search_id']}").status_code, 200)

    def test_capacity_eviction_drops_oldest_active_when_none_completed(self):
        # Multi-candidate searches stay in "needs_candidate_selection" (active).
        client = make_client(FakePipeline(candidates=candidates()), max_records=2)

        ids = [
            client.post("/api/searches", json={"query": f"C9H8O4 {index}"}).json()["search_id"]
            for index in range(3)
        ]

        self.assertEqual(client.get(f"/api/searches/{ids[0]}").status_code, 404)
        self.assertEqual(client.get(f"/api/searches/{ids[1]}").status_code, 200)
        self.assertEqual(client.get(f"/api/searches/{ids[2]}").status_code, 200)


class NormalizeEndpointTests(unittest.TestCase):
    def setUp(self):
        self.client = make_client(FakePipeline())

    def test_normalize_smiles(self):
        response = self.client.post(
            "/api/chem/normalize",
            json={"input": "CC(=O)Oc1ccccc1C(=O)O", "input_type": "smiles"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["inchi_key"], "BSYNRYMUTXBXSQ-UHFFFAOYSA-N")

    def test_normalize_rejects_over_long_input(self):
        response = self.client.post(
            "/api/chem/normalize",
            json={"input": "C" * 2001, "input_type": "smiles"},
        )
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
