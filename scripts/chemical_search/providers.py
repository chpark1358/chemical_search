"""PubChem compound resolution and Semantic Scholar / OpenAlex / Crossref paper search."""

from __future__ import annotations

import logging
import os
import re
from typing import Any
from urllib.parse import quote
from xml.etree import ElementTree

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


logger = logging.getLogger(__name__)

PUBCHEM_CACHE_TTL = 7 * 24 * 60 * 60
SEMANTIC_SCHOLAR_CACHE_TTL = 3 * 24 * 60 * 60
CROSSREF_CACHE_TTL = 7 * 24 * 60 * 60
OPENALEX_CACHE_TTL = 3 * 24 * 60 * 60
SURECHEMBL_CACHE_TTL = 7 * 24 * 60 * 60
KIPRIS_CACHE_TTL = 24 * 60 * 60

# Environment variable that gates the KIPRIS patent provider. When unset the
# provider is inactive (see pipeline.PATENT_SOURCES / is_kipris_enabled).
KIPRIS_SERVICE_KEY_ENV = "KIPRIS_SERVICE_KEY"

# Environment variable that gates the Semantic Scholar paper provider in the
# DEFAULT source set. Unauthenticated S2 requests are aggressively rate-limited
# (HTTP 429), so without a key S2 is omitted from default_sources() rather than
# cluttering results with a hard error (see is_semantic_scholar_enabled).
SEMANTIC_SCHOLAR_API_KEY_ENV = "SEMANTIC_SCHOLAR_API_KEY"

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

    def resolve_by_cid(
        self,
        cid: int,
        limit: int = 1,
    ) -> tuple[list[CompoundCandidate], ProviderDiagnostics]:
        """Resolve a single PubChem CID to a candidate using the same property
        set as the name path. Used by the Wikidata Korean-name path when only a
        CID (no InChIKey) is available."""
        try:
            property_url = (
                "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/"
                f"{int(cid)}/property/{self.property_names}/JSON"
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
        if api_key := (os.getenv(SEMANTIC_SCHOLAR_API_KEY_ENV) or "").strip():
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


def is_kipris_enabled() -> bool:
    """KIPRIS only runs when its service key is configured.

    Without a key the provider is inactive: it is absent from the default
    patent sources and never produces a diagnostic. A blank/whitespace-only
    value counts as unset.
    """
    return bool((os.getenv(KIPRIS_SERVICE_KEY_ENV) or "").strip())


def is_semantic_scholar_enabled() -> bool:
    """Semantic Scholar is only in the DEFAULT source set when its key is set.

    Unauthenticated S2 calls are aggressively rate-limited (HTTP 429), which
    forces a "partial" status and clutters the UI. So without a key S2 is absent
    from default_sources() and never runs by default. It remains a *valid*
    explicit source value (sources=["semantic_scholar"] still runs it — the
    caller's choice). A blank/whitespace-only value counts as unset.
    """
    return bool((os.getenv(SEMANTIC_SCHOLAR_API_KEY_ENV) or "").strip())


class KiprisProvider:
    """KIPRIS (Korean Intellectual Property Rights Information Service) search.

    Free-text patent + utility-model search against the KIPRIS Plus REST
    ``patUtiModInfoSearchSevice/freeSearchInfo`` endpoint, authenticated with a
    KIPRIS Plus ``accessKey`` (stored in ``KIPRIS_SERVICE_KEY``). The response
    is a KIPRIS XML envelope (``resultCode`` 00 on success, ``PatentUtilityInfo``
    rows under ``body/items``), parsed defensively with ``xml.etree``. The
    provider only runs when ``KIPRIS_SERVICE_KEY`` is set (see
    ``is_kipris_enabled``).
    """

    name = "kipris"
    base_url = (
        "http://plus.kipris.or.kr/openapi/rest/"
        "patUtiModInfoSearchSevice/freeSearchInfo"
    )

    def __init__(self, http: HttpClient):
        self.http = http

    def search_patents(
        self,
        *,
        word: str,
        limit: int,
    ) -> tuple[list[PatentItem], int | None, ProviderDiagnostics]:
        """Search KIPRIS for ``word`` and return ``(patents, total_hits, diag)``.

        ``total_hits`` is the envelope ``TotalSearchCount``. A non-"00" result
        code is treated as an error, with the upstream message logged
        server-side but not surfaced to clients.
        """
        access_key = (os.getenv(KIPRIS_SERVICE_KEY_ENV) or "").strip()
        # Defensive: callers gate on is_kipris_enabled(), but guard anyway so a
        # direct call without a key produces a clean "empty" rather than a
        # confusing upstream auth error.
        if not access_key:
            no_call = HttpDiagnostics(latency_ms=0, cached=False, retry_count=0)
            return [], None, ProviderDiagnostics.from_http(self.name, "empty", no_call)

        url = (
            f"{self.base_url}"
            f"?word={quote(word, safe='')}"
            f"&accessKey={quote(access_key, safe='')}"
            f"&numOfRows={limit}"
            "&pageNo=1"
            "&patent=true"
            "&utility=true"
        )
        try:
            text, http = self.http.get_text(
                url,
                cache_ttl_seconds=KIPRIS_CACHE_TTL,
                retries=1,
            )
        except ProviderHttpError as exc:
            return [], None, _error_diagnostics(self.name, exc)

        try:
            root = ElementTree.fromstring(text)
        except ElementTree.ParseError:
            logger.warning("KIPRIS returned a malformed XML response.")
            return [], None, ProviderDiagnostics.from_http(
                self.name,
                "error",
                http,
                message="KIPRIS 응답을 해석할 수 없습니다.",
            )

        # KIPRIS Plus uses resultCode "00" for success (there is no successYN).
        result_code = self._text(root.find(".//resultCode"))
        if result_code and result_code != "00":
            result_msg = self._text(root.find(".//resultMsg")) or "(메시지 없음)"
            logger.warning(
                "KIPRIS request failed: resultCode=%s resultMsg=%s",
                result_code,
                result_msg,
            )
            return [], None, ProviderDiagnostics.from_http(
                self.name,
                "error",
                http,
                message="KIPRIS 검색에 실패했습니다.",
            )

        items = root.findall(".//PatentUtilityInfo")
        patents = [self._patent(item) for item in items]
        total_hits = self._int(self._text(root.find(".//TotalSearchCount")))
        status = "ok" if patents else "empty"
        return patents, total_hits, ProviderDiagnostics.from_http(self.name, status, http)

    def _patent(self, item: ElementTree.Element) -> PatentItem:
        title = self._text(item.find("InventionName")) or UNTITLED_PATENT
        assignee = self._text(item.find("Applicant"))
        application_number = self._text(item.find("ApplicationNumber"))
        # Prefer a published/registered number for the public-facing link.
        publication_number = (
            self._text(item.find("PublicNumber"))
            or self._text(item.find("OpeningNumber"))
            or self._text(item.find("RegistrationNumber"))
            or application_number
        )
        application_date = self._format_date(self._text(item.find("ApplicationDate")))
        return PatentItem(
            id=application_number or publication_number or UNTITLED_PATENT,
            publication_number=publication_number or "",
            title=title,
            url=self._url(publication_number, application_number, word=title),
            assignee=assignee,
            date=application_date,
            source=self.name,
        )

    @staticmethod
    def _url(
        publication_number: str | None,
        application_number: str | None,
        *,
        word: str,
    ) -> str:
        """Best-effort link for a KIPRIS hit.

        Prefer a Google Patents KR link built from the publication number
        (falling back to the application number); when no usable number exists,
        fall back to a KIPRIS keyword search URL.
        """
        for raw in (publication_number, application_number):
            digits = re.sub(r"\D", "", raw or "")
            if digits:
                return f"https://patents.google.com/patent/KR{digits}"
        return (
            "https://www.kipris.or.kr/khome/search/searchResult.do"
            f"?word={quote(word, safe='')}"
        )

    @staticmethod
    def _format_date(value: str | None) -> str | None:
        """Format an 8-digit ``YYYYMMDD`` string as ``YYYY-MM-DD``.

        Any other shape (empty, partial, non-numeric) returns the cleaned value
        when present, else None, so callers never crash on odd KIPRIS dates."""
        if not value:
            return None
        if len(value) == 8 and value.isdigit():
            return f"{value[0:4]}-{value[4:6]}-{value[6:8]}"
        return value or None

    @staticmethod
    def _text(element: ElementTree.Element | None) -> str | None:
        """Return stripped element text, or None when missing/empty."""
        if element is None or element.text is None:
            return None
        text = element.text.strip()
        return text or None

    @staticmethod
    def _int(value: Any) -> int | None:
        if isinstance(value, bool):
            return None
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.strip().lstrip("-").isdigit():
            return int(value)
        return None
