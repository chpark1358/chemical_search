"""Papers-only search orchestration.

Resolves a chemical input into PubChem candidates, normalizes the selected
candidate with RDKit, and searches OpenAlex + Crossref (plus Semantic Scholar
when its API key is set) for academic papers about the compound.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Sequence

from .http_client import HttpClient
from .korean_aliases import lookup_korean_alias
from .models import (
    CandidateResolution,
    CompoundCandidate,
    CompoundInfo,
    PaperItem,
    PatentItem,
    ProviderDiagnostics,
    SearchReport,
)
from .normalize import detect_input_type, normalize_structure
from .providers import (
    CrossrefProvider,
    GooglePatentsProvider,
    KiprisProvider,
    OpenAlexProvider,
    PubChemProvider,
    SemanticScholarProvider,
    SureChemblProvider,
    is_kipris_enabled,
    is_semantic_scholar_enabled,
)
from .results import dedup_patents, merge_papers
from .wikidata import contains_hangul, resolve_korean_name


logger = logging.getLogger(__name__)

# "semantic_scholar" is a paper source like openalex/crossref but, because
# unauthenticated S2 is aggressively rate-limited, it is only in the DEFAULT
# set when its API key is configured (see is_semantic_scholar_enabled). It is
# always a *valid* source; default_sources() decides whether it runs by default.
PAPER_SOURCES = ("semantic_scholar", "openalex", "crossref")
# Paper sources that are always on by default (no key required).
DEFAULT_PAPER_SOURCES = ("openalex", "crossref")
# Patent sources. "google_patents" and "surechembl" are always on (no key
# required); "kipris" is only active when its service key is configured (see
# is_kipris_enabled). All three are always *valid* sources; default_sources()
# decides whether the gated ones run by default.
PATENT_SOURCES = ("google_patents", "surechembl", "kipris")
# Patent sources that are always on by default (no key required).
DEFAULT_PATENT_SOURCES = ("google_patents", "surechembl")
ALL_SOURCES = (*PAPER_SOURCES, *PATENT_SOURCES)
HARD_ERROR_STATUSES = {"rate_limited", "timeout", "error"}

KOREAN_RESOLVED_WARNING = (
    "한글 물질명 '{name}'을 Wikidata로 해석했습니다 (PubChem CID {cid})."
)
# Used when Wikidata misses but a curated Korean alias (korean_aliases.py)
# resolves the name instead (e.g. 포르말린 -> formaldehyde).
KOREAN_ALIAS_RESOLVED_WARNING = (
    "한글 물질명 '{name}'을 내장 별칭 사전으로 '{target}'(으)로 해석했습니다 "
    "(PubChem CID {cid})."
)


def default_sources() -> tuple[str, ...]:
    """The sources used when the caller does not specify any.

    OpenAlex + Crossref (papers) and Google Patents + SureChEMBL (patents) are
    always on (no key required). Semantic Scholar is included only when its API
    key is set (without it, S2 is unauthenticated and reliably 429s — see
    is_semantic_scholar_enabled), and KIPRIS only when its service key is set
    (see is_kipris_enabled). Gated sources absent from the default set are simply
    not queried — not an error, so they never appear in providers[]/patents[]."""
    sources: list[str] = []
    if is_semantic_scholar_enabled():
        sources.append("semantic_scholar")
    sources.extend(DEFAULT_PAPER_SOURCES)
    sources.extend(DEFAULT_PATENT_SOURCES)
    if is_kipris_enabled():
        sources.append("kipris")
    return tuple(sources)

ALL_PROVIDERS_FAILED_ERROR = "논문 및 특허 검색 제공자에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."
PROVIDER_CALL_ERROR = "제공자 호출 중 오류가 발생했습니다."


class SearchPipeline:
    def __init__(
        self,
        *,
        pubchem: PubChemProvider | None = None,
        semantic_scholar: SemanticScholarProvider | None = None,
        openalex: OpenAlexProvider | None = None,
        crossref: CrossrefProvider | None = None,
        google_patents: GooglePatentsProvider | None = None,
        surechembl: SureChemblProvider | None = None,
        kipris: KiprisProvider | None = None,
        cache_dir: Path | None = None,
        cache_enabled: bool = True,
    ):
        http: HttpClient | None = None
        if (
            pubchem is None
            or semantic_scholar is None
            or openalex is None
            or crossref is None
            or google_patents is None
            or surechembl is None
            or kipris is None
        ):
            http = HttpClient(timeout_seconds=10, cache_dir=cache_dir, cache_enabled=cache_enabled)
        self.http = http
        self.pubchem = pubchem or PubChemProvider(http)
        self.semantic_scholar = semantic_scholar or SemanticScholarProvider(http)
        self.openalex = openalex or OpenAlexProvider(http)
        self.crossref = crossref or CrossrefProvider(http)
        self.google_patents = google_patents or GooglePatentsProvider(http)
        self.surechembl = surechembl or SureChemblProvider(http)
        self.kipris = kipris or KiprisProvider(http)

    def resolve_candidates(
        self,
        query: str,
        input_type: str = "auto",
        limit: int = 20,
    ) -> CandidateResolution:
        detected_type = detect_input_type(query) if input_type == "auto" else input_type
        # Korean (Hangul) names are not understood by PubChem's name lookup, so
        # for auto/name inputs containing Hangul we first resolve the name to a
        # PubChem identifier via Wikidata and feed that into the normal PubChem
        # path. On any miss we fall through to the unchanged PubChem lookup.
        if input_type in {"auto", "name"} and contains_hangul(query):
            korean = self._resolve_korean(query, limit)
            if korean is not None:
                return korean
        candidates, diagnostics = self.pubchem.resolve_candidates(query, detected_type, limit)
        return CandidateResolution(
            detected_type=detected_type,
            candidates=candidates,
            diagnostics=diagnostics,
        )

    def _resolve_korean(self, query: str, limit: int) -> CandidateResolution | None:
        """Resolve a Hangul query via Wikidata, then a curated alias fallback.

        Returns a ``CandidateResolution`` when Wikidata yields a CID/InChIKey
        that PubChem confirms; on a Wikidata miss, falls back to the curated
        Korean-alias dictionary (korean_aliases.py) for common solution/brand
        names Wikidata lacks (e.g. 포르말린, 포도당, 타이레놀). Returns ``None``
        when neither path is confirmed by PubChem, so the caller falls through
        to the normal PubChem name lookup. Failures never raise: Wikidata
        problems are swallowed inside ``resolve_korean_name``.
        """
        if self.http is None:
            return None
        resolution = resolve_korean_name(query, self.http)
        if resolution is None:
            return self._resolve_korean_alias(query, limit)

        # Prefer the InChIKey path (a single confident PubChem candidate);
        # fall back to the CID path when only a CID is available.
        if resolution.inchi_key:
            candidates, diagnostics = self.pubchem.resolve_candidates(
                resolution.inchi_key, "inchi_key", limit
            )
        elif resolution.cid is not None:
            candidates, diagnostics = self.pubchem.resolve_by_cid(resolution.cid, limit)
        else:  # pragma: no cover - resolve_korean_name never returns this shape
            return None

        if not candidates:
            return None

        note = KOREAN_RESOLVED_WARNING.format(
            name=resolution.label,
            cid=resolution.cid if resolution.cid is not None else "-",
        )
        for candidate in candidates:
            candidate.warnings.append(note)
        # Korean input is, by definition, a name; report it as such regardless
        # of how PubChem ultimately resolved it.
        return CandidateResolution(
            detected_type="name",
            candidates=candidates,
            diagnostics=diagnostics,
        )

    def _resolve_korean_alias(self, query: str, limit: int) -> CandidateResolution | None:
        """Resolve a Hangul query via the curated alias dictionary.

        Tried only after a Wikidata miss. Prefers the curated CID (one confident
        PubChem record) and otherwise the curated English name. Returns ``None``
        when the query is not in the dictionary or PubChem does not confirm the
        target, so the caller falls through to the normal PubChem name lookup.
        """
        alias = lookup_korean_alias(query)
        if alias is None:
            return None

        cid = alias.get("cid")
        name = alias.get("name")
        if isinstance(cid, int):
            candidates, diagnostics = self.pubchem.resolve_by_cid(cid, limit)
        elif isinstance(name, str):
            candidates, diagnostics = self.pubchem.resolve_candidates(name, "name", limit)
        else:  # pragma: no cover - every alias carries a name and/or cid
            return None

        if not candidates:
            return None

        note = KOREAN_ALIAS_RESOLVED_WARNING.format(
            name=query.strip(),
            target=name if isinstance(name, str) else (f"CID {cid}"),
            cid=cid if isinstance(cid, int) else "-",
        )
        for candidate in candidates:
            candidate.warnings.append(note)
        return CandidateResolution(
            detected_type="name",
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
        """Run the paper and patent search for an already-selected candidate.

        The candidate is used directly; candidates are never re-fetched here.
        Papers come from OpenAlex / Crossref plus (when its key is set, or when
        explicitly requested) Semantic Scholar, and patents from Google Patents
        + SureChEMBL plus (when its key is set) KIPRIS; the two result types are
        reported separately. The patent providers are merged into a single
        ``patents`` list, ORDERED Google Patents (relevance-ranked) first, then
        KIPRIS, then SureChEMBL (recall-ordered), and deduplicated by publication
        number across all three so the most relevant first-seen record wins. Each
        source's ``totalCount`` contribution is summed into ``patents_total_hits``.
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

        patent_name = compound.name or query
        # KIPRIS prefers the original Korean query when the user typed Korean,
        # otherwise the resolved compound name.
        kipris_word = query if contains_hangul(query) else patent_name

        # Patent items are accumulated in display/merge order: Google Patents
        # (relevance-ranked) first, then KIPRIS, then SureChEMBL (recall-ordered).
        # dedup_patents keeps the first-seen record per publication number, so a
        # document found by Google wins over the same one from KIPRIS/SureChEMBL.
        patent_items: list[PatentItem] = []
        total_hits_parts: list[int] = []

        if "google_patents" in selected_sources:
            try:
                gp_patents, gp_total, gp_diagnostics = self.google_patents.search_patents(
                    query=patent_name,
                    limit=limit,
                )
            except Exception:
                logger.exception("Patent provider 'google_patents' raised unexpectedly.")
                gp_patents = []
                gp_total = None
                gp_diagnostics = ProviderDiagnostics(
                    name="google_patents",
                    status="error",
                    message=PROVIDER_CALL_ERROR,
                )
            patent_items.extend(gp_patents)
            if gp_total is not None:
                total_hits_parts.append(gp_total)
            diagnostics.append(gp_diagnostics)

        if "kipris" in selected_sources:
            try:
                kipris_patents, kipris_total, kipris_diagnostics = self.kipris.search_patents(
                    word=kipris_word,
                    limit=limit,
                )
            except Exception:
                logger.exception("Patent provider 'kipris' raised unexpectedly.")
                kipris_patents = []
                kipris_total = None
                kipris_diagnostics = ProviderDiagnostics(
                    name="kipris",
                    status="error",
                    message=PROVIDER_CALL_ERROR,
                )
            patent_items.extend(kipris_patents)
            if kipris_total is not None:
                total_hits_parts.append(kipris_total)
            diagnostics.append(kipris_diagnostics)

        if "surechembl" in selected_sources:
            try:
                sc_patents, sc_total, patent_diagnostics = self.surechembl.search_patents(
                    smiles=compound.canonical_smiles,
                    compound_name=patent_name,
                    inchi_key=compound.inchi_key,
                    limit=limit,
                )
            except Exception:
                logger.exception("Patent provider 'surechembl' raised unexpectedly.")
                sc_patents = []
                sc_total = None
                patent_diagnostics = ProviderDiagnostics(
                    name="surechembl",
                    status="error",
                    message=PROVIDER_CALL_ERROR,
                )
            patent_items.extend(sc_patents)
            if sc_total is not None:
                total_hits_parts.append(sc_total)
            diagnostics.append(patent_diagnostics)

        # Dedup across Google Patents + KIPRIS + SureChEMBL by publication number.
        # Each provider already returns at most ``limit`` rows, so we do NOT
        # re-cap the merged list to ``limit`` — that would let the first source
        # fill every slot and crowd the others out entirely. Keeping each
        # source's contribution lets the 특허 tab show global + Korean patents
        # (the UI filters by source); first-seen-wins keeps Google's relevance
        # ordering ahead of SureChEMBL's recall ordering for shared documents.
        patents = dedup_patents(patent_items)
        # patents_total_hits is the sum of each patent source's reported total;
        # None when no patent source reported a count (e.g. none selected).
        patents_total_hits = sum(total_hits_parts) if total_hits_parts else None

        papers = merge_papers(paper_lists, sort=sort)[:limit]
        status, error = self._derive_status(diagnostics)
        return SearchReport(
            query=query,
            detected_type=detected_type,
            status=status,
            compound=compound,
            papers=papers,
            patents=patents,
            patents_total_hits=patents_total_hits,
            providers=[*(extra_providers or []), *diagnostics],
            error=error,
        )

    @staticmethod
    def _validate_sources(sources: Sequence[str] | None) -> set[str]:
        # No explicit sources => the conditional default set. Semantic Scholar
        # and KIPRIS are only in the default set when their respective keys are
        # configured, so with no key they never run by default (and so are
        # absent from providers[]/patents[]).
        if sources is None:
            return set(default_sources())
        selected = set(sources)
        if not selected:
            raise ValueError("sources must contain at least one source.")
        invalid = selected - set(ALL_SOURCES)
        if invalid:
            raise ValueError(f"Unsupported sources: {sorted(invalid)}. Expected {ALL_SOURCES}.")
        # "kipris" is a valid source value, but without a configured key the
        # provider is inactive: drop it from the active set so it never runs
        # and never appears in providers[]/patents[].
        if "kipris" in selected and not is_kipris_enabled():
            selected.discard("kipris")
        # Note: "semantic_scholar" is NOT dropped without a key. Unlike KIPRIS
        # (which has no usable unauthenticated mode), an explicit
        # sources=["semantic_scholar"] still runs — it just likely rate-limits.
        # That is the caller's explicit choice; only the DEFAULT set gates it.
        return selected

    @staticmethod
    def _derive_status(diagnostics: list[ProviderDiagnostics]) -> tuple[str, str | None]:
        """Status spans BOTH paper and patent providers in ``diagnostics``.

        done = no selected provider hard-errored (empty everywhere is still
        "done" with empty arrays); partial = some selected provider hard-errored
        but at least one (paper or patent) responded; failed = every selected
        provider hard-errored."""
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
