"""FastAPI app for the papers-only chemical literature search.

Served at http://127.0.0.1:8000 and proxied by the Next.js rewrite
``/chemical-api/:path*`` (see next.config.ts).

The search record store is an in-memory dict and assumes a SINGLE uvicorn
worker; running multiple workers would give each worker its own store.
Records expire after one hour and the store keeps at most 200 records
(oldest dropped first); eviction runs on create/get access.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field, field_validator

from .models import (
    CompoundCandidate,
    ProviderDiagnostics,
    SearchReport,
)
from .normalize import detect_input_type, normalize_structure
from .pipeline import SearchPipeline
from .rendering import render_csv, render_json, render_markdown


logger = logging.getLogger(__name__)

# "surechembl" is a PATENT source; the other three are paper sources. The
# default (omitted/null) runs all of them.
SearchSource = Literal["semantic_scholar", "crossref", "openalex", "surechembl"]
InputType = Literal["auto", "name", "smiles", "inchi", "inchi_key", "formula"]
SortOrder = Literal["relevance", "citations", "year"]

RECORD_TTL_SECONDS = 60 * 60
MAX_RECORDS = 200

NO_CANDIDATE_ERROR = "입력하신 화학물질을 찾을 수 없습니다. 화합물 이름, SMILES, InChI 등을 다시 확인해 주세요."
RESOLVE_FAILED_ERROR = "화합물 정보를 조회하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
SEARCH_FAILED_ERROR = "논문 검색 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
SEARCH_NOT_FOUND_DETAIL = "검색을 찾을 수 없습니다."
CANDIDATE_NOT_FOUND_DETAIL = "해당 후보 화합물을 찾을 수 없습니다."
SELECTION_CONFLICT_DETAIL = "후보 선택이 필요한 상태가 아닙니다."
REPORT_NOT_READY_DETAIL = "검색 결과가 아직 준비되지 않았습니다."


class ConflictError(RuntimeError):
    """Raised when an operation is not valid for the record's current status."""


class SearchNotFoundError(KeyError):
    """Raised when no search record exists for the given search id."""


class CandidateNotFoundError(KeyError):
    """Raised when a selection references an unknown candidate id."""


class NormalizePolicy(BaseModel):
    strip_salts: bool = True
    preserve_stereochemistry: bool = True


class NormalizeRequest(BaseModel):
    input: str = Field(min_length=1, max_length=2000)
    input_type: Literal["auto", "smiles", "inchi"] = "auto"
    normalization_policy: NormalizePolicy = Field(default_factory=NormalizePolicy)


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    input_type: InputType = "auto"
    sources: list[SearchSource] | None = None
    limit: int = Field(default=20, ge=1, le=50)
    sort: SortOrder = "relevance"

    @field_validator("sources")
    @classmethod
    def _sources_not_empty(cls, value: list[str] | None) -> list[str] | None:
        if value is not None and len(value) == 0:
            raise ValueError("sources must contain at least one source")
        return value


class CandidateSelectionRequest(BaseModel):
    candidate_id: str = Field(min_length=1)


@dataclass
class SearchRecord:
    search_id: str
    status: str
    query: str
    detected_type: str
    sources: list[str] | None
    limit: int
    sort: str
    created_at: str
    created_epoch: float
    candidates: list[CompoundCandidate] = field(default_factory=list)
    resolution: ProviderDiagnostics | None = None
    report: SearchReport | None = None
    error: str | None = None
    completed_at: str | None = None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class SearchService:
    def __init__(
        self,
        pipeline: SearchPipeline | None = None,
        *,
        ttl_seconds: float = RECORD_TTL_SECONDS,
        max_records: int = MAX_RECORDS,
        now_fn=time.time,
    ):
        self.pipeline = pipeline or SearchPipeline()
        self.ttl_seconds = ttl_seconds
        self.max_records = max_records
        self.now_fn = now_fn
        self._records: dict[str, SearchRecord] = {}
        self._lock = threading.Lock()

    def create(self, request: SearchRequest, background_tasks: BackgroundTasks) -> SearchRecord:
        record = SearchRecord(
            search_id=str(uuid4()),
            status="running",
            query=request.query,
            detected_type=request.input_type,
            sources=list(request.sources) if request.sources is not None else None,
            limit=request.limit,
            sort=request.sort,
            created_at=_now_iso(),
            created_epoch=self.now_fn(),
        )
        try:
            resolution = self.pipeline.resolve_candidates(
                request.query,
                request.input_type,
                request.limit,
            )
        except Exception:
            logger.exception("Candidate resolution failed for query %r.", request.query)
            record.status = "failed"
            record.error = RESOLVE_FAILED_ERROR
            record.completed_at = _now_iso()
            self._store(record)
            return record

        record.detected_type = resolution.detected_type
        record.candidates = resolution.candidates
        record.resolution = resolution.diagnostics

        if not record.candidates:
            record.status = "failed"
            record.error = (
                RESOLVE_FAILED_ERROR
                if resolution.diagnostics.status in {"rate_limited", "timeout", "error"}
                else NO_CANDIDATE_ERROR
            )
            record.completed_at = _now_iso()
        elif len(record.candidates) == 1:
            record.status = "running"
            background_tasks.add_task(self._run, record, record.candidates[0])
        else:
            record.status = "needs_candidate_selection"
        self._store(record)
        return record

    def select(
        self,
        search_id: str,
        candidate_id: str,
        background_tasks: BackgroundTasks,
    ) -> SearchRecord:
        self._evict()
        # Lookup, status check, candidate lookup, and the transition to
        # "running" happen atomically so two concurrent selects cannot both
        # pass the status check and schedule _run twice.
        with self._lock:
            record = self._records.get(search_id)
            if record is None:
                raise SearchNotFoundError(search_id)
            if record.status != "needs_candidate_selection":
                raise ConflictError(SELECTION_CONFLICT_DETAIL)
            candidate = next(
                (item for item in record.candidates if item.candidate_id == candidate_id),
                None,
            )
            if candidate is None:
                raise CandidateNotFoundError(candidate_id)
            record.status = "running"
        # The selected candidate object is handed to the pipeline directly;
        # candidates are never re-fetched and no list index is used.
        background_tasks.add_task(self._run, record, candidate)
        return record

    def get(self, search_id: str) -> SearchRecord:
        self._evict()
        with self._lock:
            record = self._records.get(search_id)
        if record is None:
            raise SearchNotFoundError(search_id)
        return record

    def serialize(self, record: SearchRecord) -> dict[str, Any]:
        """Serialize ``record`` under the lock for a consistent snapshot."""
        with self._lock:
            return _serialize_record(record)

    def _run(self, record: SearchRecord, candidate: CompoundCandidate) -> None:
        report: SearchReport | None
        try:
            extra = [record.resolution] if record.resolution else None
            report = self.pipeline.run_papers(
                record.query,
                candidate,
                detected_type=record.detected_type,
                sources=record.sources,
                limit=record.limit,
                sort=record.sort,
                extra_providers=extra,
            )
            status = report.status
            error = report.error
        except Exception:
            logger.exception("Paper search failed for search %s.", record.search_id)
            report = None
            status = "failed"
            error = SEARCH_FAILED_ERROR
        completed_at = _now_iso()
        # Assign all outcome fields atomically so a concurrent read never
        # sees a contradictory snapshot (e.g. report set but status "running").
        with self._lock:
            record.report = report
            record.status = status
            record.error = error
            record.completed_at = completed_at

    def _store(self, record: SearchRecord) -> None:
        with self._lock:
            self._records[record.search_id] = record
        self._evict()

    def _evict(self) -> None:
        now = self.now_fn()
        with self._lock:
            expired = [
                search_id
                for search_id, record in self._records.items()
                if now - record.created_epoch > self.ttl_seconds
            ]
            for search_id in expired:
                del self._records[search_id]
            overflow = len(self._records) - self.max_records
            if overflow <= 0:
                return
            # Evict completed records first (oldest first) so active searches
            # ("running"/"needs_candidate_selection") keep responding to polls.
            completed = [
                search_id
                for search_id, record in self._records.items()
                if record.completed_at is not None
            ]
            for search_id in completed[:overflow]:
                del self._records[search_id]
            overflow = len(self._records) - self.max_records
            if overflow > 0:
                for search_id in list(self._records)[:overflow]:
                    del self._records[search_id]


def _serialize_record(record: SearchRecord) -> dict[str, Any]:
    report = record.report
    if report is not None:
        providers = report.providers
    elif record.resolution is not None:
        providers = [record.resolution]
    else:
        providers = []
    compound = report.compound if report else None
    return {
        "search_id": record.search_id,
        "status": record.status,
        "query": record.query,
        "detected_type": record.detected_type,
        "compound": (
            {
                "name": compound.name,
                "canonical_smiles": compound.canonical_smiles,
                "inchi_key": compound.inchi_key,
                "formula": compound.formula,
                "cid": compound.cid,
                "warnings": list(compound.warnings),
            }
            if compound
            else None
        ),
        "candidates": [
            {
                "candidate_id": candidate.candidate_id,
                "title": candidate.title,
                "formula": candidate.formula,
                "smiles": candidate.smiles,
                "cid": candidate.cid,
            }
            for candidate in record.candidates
        ],
        "papers": [
            {
                "id": paper.id,
                "title": paper.title,
                "authors": list(paper.authors),
                "venue": paper.venue,
                "year": paper.year,
                "doi": paper.doi,
                "url": paper.url,
                "citations": paper.citations,
                "abstract": paper.abstract,
                "source": paper.source,
                "score": paper.score,
            }
            for paper in (report.papers if report else [])
        ],
        "patents": [
            {
                "id": patent.id,
                "publication_number": patent.publication_number,
                "title": patent.title,
                "url": patent.url,
                "assignee": patent.assignee,
                "date": patent.date,
                "source": patent.source,
            }
            for patent in (report.patents if report else [])
        ],
        "patents_total_hits": report.patents_total_hits if report else None,
        "providers": [
            {
                "name": provider.name,
                "status": provider.status,
                "latency_ms": provider.latency_ms,
                "cached": provider.cached,
                "retry_count": provider.retry_count,
                "message": provider.message,
            }
            for provider in providers
        ],
        "error": record.error,
        "created_at": record.created_at,
        "completed_at": record.completed_at,
    }


def create_app(
    pipeline: SearchPipeline | None = None,
    *,
    ttl_seconds: float = RECORD_TTL_SECONDS,
    max_records: int = MAX_RECORDS,
) -> FastAPI:
    app = FastAPI(title="Chemical Literature Search API", version="0.2.0")
    service = SearchService(pipeline, ttl_seconds=ttl_seconds, max_records=max_records)
    app.state.search_service = service

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/api/chem/normalize")
    def normalize(request: NormalizeRequest) -> dict[str, Any]:
        input_type = (
            detect_input_type(request.input) if request.input_type == "auto" else request.input_type
        )
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
    def create_search(request: SearchRequest, background_tasks: BackgroundTasks) -> dict[str, Any]:
        return service.serialize(service.create(request, background_tasks))

    @app.get("/api/searches/{search_id}")
    def get_search(search_id: str) -> dict[str, Any]:
        try:
            return service.serialize(service.get(search_id))
        except SearchNotFoundError as exc:
            raise HTTPException(status_code=404, detail=SEARCH_NOT_FOUND_DETAIL) from exc

    @app.post("/api/searches/{search_id}/select")
    def select_candidate(
        search_id: str,
        request: CandidateSelectionRequest,
        background_tasks: BackgroundTasks,
    ) -> dict[str, Any]:
        try:
            return service.serialize(
                service.select(search_id, request.candidate_id, background_tasks)
            )
        except ConflictError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except SearchNotFoundError as exc:
            raise HTTPException(status_code=404, detail=SEARCH_NOT_FOUND_DETAIL) from exc
        except CandidateNotFoundError as exc:
            raise HTTPException(status_code=404, detail=CANDIDATE_NOT_FOUND_DETAIL) from exc

    @app.get("/api/searches/{search_id}/export")
    def export_search(
        search_id: str,
        format: Literal["csv", "markdown", "json"] = Query(default="json"),
    ) -> PlainTextResponse:
        try:
            record = service.get(search_id)
        except SearchNotFoundError as exc:
            raise HTTPException(status_code=404, detail=SEARCH_NOT_FOUND_DETAIL) from exc
        if record.report is None or record.status not in {"done", "partial"}:
            raise HTTPException(status_code=409, detail=REPORT_NOT_READY_DETAIL)
        renderers = {
            "csv": (render_csv, "text/csv", "csv"),
            "markdown": (render_markdown, "text/markdown", "md"),
            "json": (render_json, "application/json", "json"),
        }
        renderer, media_type, extension = renderers[format]
        filename = f"chemical-search-{search_id}.{extension}"
        return PlainTextResponse(
            renderer(record.report),
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    return app


app = create_app()
