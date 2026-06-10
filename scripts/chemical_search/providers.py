from __future__ import annotations

import os
from typing import Any
from urllib.parse import quote

from .http_client import HttpClient, ProviderHttpError
from .models import NormalizedCompound, ProviderDiagnostics, ProviderResult, SearchItem


PUBCHEM_CACHE_TTL = 7 * 24 * 60 * 60
CHEMBL_CACHE_TTL = 7 * 24 * 60 * 60
SEMANTIC_SCHOLAR_CACHE_TTL = 3 * 24 * 60 * 60
CROSSREF_CACHE_TTL = 7 * 24 * 60 * 60


def _failed_result(source: str, operation: str, exc: ProviderHttpError) -> ProviderResult:
    return ProviderResult(source, operation, exc.status, [], exc.diagnostics)


class PubChemProvider:
    source = "pubchem"
    property_names = (
        "Title,MolecularFormula,CanonicalSMILES,ConnectivitySMILES,"
        "IsomericSMILES,InChIKey,MolecularWeight"
    )

    def __init__(self, http: HttpClient):
        self.http = http

    def resolve_candidates(self, query: str, input_type: str, limit: int) -> ProviderResult:
        operation = f"resolve_{input_type}"
        try:
            if input_type == "formula":
                cid_url = (
                    "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/fastformula/"
                    f"{quote(query)}/cids/JSON"
                )
                cid_data, cid_diagnostics = self.http.get_json(
                    cid_url,
                    cache_ttl_seconds=PUBCHEM_CACHE_TTL,
                    retries=2,
                )
                cids = cid_data.get("IdentifierList", {}).get("CID", [])[:limit]
                if not cids:
                    return ProviderResult(self.source, operation, "partial", [], cid_diagnostics)
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

            data, diagnostics = self.http.get_json(
                property_url,
                cache_ttl_seconds=PUBCHEM_CACHE_TTL,
                retries=2,
            )
            rows = data.get("PropertyTable", {}).get("Properties", [])[:limit]
            items = [self._candidate(row, input_type) for row in rows]
            status = "ok" if items else "partial"
            return ProviderResult(self.source, operation, status, items, diagnostics)
        except ProviderHttpError as exc:
            return _failed_result(self.source, operation, exc)

    def _candidate(self, row: dict[str, Any], input_type: str) -> SearchItem:
        cid = str(row.get("CID", "unknown"))
        smiles = (
            row.get("CanonicalSMILES")
            or row.get("ConnectivitySMILES")
            or row.get("IsomericSMILES")
            or ""
        )
        title = row.get("Title") or row.get("InChIKey") or f"PubChem CID {cid}"
        return SearchItem(
            id=f"pubchem:{cid}",
            source=self.source,
            kind="compound",
            title=str(title),
            source_url=f"https://pubchem.ncbi.nlm.nih.gov/compound/{cid}",
            match_reason=f"PubChem {input_type} lookup candidate.",
            data={
                "cid": cid,
                "canonical_smiles": smiles,
                "inchi_key": row.get("InChIKey"),
                "formula": row.get("MolecularFormula"),
                "molecular_weight": row.get("MolecularWeight"),
            },
        )


class ChemblProvider:
    source = "chembl"

    def __init__(self, http: HttpClient):
        self.http = http

    def search(
        self,
        compound: NormalizedCompound,
        operation: str,
        *,
        threshold: int,
        limit: int,
    ) -> ProviderResult:
        encoded_smiles = quote(compound.canonical_smiles, safe="")
        if operation == "exact":
            url = (
                "https://www.ebi.ac.uk/chembl/api/data/molecule.json?"
                f"molecule_structures__standard_inchi_key={quote(compound.inchi_key)}&limit={limit}"
            )
        elif operation == "similarity":
            url = (
                f"https://www.ebi.ac.uk/chembl/api/data/similarity/{encoded_smiles}/"
                f"{threshold}.json?limit={limit}"
            )
        elif operation == "substructure":
            url = (
                f"https://www.ebi.ac.uk/chembl/api/data/substructure/{encoded_smiles}.json"
                f"?limit={limit}"
            )
        else:
            raise ValueError(f"Unsupported ChEMBL operation: {operation}")

        try:
            data, diagnostics = self.http.get_json(
                url,
                cache_ttl_seconds=CHEMBL_CACHE_TTL,
                retries=2,
            )
            rows = data.get("molecules", [])
            items = [self._item(row, operation, threshold) for row in rows]
            return ProviderResult(
                self.source,
                operation,
                "ok" if items else "partial",
                items,
                diagnostics,
            )
        except ProviderHttpError as exc:
            return _failed_result(self.source, operation, exc)

    def _item(self, row: dict[str, Any], operation: str, threshold: int) -> SearchItem:
        chembl_id = row.get("molecule_chembl_id", "unknown")
        similarity = row.get("similarity")
        if operation == "similarity":
            reason = f"ChEMBL fingerprint similarity at or above {threshold}%."
        elif operation == "substructure":
            reason = "Input structure is a substructure of the ChEMBL molecule."
        else:
            reason = "Exact standard InChIKey match in ChEMBL."
        return SearchItem(
            id=f"chembl:{chembl_id}",
            source=self.source,
            kind="compound",
            title=row.get("pref_name") or str(chembl_id),
            source_url=f"https://www.ebi.ac.uk/chembl/explore/compound/{chembl_id}",
            match_reason=reason,
            score=float(similarity) if similarity is not None else None,
            data={
                "chembl_id": chembl_id,
                "similarity": similarity,
                "molecule_type": row.get("molecule_type"),
                "structures": row.get("molecule_structures"),
            },
        )


class SemanticScholarProvider:
    source = "semantic_scholar"

    def __init__(self, http: HttpClient):
        self.http = http

    def search(self, query: str, limit: int) -> ProviderResult:
        operation = "paper_search"
        fields = "title,year,authors,citationCount,url,externalIds"
        url = (
            "https://api.semanticscholar.org/graph/v1/paper/search?"
            f"query={quote(query)}&limit={limit}&fields={fields}"
        )
        headers = {}
        if api_key := os.getenv("SEMANTIC_SCHOLAR_API_KEY"):
            headers["x-api-key"] = api_key
        try:
            data, diagnostics = self.http.get_json(
                url,
                headers=headers,
                cache_ttl_seconds=SEMANTIC_SCHOLAR_CACHE_TTL,
                retries=1,
            )
            items = [self._item(row, query) for row in data.get("data", [])]
            return ProviderResult(
                self.source,
                operation,
                "ok" if items else "partial",
                items,
                diagnostics,
            )
        except ProviderHttpError as exc:
            return _failed_result(self.source, operation, exc)

    def _item(self, row: dict[str, Any], query: str) -> SearchItem:
        paper_id = row.get("paperId", "unknown")
        return SearchItem(
            id=f"semantic_scholar:{paper_id}",
            source=self.source,
            kind="paper",
            title=row.get("title") or "Untitled paper",
            source_url=row.get("url") or f"https://www.semanticscholar.org/paper/{paper_id}",
            match_reason=f"Semantic Scholar bibliographic search for '{query}'.",
            data={
                "year": row.get("year"),
                "authors": [author.get("name") for author in row.get("authors", [])],
                "citation_count": row.get("citationCount"),
                "external_ids": row.get("externalIds"),
            },
        )


class CrossrefProvider:
    source = "crossref"

    def __init__(self, http: HttpClient):
        self.http = http

    def search(self, query: str, limit: int) -> ProviderResult:
        operation = "paper_search"
        url = f"https://api.crossref.org/works?query.bibliographic={quote(query)}&rows={limit}"
        if mailto := os.getenv("CROSSREF_MAILTO"):
            url += f"&mailto={quote(mailto)}"
        try:
            data, diagnostics = self.http.get_json(
                url,
                cache_ttl_seconds=CROSSREF_CACHE_TTL,
                retries=1,
            )
            items = [self._item(row, query) for row in data.get("message", {}).get("items", [])]
            return ProviderResult(
                self.source,
                operation,
                "ok" if items else "partial",
                items,
                diagnostics,
            )
        except ProviderHttpError as exc:
            return _failed_result(self.source, operation, exc)

    def _item(self, row: dict[str, Any], query: str) -> SearchItem:
        doi = row.get("DOI")
        title_rows = row.get("title") or ["Untitled work"]
        url = row.get("URL") or (f"https://doi.org/{doi}" if doi else "https://www.crossref.org/")
        return SearchItem(
            id=f"crossref:{doi or url}",
            source=self.source,
            kind="paper",
            title=title_rows[0],
            source_url=url,
            match_reason=f"Crossref bibliographic search for '{query}'.",
            data={
                "doi": doi,
                "published": row.get("published"),
                "author": row.get("author"),
                "container_title": row.get("container-title"),
            },
        )
