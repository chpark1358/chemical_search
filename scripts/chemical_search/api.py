from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Literal
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from .models import SearchItem, SearchReport
from .normalize import detect_input_type, normalize_structure
from .pipeline import SearchPipeline
from .rendering import render_csv, render_json, render_markdown


SearchSource = Literal["pubchem", "chembl", "semantic_scholar", "crossref"]


class NormalizePolicy(BaseModel):
    strip_salts: bool = True
    preserve_stereochemistry: bool = True


class NormalizeRequest(BaseModel):
    input: str = Field(min_length=1)
    input_type: Literal["auto", "smiles", "inchi"] = "auto"
    normalization_policy: NormalizePolicy = Field(default_factory=NormalizePolicy)


class SearchRequest(BaseModel):
    query: str = Field(min_length=1)
    input_type: Literal["auto", "smiles", "name", "formula", "inchi", "inchi_key"] = "auto"
    mode: Literal["all", "exact", "similarity", "substructure"] = "all"
    threshold: int = Field(default=80, ge=0, le=100)
    limit: int = Field(default=5, ge=1, le=50)
    sources: list[SearchSource] = Field(
        default_factory=lambda: ["pubchem", "chembl", "semantic_scholar", "crossref"]
    )


class CandidateSelectionRequest(BaseModel):
    candidate_id: str


@dataclass
class SearchRecord:
    id: str
    request: SearchRequest
    detected_type: str
    status: str
    candidates: list[SearchItem] = field(default_factory=list)
    selected_candidate_id: str | None = None
    report: SearchReport | None = None
    error: str | None = None


class SearchService:
    def __init__(self, pipeline: SearchPipeline | None = None):
        self.pipeline = pipeline or SearchPipeline()
        self.searches: dict[str, SearchRecord] = {}

    def create(self, request: SearchRequest, background_tasks: BackgroundTasks) -> SearchRecord:
        detected_type = (
            detect_input_type(request.query) if request.input_type == "auto" else request.input_type
        )
        candidate_result = self.pipeline.pubchem.resolve_candidates(
            request.query,
            detected_type,
            request.limit,
        )
        record = SearchRecord(
            id=str(uuid4()),
            request=request,
            detected_type=detected_type,
            status="pending",
            candidates=candidate_result.items,
        )
        self.searches[record.id] = record

        if detected_type == "formula" or len(record.candidates) > 1:
            record.status = "needs_candidate_selection"
        elif detected_type in {"name", "inchi_key"} and not record.candidates:
            record.status = "partial_failed"
            record.error = f"No PubChem candidate resolved the {detected_type} input."
        else:
            record.status = "running"
            background_tasks.add_task(self.run, record.id, 0)
        return record

    def select(
        self,
        search_id: str,
        candidate_id: str,
        background_tasks: BackgroundTasks,
    ) -> SearchRecord:
        record = self.get(search_id)
        if record.status != "needs_candidate_selection":
            raise ValueError(f"Search status is '{record.status}', not needs_candidate_selection.")
        candidate_index = next(
            (index for index, candidate in enumerate(record.candidates) if candidate.id == candidate_id),
            None,
        )
        if candidate_index is None:
            raise KeyError(candidate_id)
        record.selected_candidate_id = candidate_id
        record.status = "running"
        background_tasks.add_task(self.run, search_id, candidate_index)
        return record

    def run(self, search_id: str, candidate_index: int) -> None:
        record = self.get(search_id)
        try:
            record.report = self.pipeline.run(
                record.request.query,
                input_type=record.detected_type,
                mode=record.request.mode,
                threshold=record.request.threshold,
                candidate_index=candidate_index,
                limit=record.request.limit,
                include_semantic_scholar="semantic_scholar" in record.request.sources,
                sources=set(record.request.sources),
            )
            record.status = "done" if record.report.status == "ok" else "partial_failed"
        except Exception as exc:
            record.status = "failed"
            record.error = repr(exc)

    def get(self, search_id: str) -> SearchRecord:
        record = self.searches.get(search_id)
        if record is None:
            raise KeyError(search_id)
        return record


def _serialize_record(record: SearchRecord) -> dict:
    return {
        "search_id": record.id,
        "status": record.status,
        "detected_type": record.detected_type,
        "selected_candidate_id": record.selected_candidate_id,
        "compound_candidates": [asdict(candidate) for candidate in record.candidates],
        "report": record.report.to_dict() if record.report else None,
        "error": record.error,
        "poll_url": f"/api/searches/{record.id}",
    }


def create_app(pipeline: SearchPipeline | None = None) -> FastAPI:
    app = FastAPI(title="Chemical Search API", version="0.1.0")
    service = SearchService(pipeline)
    app.state.search_service = service

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    @app.post("/api/chem/normalize")
    def normalize(request: NormalizeRequest) -> dict:
        input_type = detect_input_type(request.input) if request.input_type == "auto" else request.input_type
        if input_type not in {"smiles", "inchi"}:
            raise HTTPException(
                status_code=422,
                detail=f"Input type '{input_type}' requires compound candidate resolution before normalization.",
            )
        try:
            compound = normalize_structure(
                request.input,
                input_type,
                strip_salts=request.normalization_policy.strip_salts,
                preserve_stereochemistry=request.normalization_policy.preserve_stereochemistry,
            )
        except (RuntimeError, ValueError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return asdict(compound)

    @app.post("/api/searches")
    def create_search(request: SearchRequest, background_tasks: BackgroundTasks) -> dict:
        return _serialize_record(service.create(request, background_tasks))

    @app.post("/api/searches/{search_id}/select-compound")
    def select_compound(
        search_id: str,
        request: CandidateSelectionRequest,
        background_tasks: BackgroundTasks,
    ) -> dict:
        try:
            return _serialize_record(service.select(search_id, request.candidate_id, background_tasks))
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Search or candidate not found.") from exc
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.get("/api/searches/{search_id}")
    def get_search(search_id: str) -> dict:
        try:
            return _serialize_record(service.get(search_id))
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Search not found.") from exc

    @app.get("/api/searches/{search_id}/export")
    def export_search(
        search_id: str,
        format: Literal["json", "markdown", "csv"] = Query(default="json"),
    ):
        try:
            record = service.get(search_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Search not found.") from exc
        if record.report is None:
            raise HTTPException(status_code=409, detail="Search result is not ready.")
        if format == "markdown":
            return PlainTextResponse(render_markdown(record.report), media_type="text/markdown")
        if format == "csv":
            return PlainTextResponse(render_csv(record.report), media_type="text/csv")
        return PlainTextResponse(render_json(record.report), media_type="application/json")

    return app


app = create_app()
