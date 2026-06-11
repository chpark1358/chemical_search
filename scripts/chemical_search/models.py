"""Dataclasses for the papers-only chemical literature search pipeline."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


# Placeholder title injected by providers when a paper carries no title.
# Shared here so results.py can exclude it from title-based deduplication.
UNTITLED_PAPER = "(제목 없음)"


@dataclass
class NormalizedCompound:
    """RDKit normalization output used by normalize.py and /api/chem/normalize."""

    original_input: str
    detected_type: str
    canonical_smiles: str
    inchi_key: str
    formula: str
    molecular_weight: float
    names: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass
class CompoundCandidate:
    """PubChem resolution candidate offered to the user for disambiguation.

    ``inchi_key`` and ``warnings`` are internal helpers and are not part of the
    public candidate JSON shape.
    """

    candidate_id: str
    title: str
    formula: str | None = None
    smiles: str | None = None
    cid: int | None = None
    inchi_key: str | None = None
    warnings: list[str] = field(default_factory=list)


@dataclass
class CompoundInfo:
    """Resolved compound attached to a finished search."""

    name: str | None
    canonical_smiles: str | None
    inchi_key: str | None
    formula: str | None
    cid: int | None
    warnings: list[str] = field(default_factory=list)


@dataclass
class PaperItem:
    """A single academic paper from Semantic Scholar, OpenAlex, or Crossref."""

    id: str
    title: str
    authors: list[str] = field(default_factory=list)
    venue: str | None = None
    year: int | None = None
    doi: str | None = None
    url: str | None = None
    citations: int | None = None
    abstract: str | None = None
    source: str = "semantic_scholar"
    score: float = 0.0


@dataclass
class HttpDiagnostics:
    """Transport-level diagnostics produced by HttpClient."""

    latency_ms: int
    cached: bool = False
    retry_count: int = 0
    message: str | None = None


@dataclass
class ProviderDiagnostics:
    """Per-provider outcome reported to API clients.

    ``status`` is one of: "ok", "empty", "rate_limited", "timeout", "error".
    """

    name: str
    status: str
    latency_ms: int | None = None
    cached: bool = False
    retry_count: int = 0
    message: str | None = None

    @classmethod
    def from_http(
        cls,
        name: str,
        status: str,
        http: HttpDiagnostics,
        *,
        message: str | None = None,
    ) -> "ProviderDiagnostics":
        return cls(
            name=name,
            status=status,
            latency_ms=http.latency_ms,
            cached=http.cached,
            retry_count=http.retry_count,
            message=message if message is not None else http.message,
        )


@dataclass
class CandidateResolution:
    """Outcome of resolving a chemical input into PubChem candidates."""

    detected_type: str
    candidates: list[CompoundCandidate]
    diagnostics: ProviderDiagnostics


@dataclass
class SearchReport:
    """Final papers-only search report.

    ``status`` is one of: "done", "partial", "failed".
    """

    query: str
    detected_type: str
    status: str
    compound: CompoundInfo | None
    papers: list[PaperItem] = field(default_factory=list)
    providers: list[ProviderDiagnostics] = field(default_factory=list)
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
