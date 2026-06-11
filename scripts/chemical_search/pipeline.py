"""Papers-only search orchestration.

Resolves a chemical input into PubChem candidates, normalizes the selected
candidate with RDKit, and searches Semantic Scholar + OpenAlex + Crossref for
academic papers about the compound.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Sequence

from .http_client import HttpClient
from .models import (
    CandidateResolution,
    CompoundCandidate,
    CompoundInfo,
    PaperItem,
    ProviderDiagnostics,
    SearchReport,
)
from .normalize import detect_input_type, normalize_structure
from .providers import CrossrefProvider, OpenAlexProvider, PubChemProvider, SemanticScholarProvider
from .results import merge_papers


logger = logging.getLogger(__name__)

PAPER_SOURCES = ("semantic_scholar", "openalex", "crossref")
HARD_ERROR_STATUSES = {"rate_limited", "timeout", "error"}

ALL_PROVIDERS_FAILED_ERROR = "논문 검색 제공자에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."
PROVIDER_CALL_ERROR = "제공자 호출 중 오류가 발생했습니다."


class SearchPipeline:
    def __init__(
        self,
        *,
        pubchem: PubChemProvider | None = None,
        semantic_scholar: SemanticScholarProvider | None = None,
        openalex: OpenAlexProvider | None = None,
        crossref: CrossrefProvider | None = None,
        cache_dir: Path | None = None,
        cache_enabled: bool = True,
    ):
        http: HttpClient | None = None
        if pubchem is None or semantic_scholar is None or openalex is None or crossref is None:
            http = HttpClient(timeout_seconds=10, cache_dir=cache_dir, cache_enabled=cache_enabled)
        self.pubchem = pubchem or PubChemProvider(http)
        self.semantic_scholar = semantic_scholar or SemanticScholarProvider(http)
        self.openalex = openalex or OpenAlexProvider(http)
        self.crossref = crossref or CrossrefProvider(http)

    def resolve_candidates(
        self,
        query: str,
        input_type: str = "auto",
        limit: int = 20,
    ) -> CandidateResolution:
        detected_type = detect_input_type(query) if input_type == "auto" else input_type
        candidates, diagnostics = self.pubchem.resolve_candidates(query, detected_type, limit)
        return CandidateResolution(
            detected_type=detected_type,
            candidates=candidates,
            diagnostics=diagnostics,
        )

    def run_papers(
        self,
        query: str,
        candidate: CompoundCandidate,
        *,
        detected_type: str = "name",
        sources: Sequence[str] | None = None,
        limit: int = 20,
        sort: str = "relevance",
        extra_providers: Sequence[ProviderDiagnostics] | None = None,
    ) -> SearchReport:
        """Run the paper search for an already-selected candidate object.

        The candidate is used directly; candidates are never re-fetched here.
        """
        selected_sources = self._validate_sources(sources)
        compound = self._build_compound(candidate)
        paper_query = compound.name or query

        paper_lists: list[list[PaperItem]] = []
        diagnostics: list[ProviderDiagnostics] = []
        providers = (
            ("semantic_scholar", self.semantic_scholar),
            ("openalex", self.openalex),
            ("crossref", self.crossref),
        )
        for name, provider in providers:
            if name not in selected_sources:
                continue
            try:
                papers, provider_diagnostics = provider.search_papers(paper_query, limit)
            except Exception:
                logger.exception("Paper provider '%s' raised unexpectedly.", name)
                papers = []
                provider_diagnostics = ProviderDiagnostics(
                    name=name,
                    status="error",
                    message=PROVIDER_CALL_ERROR,
                )
            paper_lists.append(papers)
            diagnostics.append(provider_diagnostics)

        papers = merge_papers(paper_lists, sort=sort)[:limit]
        status, error = self._derive_status(diagnostics)
        return SearchReport(
            query=query,
            detected_type=detected_type,
            status=status,
            compound=compound,
            papers=papers,
            providers=[*(extra_providers or []), *diagnostics],
            error=error,
        )

    @staticmethod
    def _validate_sources(sources: Sequence[str] | None) -> set[str]:
        if sources is None:
            return set(PAPER_SOURCES)
        selected = set(sources)
        if not selected:
            raise ValueError("sources must contain at least one paper source.")
        invalid = selected - set(PAPER_SOURCES)
        if invalid:
            raise ValueError(f"Unsupported sources: {sorted(invalid)}. Expected {PAPER_SOURCES}.")
        return selected

    @staticmethod
    def _derive_status(diagnostics: list[ProviderDiagnostics]) -> tuple[str, str | None]:
        """done = no provider hard-errored (empty results are not failures);
        partial = some provider hard-errored but at least one responded;
        failed = every provider hard-errored."""
        hard_errors = [item for item in diagnostics if item.status in HARD_ERROR_STATUSES]
        succeeded = [item for item in diagnostics if item.status in {"ok", "empty"}]
        if not hard_errors:
            return "done", None
        if succeeded:
            return "partial", None
        return "failed", ALL_PROVIDERS_FAILED_ERROR

    @staticmethod
    def _build_compound(candidate: CompoundCandidate) -> CompoundInfo:
        warnings = list(candidate.warnings)
        canonical_smiles = candidate.smiles
        inchi_key = candidate.inchi_key
        formula = candidate.formula
        if candidate.smiles:
            try:
                normalized = normalize_structure(candidate.smiles, "smiles", names=[candidate.title])
                canonical_smiles = normalized.canonical_smiles
                inchi_key = normalized.inchi_key or inchi_key
                formula = normalized.formula or formula
                warnings.extend(normalized.warnings)
            except (RuntimeError, ValueError):
                logger.warning("RDKit normalization failed for candidate %s.", candidate.candidate_id)
                warnings.append("RDKit 정규화에 실패하여 PubChem 값을 그대로 사용합니다.")
        else:
            warnings.append("후보 화합물에 SMILES 정보가 없어 구조 정규화를 건너뛰었습니다.")
        return CompoundInfo(
            name=candidate.title,
            canonical_smiles=canonical_smiles,
            inchi_key=inchi_key,
            formula=formula,
            cid=candidate.cid,
            warnings=warnings,
        )
