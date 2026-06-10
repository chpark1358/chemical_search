from __future__ import annotations

from pathlib import Path

from .http_client import HttpClient
from .models import NormalizedCompound, ProviderResult, SearchReport
from .normalize import detect_input_type, normalize_structure
from .providers import ChemblProvider, CrossrefProvider, PubChemProvider, SemanticScholarProvider
from .results import merge_and_rank


class SearchPipeline:
    def __init__(
        self,
        *,
        pubchem: PubChemProvider | None = None,
        chembl: ChemblProvider | None = None,
        semantic_scholar: SemanticScholarProvider | None = None,
        crossref: CrossrefProvider | None = None,
        cache_dir: Path | None = None,
        cache_enabled: bool = True,
    ):
        http = HttpClient(timeout_seconds=10, cache_dir=cache_dir, cache_enabled=cache_enabled)
        self.pubchem = pubchem or PubChemProvider(http)
        self.chembl = chembl or ChemblProvider(http)
        self.semantic_scholar = semantic_scholar or SemanticScholarProvider(http)
        self.crossref = crossref or CrossrefProvider(http)

    def run(
        self,
        query: str,
        *,
        input_type: str = "auto",
        mode: str = "all",
        threshold: int = 80,
        candidate_index: int = 0,
        limit: int = 5,
        include_semantic_scholar: bool = True,
        sources: set[str] | None = None,
    ) -> SearchReport:
        selected_sources = sources or {"pubchem", "chembl", "semantic_scholar", "crossref"}
        detected_type = detect_input_type(query) if input_type == "auto" else input_type
        warnings: list[str] = []
        provider_results: list[ProviderResult] = []

        candidate_result = self.pubchem.resolve_candidates(query, detected_type, limit)
        provider_results.append(candidate_result)
        candidates = candidate_result.items

        try:
            selected_compound = self._select_and_normalize(
                query,
                detected_type,
                candidates,
                candidate_index,
                warnings,
            )
        except (RuntimeError, ValueError) as exc:
            warnings.append(str(exc))
            selected_compound = None
        if selected_compound is None:
            return SearchReport(
                query=query,
                detected_type=detected_type,
                mode=mode,
                threshold=threshold,
                status="partial",
                selected_compound=None,
                compound_candidates=candidates,
                provider_results=provider_results,
                warnings=warnings,
            )

        operations = ["exact", "similarity", "substructure"] if mode == "all" else [mode]
        if "chembl" in selected_sources:
            provider_results.extend(
                self.chembl.search(selected_compound, operation, threshold=threshold, limit=limit)
                for operation in operations
            )

        paper_query = selected_compound.names[0] if selected_compound.names else selected_compound.inchi_key
        if include_semantic_scholar and "semantic_scholar" in selected_sources:
            provider_results.append(self.semantic_scholar.search(paper_query, limit))
        if "crossref" in selected_sources:
            provider_results.append(self.crossref.search(paper_query, limit))

        failed = [result for result in provider_results if result.status not in {"ok"}]
        results = merge_and_rank(provider_results, selected_compound)
        return SearchReport(
            query=query,
            detected_type=detected_type,
            mode=mode,
            threshold=threshold,
            status="partial" if failed else "ok",
            selected_compound=selected_compound,
            compound_candidates=candidates,
            provider_results=provider_results,
            results=results,
            warnings=warnings,
        )

    def _select_and_normalize(
        self,
        query: str,
        detected_type: str,
        candidates: list,
        candidate_index: int,
        warnings: list[str],
    ) -> NormalizedCompound | None:
        if detected_type in {"smiles", "inchi"}:
            names = [candidates[0].title] if candidates else []
            return normalize_structure(query, detected_type, names=names)

        if not candidates:
            warnings.append(f"No PubChem candidate resolved the {detected_type} input.")
            return None
        if candidate_index < 0 or candidate_index >= len(candidates):
            warnings.append(
                f"Candidate index {candidate_index} is outside the available range 0-{len(candidates) - 1}."
            )
            return None
        if len(candidates) > 1:
            warnings.append(
                f"{len(candidates)} candidates were returned; candidate index {candidate_index} was selected."
            )

        candidate = candidates[candidate_index]
        smiles = candidate.data.get("canonical_smiles")
        if not smiles:
            warnings.append("Selected candidate has no canonical SMILES and cannot be normalized.")
            return None
        compound = normalize_structure(smiles, "smiles", names=[candidate.title])
        compound.original_input = query
        compound.detected_type = detected_type
        return compound
