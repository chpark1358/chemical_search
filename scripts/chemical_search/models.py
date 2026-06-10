from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class NormalizedCompound:
    original_input: str
    detected_type: str
    canonical_smiles: str
    inchi_key: str
    formula: str
    molecular_weight: float
    names: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass
class SearchItem:
    id: str
    source: str
    kind: str
    title: str
    source_url: str
    match_reason: str
    score: float | None = None
    data: dict[str, Any] = field(default_factory=dict)


@dataclass
class ProviderDiagnostics:
    latency_ms: int
    retrieved_at: str
    cached: bool = False
    retry_count: int = 0
    message: str | None = None


@dataclass
class ProviderResult:
    source: str
    operation: str
    status: str
    items: list[SearchItem]
    diagnostics: ProviderDiagnostics


@dataclass
class SearchReport:
    query: str
    detected_type: str
    mode: str
    threshold: int
    status: str
    selected_compound: NormalizedCompound | None
    compound_candidates: list[SearchItem]
    provider_results: list[ProviderResult]
    results: list[SearchItem] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
