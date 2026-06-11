"""PubChem compound resolution and Semantic Scholar / OpenAlex / Crossref paper search."""

from __future__ import annotations

import os
import re
from typing import Any
from urllib.parse import quote

from .http_client import HttpClient, ProviderHttpError
from .models import (
    UNTITLED_PAPER,
    UNTITLED_PATENT,
    CompoundCandidate,
    HttpDiagnostics,
    PaperItem,
    PatentItem,
    ProviderDiagnostics,
)


PUBCHEM_CACHE_TTL = 7 * 24 * 60 * 60
SEMANTIC_SCHOLAR_CACHE_TTL = 3 * 24 * 60 * 60
CROSSREF_CACHE_TTL = 7 * 24 * 60 * 60
OPENALEX_CACHE_TTL = 3 * 24 * 60 * 60
SURECHEMBL_CACHE_TTL = 7 * 24 * 60 * 60

# SureChEMBL encodes a JSON null as the literal string "null"; treat it as None.
_SURECHEMBL_NULL = "null"

# Reconstructed OpenAlex abstracts are capped to keep payloads bounded.
OPENALEX_ABSTRACT_MAX_CHARS = 2500

MISSING_STEREO_WARNING = "입체화학 정보가 없는 SMILES로 정규화되었습니다."

# Stereo-bearing SMILES properties first; "SMILES" is the new PubChem name for
# the stereo-aware SMILES, "ConnectivitySMILES" the new name for the old
# stereo-free CanonicalSMILES.
_SMILES_PRIORITY: tuple[tuple[str, bool], ...] = (
    ("IsomericSMILES", True),
    ("SMILES", True),
    ("CanonicalSMILES", False),
    ("ConnectivitySMILES", False),
)

_TAG_RE = re.compile(r"<[^>]+>")
_DOI_URL_PREFIX_RE = re.compile(r"^https?://doi\.org/", re.IGNORECASE)


def _error_diagnostics(name: str, exc: ProviderHttpError) -> ProviderDiagnostics:
    status = {
        "rate_limited": "rate_limited",
        "timeout": "timeout",
        "not_found": "empty",
    }.get(exc.status, "error")
    return ProviderDiagnostics.from_http(name, status, exc.diagnostics)


class PubChemProvider:
    name = "pubchem"
    property_names = (
        "Title,MolecularFormula,IsomericSMILES,SMILES,CanonicalSMILES,"
        "ConnectivitySMILES,InChIKey"
    )

    def __init__(self, http: HttpClient):
        self.http = http

    def resolve_candidates(
        self,
        query: str,
        input_type: str,
        limit: int,
    ) -> tuple[list[CompoundCandidate], ProviderDiagnostics]:
        try:
            if input_type == "formula":
                cid_url = (
                    "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/fastformula/"
                    f"{quote(query, safe='')}/cids/JSON"
                )
                cid_data, cid_http = self.http.get_json(
                    cid_url,
                    cache_ttl_seconds=PUBCHEM_CACHE_TTL,
                    retries=2,
                )
                cids = cid_data.get("IdentifierList", {}).get("CID", [])[:limit]
                if not cids:
                    return [], ProviderDiagnostics.from_http(self.name, "empty", cid_http)
                property_url = (
                    "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/"
                    f"{','.join(str(cid) for cid in cids)}/property/{self.property_names}/JSON"
                )
            else:
                namespace = {
                    "name": "name",
                    "smiles": "smiles",
                    "inchi": "inchi",
                    "inchi_key": "inchikey",
                }[input_type]
                property_url = (
                    f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/{namespace}/"
                    f"{quote(query, safe='')}/property/{self.property_names}/JSON"
                )

            data, http = self.http.get_json(
                property_url,
                cache_ttl_seconds=PUBCHEM_CACHE_TTL,
                retries=2,
            )
            rows = data.get("PropertyTable", {}).get("Properties", [])[:limit]
            candidates = [self._candidate(row) for row in rows]
            status = "ok" if candidates else "empty"
            return candidates, ProviderDiagnostics.from_http(self.name, status, http)
        except ProviderHttpError as exc:
            return [], _error_diagnostics(self.name, exc)

    def _candidate(self, row: dict[str, Any]) -> CompoundCandidate:
        raw_cid = row.get("CID")
        cid = int(raw_cid) if isinstance(raw_cid, int) or (isinstance(raw_cid, str) and raw_cid.isdigit()) else None
        smiles: str | None = None
        warnings: list[str] = []
        for property_name, has_stereo in _SMILES_PRIORITY:
            value = row.get(property_name)
            if value:
                smiles = str(value)
                if not has_stereo:
                    warnings.append(MISSING_STEREO_WARNING)
                break
        title = row.get("Title") or row.get("InChIKey") or f"PubChem CID {cid}"
        return CompoundCandidate(
            candidate_id=f"pubchem:{cid if cid is not None else 'unknown'}",
            title=str(title),
            formula=row.get("MolecularFormula"),
            smiles=smiles,
            cid=cid,
            inchi_key=row.get("InChIKey"),
            warnings=warnings,
        )


class SemanticScholarProvider:
    name = "semantic_scholar"
    fields = "title,abstract,venue,year,authors,citationCount,url,externalIds"

    def __init__(self, http: HttpClient):
        self.http = http

    def search_papers(self, query: str, limit: int) -> tuple[list[PaperItem], ProviderDiagnostics]:
        url = (
            "https://api.semanticscholar.org/graph/v1/paper/search?"
            f"query={quote(query)}&limit={limit}&fields={self.fields}"
        )
        headers: dict[str, str] = {}
        if api_key := os.getenv("SEMANTIC_SCHOLAR_API_KEY"):
            headers["x-api-key"] = api_key
        try:
            data, http = self.http.get_json(
                url,
                headers=headers,
                cache_ttl_seconds=SEMANTIC_SCHOLAR_CACHE_TTL,
                retries=1,
            )
            papers = [self._paper(row) for row in data.get("data") or []]
            status = "ok" if papers else "empty"
            return papers, ProviderDiagnostics.from_http(self.name, status, http)
        except ProviderHttpError as exc:
            return [], _error_diagnostics(self.name, exc)

    def _paper(self, row: dict[str, Any]) -> PaperItem:
        paper_id = row.get("paperId") or "unknown"
        external_ids = row.get("externalIds") or {}
        doi = external_ids.get("DOI")
        url = row.get("url") or (
            f"https://doi.org/{doi}" if doi else f"https://www.semanticscholar.org/paper/{paper_id}"
        )
        return PaperItem(
            id=f"semantic_scholar:{paper_id}",
            title=row.get("title") or UNTITLED_PAPER,
            authors=[author["name"] for author in row.get("authors") or [] if author.get("name")],
            venue=row.get("venue") or None,
            year=row.get("year"),
            doi=doi,
            url=url,
            citations=row.get("citationCount"),
            abstract=row.get("abstract") or None,
            source=self.name,
        )


class OpenAlexProvider:
    name = "openalex"

    def __init__(self, http: HttpClient):
        self.http = http

    def search_papers(self, query: str, limit: int) -> tuple[list[PaperItem], ProviderDiagnostics]:
        url = f"https://api.openalex.org/works?search={quote(query)}&per-page={limit}"
        if mailto := os.getenv("OPENALEX_MAILTO") or os.getenv("CROSSREF_MAILTO"):
            url += f"&mailto={quote(mailto)}"
        try:
            data, http = self.http.get_json(
                url,
                cache_ttl_seconds=OPENALEX_CACHE_TTL,
                retries=1,
            )
            papers = [self._paper(row) for row in data.get("results") or []]
            status = "ok" if papers else "empty"
            return papers, ProviderDiagnostics.from_http(self.name, status, http)
        except ProviderHttpError as exc:
            return [], _error_diagnostics(self.name, exc)

    def _paper(self, row: dict[str, Any]) -> PaperItem:
        work_id = row.get("id")
        doi = self._doi(row.get("doi"))
        primary_location = row.get("primary_location") or {}
        source = primary_location.get("source") or {}
        url = (
            f"https://doi.org/{doi}"
            if doi
            else primary_location.get("landing_page_url") or work_id
        )
        title = row.get("display_name") or UNTITLED_PAPER
        return PaperItem(
            id=f"openalex:{work_id or doi or title}",
            title=title,
            authors=self._authors(row.get("authorships") or []),
            venue=source.get("display_name") or None,
            year=row.get("publication_year"),
            doi=doi,
            url=url,
            citations=row.get("cited_by_count"),
            abstract=self._abstract(row.get("abstract_inverted_index")),
            source=self.name,
        )

    @staticmethod
    def _doi(value: str | None) -> str | None:
        """Strip the ``https://doi.org/`` prefix (case-insensitive) off the full DOI URL."""
        if not value:
            return None
        return _DOI_URL_PREFIX_RE.sub("", value) or None

    @staticmethod
    def _authors(rows: list[dict[str, Any]]) -> list[str]:
        authors: list[str] = []
        for row in rows:
            name = (row.get("author") or {}).get("display_name")
            if name:
                authors.append(name)
        return authors

    @staticmethod
    def _abstract(inverted_index: dict[str, list[int]] | None) -> str | None:
        """Reconstruct the abstract from OpenAlex's {word: [positions]} inverted index."""
        if not inverted_index:
            return None
        positioned_words: list[tuple[int, str]] = []
        for word, positions in inverted_index.items():
            for position in positions or []:
                if isinstance(position, int):
                    positioned_words.append((position, word))
        if not positioned_words:
            return None
        positioned_words.sort()
        text = " ".join(word for _, word in positioned_words)
        return text[:OPENALEX_ABSTRACT_MAX_CHARS] or None


class CrossrefProvider:
    name = "crossref"

    def __init__(self, http: HttpClient):
        self.http = http

    def search_papers(self, query: str, limit: int) -> tuple[list[PaperItem], ProviderDiagnostics]:
        url = f"https://api.crossref.org/works?query.bibliographic={quote(query)}&rows={limit}"
        if mailto := os.getenv("CROSSREF_MAILTO"):
            url += f"&mailto={quote(mailto)}"
        try:
            data, http = self.http.get_json(
                url,
                cache_ttl_seconds=CROSSREF_CACHE_TTL,
                retries=1,
            )
            rows = data.get("message", {}).get("items") or []
            papers = [self._paper(row) for row in rows]
            status = "ok" if papers else "empty"
            return papers, ProviderDiagnostics.from_http(self.name, status, http)
        except ProviderHttpError as exc:
            return [], _error_diagnostics(self.name, exc)

    def _paper(self, row: dict[str, Any]) -> PaperItem:
        doi = row.get("DOI")
        titles = row.get("title") or []
        title = titles[0] if titles else UNTITLED_PAPER
        url = row.get("URL") or (f"https://doi.org/{doi}" if doi else None)
        return PaperItem(
            id=f"crossref:{doi or url or title}",
            title=title,
            authors=self._authors(row.get("author") or []),
            venue=(row.get("container-title") or [None])[0],
            year=self._year(row),
            doi=doi,
            url=url,
            citations=row.get("is-referenced-by-count"),
            abstract=self._abstract(row.get("abstract")),
            source=self.name,
        )

    @staticmethod
    def _authors(rows: list[dict[str, Any]]) -> list[str]:
        authors: list[str] = []
        for row in rows:
            name = " ".join(part for part in (row.get("given"), row.get("family")) if part)
            if not name:
                name = row.get("name") or ""
            if name:
                authors.append(name)
        return authors

    @staticmethod
    def _year(row: dict[str, Any]) -> int | None:
        for key in ("issued", "published", "published-print", "published-online"):
            date_parts = (row.get(key) or {}).get("date-parts") or []
            if date_parts and date_parts[0] and isinstance(date_parts[0][0], int):
                return date_parts[0][0]
        return None

    @staticmethod
    def _abstract(value: str | None) -> str | None:
        if not value:
            return None
        return _TAG_RE.sub("", value).strip() or None


class SureChemblProvider:
    """SureChEMBL patent search.

    Two-call flow: resolve the SureChEMBL ``chemical_id`` from the already
    resolved compound (SMILES lookup, with a name fallback), then fetch the
    patent documents associated with that chemical id. SureChEMBL is free and
    needs no API key.
    """

    name = "surechembl"
    base_url = "https://www.surechembl.org/api"

    def __init__(self, http: HttpClient):
        self.http = http

    def search_patents(
        self,
        *,
        smiles: str | None,
        compound_name: str | None,
        inchi_key: str | None,
        limit: int,
    ) -> tuple[list[PatentItem], int | None, ProviderDiagnostics]:
        """Resolve the chemical id then fetch its patents.

        Returns ``(patents, total_hits, diagnostics)``. When the compound
        cannot be resolved on SureChEMBL the status is "empty" (no patents
        found is not an error).
        """
        try:
            chemical_id, resolve_http = self._resolve_chemical_id(
                smiles=smiles,
                compound_name=compound_name,
                inchi_key=inchi_key,
            )
            if chemical_id is None:
                return [], None, ProviderDiagnostics.from_http(self.name, "empty", resolve_http)

            url = (
                f"{self.base_url}/search/documents_for_structures"
                f"?chemicalIds={quote(str(chemical_id), safe='')}"
                f"&page=1&itemsPerPage={limit}"
            )
            data, http = self.http.post_json(
                url,
                headers={"Content-Type": "application/json"},
                cache_ttl_seconds=SURECHEMBL_CACHE_TTL,
                retries=1,
            )
            results = (data.get("data") or {}).get("results") or {}
            documents = results.get("documents") or []
            patents = [self._patent(doc) for doc in documents]
            total_hits = self._int(results.get("total_hits"))
            status = "ok" if patents else "empty"
            return patents, total_hits, ProviderDiagnostics.from_http(self.name, status, http)
        except ProviderHttpError as exc:
            return [], None, _error_diagnostics(self.name, exc)

    def _resolve_chemical_id(
        self,
        *,
        smiles: str | None,
        compound_name: str | None,
        inchi_key: str | None,
    ) -> tuple[str | None, HttpDiagnostics]:
        last_http: HttpDiagnostics | None = None
        if smiles:
            url = f"{self.base_url}/chemical/smiles/?smiles={quote(smiles, safe='')}"
            data, last_http = self.http.post_json(
                url,
                headers={"Content-Type": "application/json"},
                cache_ttl_seconds=SURECHEMBL_CACHE_TTL,
                retries=1,
            )
            chemical_id = self._chemical_id_from_smiles(data.get("data"))
            if chemical_id is not None:
                return chemical_id, last_http

        if compound_name:
            url = f"{self.base_url}/chemical/name/{quote(compound_name, safe='')}"
            data, last_http = self.http.get_json(
                url,
                cache_ttl_seconds=SURECHEMBL_CACHE_TTL,
                retries=1,
            )
            chemical_id = self._chemical_id_from_name(data.get("data"), inchi_key)
            if chemical_id is not None:
                return chemical_id, last_http

        if last_http is None:
            last_http = HttpDiagnostics(latency_ms=0, cached=False, retry_count=0)
        return None, last_http

    @staticmethod
    def _chemical_id_from_smiles(data: Any) -> str | None:
        """The SMILES lookup returns a dict keyed by the input SMILES; take the
        first value's chemical_id."""
        if not isinstance(data, dict):
            return None
        for value in data.values():
            if isinstance(value, dict):
                chemical_id = value.get("chemical_id") or value.get("id")
                if chemical_id:
                    return str(chemical_id)
        return None

    @staticmethod
    def _chemical_id_from_name(data: Any, inchi_key: str | None) -> str | None:
        """The name lookup returns a list. Prefer an inchi_key match, then the
        highest global_frequency, then the first entry."""
        if not isinstance(data, list):
            return None
        entries = [item for item in data if isinstance(item, dict) and item.get("chemical_id")]
        if not entries:
            return None
        if inchi_key:
            target = inchi_key.casefold()
            for item in entries:
                value = item.get("inchi_key")
                if isinstance(value, str) and value.casefold() == target:
                    return str(item["chemical_id"])
        best = max(entries, key=lambda item: SureChemblProvider._int(item.get("global_frequency")) or 0)
        return str(best["chemical_id"])

    def _patent(self, doc: dict[str, Any]) -> PatentItem:
        doc_id = str(doc.get("docId") or "")
        publication_number = doc_id.replace("-", "")
        metadata = doc.get("metadata") or {}
        url = (
            f"https://patents.google.com/patent/{publication_number}/en"
            if publication_number
            else None
        )
        return PatentItem(
            id=doc_id or publication_number or UNTITLED_PATENT,
            publication_number=publication_number,
            title=self._title(metadata.get("titles")),
            url=url,
            assignee=self._clean(doc.get("pa")),
            date=self._clean(metadata.get("pd")),
            source=self.name,
        )

    @staticmethod
    def _title(titles: Any) -> str:
        """metadata.titles is a list of {lang, titles:[...]}. Prefer English,
        else the first available title; fall back to the shared placeholder."""
        if not isinstance(titles, list):
            return UNTITLED_PATENT
        first_available: str | None = None
        for entry in titles:
            if not isinstance(entry, dict):
                continue
            values = entry.get("titles") or []
            text = values[0] if values and values[0] else None
            if not text:
                continue
            if entry.get("lang") == "en":
                return str(text)
            if first_available is None:
                first_available = str(text)
        return first_available or UNTITLED_PATENT

    @staticmethod
    def _clean(value: Any) -> str | None:
        """SureChEMBL encodes missing values as the literal string "null"."""
        if value is None:
            return None
        text = str(value).strip()
        if not text or text == _SURECHEMBL_NULL:
            return None
        return text

    @staticmethod
    def _int(value: Any) -> int | None:
        if isinstance(value, bool):
            return None
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.strip().lstrip("-").isdigit():
            return int(value)
        return None
