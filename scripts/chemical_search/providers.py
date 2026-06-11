"""PubChem compound resolution and Semantic Scholar / Crossref paper search."""

from __future__ import annotations

import os
import re
from typing import Any
from urllib.parse import quote

from .http_client import HttpClient, ProviderHttpError
from .models import UNTITLED_PAPER, CompoundCandidate, PaperItem, ProviderDiagnostics


PUBCHEM_CACHE_TTL = 7 * 24 * 60 * 60
SEMANTIC_SCHOLAR_CACHE_TTL = 3 * 24 * 60 * 60
CROSSREF_CACHE_TTL = 7 * 24 * 60 * 60

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
