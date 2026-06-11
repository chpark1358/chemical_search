# FROZEN HISTORICAL SPIKE — kept as-is for reference only. This script is NOT
# maintained and is NOT part of the papers-only pipeline; do not refactor it
# alongside scripts/chemical_search/{api,pipeline,providers}.py.
"""Phase 0 API spike for the chemical patent/literature search project.

This script validates the practical availability of the planned providers and
writes both machine-readable JSON and a Markdown report. It is intentionally
small and dependency-light so failures are easy to diagnose.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests


DEFAULT_COMPOUND = {
    "name": "aspirin",
    "formula": "C9H8O4",
    "smiles": "CC(=O)Oc1ccccc1C(=O)O",
    "inchi_key": "BSYNRYMUTXBXSQ-UHFFFAOYSA-N",
}


@dataclass
class CheckResult:
    name: str
    status: str
    latency_ms: int = 0
    summary: str = ""
    error: str | None = None
    data: dict[str, Any] = field(default_factory=dict)


class Timer:
    def __enter__(self) -> "Timer":
        self.start = time.perf_counter()
        return self

    def __exit__(self, *args: object) -> None:
        self.latency_ms = self.elapsed_ms()

    def elapsed_ms(self) -> int:
        return int((time.perf_counter() - self.start) * 1000)


def get_json(url: str, *, timeout: int = 20, headers: dict[str, str] | None = None) -> tuple[dict[str, Any], int]:
    with Timer() as timer:
        response = requests.get(url, timeout=timeout, headers=headers or {})
        response.raise_for_status()
        data = response.json()
    return data, timer.latency_ms


def check_rdkit(smiles: str) -> CheckResult:
    with Timer() as timer:
        try:
            from rdkit import Chem
            from rdkit.Chem import Descriptors, rdMolDescriptors
        except Exception as exc:  # pragma: no cover - environment check
            return CheckResult(
                name="rdkit_normalize",
                status="skipped",
                latency_ms=timer.elapsed_ms(),
                summary="RDKit is not installed in the active Python environment.",
                error=repr(exc),
            )

        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            result = CheckResult(
                name="rdkit_normalize",
                status="error",
                summary="RDKit could not parse the input SMILES.",
            )
            result.latency_ms = timer.elapsed_ms()
            return result

        canonical = Chem.MolToSmiles(mol, canonical=True)
        formula = rdMolDescriptors.CalcMolFormula(mol)
        mw = Descriptors.MolWt(mol)
        inchi_key = None
        try:
            inchi_key = Chem.MolToInchiKey(mol)
        except Exception as exc:  # InChI support may be unavailable in some builds.
            result = CheckResult(
                name="rdkit_normalize",
                status="partial",
                summary="RDKit parsed the molecule, but InChIKey generation failed.",
                error=repr(exc),
                data={"canonical_smiles": canonical, "formula": formula, "molecular_weight": mw},
            )
            result.latency_ms = timer.elapsed_ms()
            return result

        result = CheckResult(
            name="rdkit_normalize",
            status="ok",
            summary="RDKit parsed and normalized the molecule.",
            data={
                "canonical_smiles": canonical,
                "formula": formula,
                "molecular_weight": round(mw, 4),
                "inchi_key": inchi_key,
            },
        )
    result.latency_ms = timer.latency_ms
    return result


def check_pubchem_name(name: str) -> CheckResult:
    props = "MolecularFormula,CanonicalSMILES,InChIKey,MolecularWeight"
    url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{quote(name)}/property/{props}/JSON"
    try:
        data, latency = get_json(url)
        rows = data.get("PropertyTable", {}).get("Properties", [])
        return CheckResult(
            name="pubchem_name_lookup",
            status="ok" if rows else "error",
            latency_ms=latency,
            summary=f"Returned {len(rows)} PubChem property rows for name '{name}'.",
            data={"count": len(rows), "first": rows[0] if rows else None},
        )
    except Exception as exc:
        return CheckResult("pubchem_name_lookup", "error", summary="PubChem name lookup failed.", error=repr(exc))


def check_pubchem_formula(formula: str) -> CheckResult:
    url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/fastformula/{quote(formula)}/cids/JSON"
    try:
        data, latency = get_json(url)
        cids = data.get("IdentifierList", {}).get("CID", [])
        return CheckResult(
            name="pubchem_formula_lookup",
            status="ok" if cids else "error",
            latency_ms=latency,
            summary=f"Returned {len(cids)} PubChem CID candidates for formula '{formula}'.",
            data={"count": len(cids), "first_cids": cids[:10]},
        )
    except Exception as exc:
        return CheckResult("pubchem_formula_lookup", "error", summary="PubChem formula lookup failed.", error=repr(exc))


def check_chembl_similarity(smiles: str, threshold: int = 80) -> CheckResult:
    encoded = quote(smiles, safe="")
    url = f"https://www.ebi.ac.uk/chembl/api/data/similarity/{encoded}/{threshold}.json?limit=5"
    try:
        data, latency = get_json(url)
        rows = data.get("molecules", [])
        return CheckResult(
            name="chembl_similarity",
            status="ok" if rows else "partial",
            latency_ms=latency,
            summary=f"Returned {len(rows)} ChEMBL similarity rows at threshold {threshold}.",
            data={"count": len(rows), "first_ids": [r.get("molecule_chembl_id") for r in rows[:5]]},
        )
    except Exception as exc:
        return CheckResult("chembl_similarity", "error", summary="ChEMBL similarity query failed.", error=repr(exc))


def check_chembl_substructure(smiles: str) -> CheckResult:
    encoded = quote(smiles, safe="")
    url = f"https://www.ebi.ac.uk/chembl/api/data/substructure/{encoded}.json?limit=5"
    try:
        data, latency = get_json(url)
        rows = data.get("molecules", [])
        return CheckResult(
            name="chembl_substructure",
            status="ok" if rows else "partial",
            latency_ms=latency,
            summary=f"Returned {len(rows)} ChEMBL substructure rows.",
            data={"count": len(rows), "first_ids": [r.get("molecule_chembl_id") for r in rows[:5]]},
        )
    except Exception as exc:
        return CheckResult("chembl_substructure", "error", summary="ChEMBL substructure query failed.", error=repr(exc))


def fetch_semantic_scholar(query: str, headers: dict[str, str]) -> tuple[dict[str, Any], int, int]:
    fields = "title,year,authors,citationCount,url,externalIds"
    url = f"https://api.semanticscholar.org/graph/v1/paper/search?query={quote(query)}&limit=5&fields={fields}"
    with Timer() as timer:
        response = requests.get(url, timeout=20, headers=headers)
        if response.status_code == 429:
            return {"data": []}, timer.elapsed_ms(), 429
        response.raise_for_status()
        return response.json(), timer.elapsed_ms(), response.status_code


def check_semantic_scholar(query: str, fallback_query: str | None = None) -> CheckResult:
    headers: dict[str, str] = {}
    api_key = os.getenv("SEMANTIC_SCHOLAR_API_KEY")
    if api_key:
        headers["x-api-key"] = api_key
    try:
        data, latency, status_code = fetch_semantic_scholar(query, headers)
        used_query = query
        if status_code == 429:
            return CheckResult(
                name="semantic_scholar_search",
                status="partial",
                latency_ms=latency,
                summary="Semantic Scholar returned HTTP 429. Configure SEMANTIC_SCHOLAR_API_KEY or retry later.",
                data={"used_api_key": bool(api_key), "status_code": 429},
            )
        rows = data.get("data", [])
        if not rows and fallback_query:
            fallback_data, fallback_latency, fallback_status = fetch_semantic_scholar(fallback_query, headers)
            latency += fallback_latency
            if fallback_status != 429:
                rows = fallback_data.get("data", [])
                used_query = fallback_query
        return CheckResult(
            name="semantic_scholar_search",
            status="ok" if rows else "partial",
            latency_ms=latency,
            summary=f"Returned {len(rows)} Semantic Scholar paper candidates.",
            data={
                "count": len(rows),
                "first_titles": [r.get("title") for r in rows[:3]],
                "used_api_key": bool(api_key),
                "used_query": used_query,
            },
        )
    except Exception as exc:
        return CheckResult("semantic_scholar_search", "error", summary="Semantic Scholar query failed.", error=repr(exc))


def check_crossref(query: str) -> CheckResult:
    url = f"https://api.crossref.org/works?query.bibliographic={quote(query)}&rows=5"
    try:
        data, latency = get_json(url)
        rows = data.get("message", {}).get("items", [])
        return CheckResult(
            name="crossref_search",
            status="ok" if rows else "partial",
            latency_ms=latency,
            summary=f"Returned {len(rows)} Crossref work candidates.",
            data={"count": len(rows), "first_titles": [r.get("title", [None])[0] for r in rows[:3]]},
        )
    except Exception as exc:
        return CheckResult("crossref_search", "error", summary="Crossref query failed.", error=repr(exc))


def check_surechembl_discovery() -> CheckResult:
    url = "https://www.api.surechembl.org/"
    try:
        with Timer() as timer:
            response = requests.get(url, timeout=20)
        return CheckResult(
            name="surechembl_discovery",
            status="ok" if response.ok else "partial",
            latency_ms=timer.latency_ms,
            summary=f"SureChEMBL API root returned HTTP {response.status_code}.",
            data={"status_code": response.status_code, "content_type": response.headers.get("content-type")},
        )
    except Exception as exc:
        return CheckResult("surechembl_discovery", "error", summary="SureChEMBL root discovery failed.", error=repr(exc))


def check_epo_ops_credentials() -> CheckResult:
    key = os.getenv("EPO_OPS_CONSUMER_KEY")
    secret = os.getenv("EPO_OPS_CONSUMER_SECRET")
    if not key or not secret:
        return CheckResult(
            name="epo_ops_credentials",
            status="skipped",
            summary="EPO OPS credentials are not configured. Set EPO_OPS_CONSUMER_KEY and EPO_OPS_CONSUMER_SECRET.",
        )
    return CheckResult(
        name="epo_ops_credentials",
        status="partial",
        summary="EPO OPS credentials are present, but token/publication lookup is not implemented in this first spike.",
        data={"has_key": True, "has_secret": True},
    )


def render_markdown(results: list[CheckResult], started_at: str) -> str:
    ok = sum(1 for r in results if r.status == "ok")
    partial = sum(1 for r in results if r.status == "partial")
    skipped = sum(1 for r in results if r.status == "skipped")
    error = sum(1 for r in results if r.status == "error")
    lines = [
        "# Phase 0 API Spike 결과",
        "",
        f"실행 시각: {started_at}",
        "",
        "## 요약",
        "",
        f"- ok: {ok}",
        f"- partial: {partial}",
        f"- skipped: {skipped}",
        f"- error: {error}",
        "",
        "## 상세 결과",
        "",
        "| Check | Status | Latency | Summary |",
        "|---|---|---:|---|",
    ]
    for result in results:
        lines.append(f"| {result.name} | {result.status} | {result.latency_ms} ms | {result.summary} |")
    lines.extend(["", "## 오류/주의", ""])
    for result in results:
        if result.error:
            lines.append(f"- `{result.name}`: `{result.error}`")
    if not any(result.error for result in results):
        lines.append("- 없음")
    lines.extend(["", "## 다음 판단", ""])
    lines.append("- `rdkit_normalize`가 skipped이면 RDKit 설치 방식을 먼저 결정해야 한다.")
    lines.append("- `surechembl_discovery`는 root 확인만 하므로 실제 compound-patent endpoint 검증이 추가로 필요하다.")
    lines.append("- `epo_ops_credentials`가 skipped이면 EPO OPS 등록/키 발급이 필요하다.")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Phase 0 API spike checks.")
    parser.add_argument("--out", default="output/chemical-search", help="Output directory for reports.")
    parser.add_argument("--strict", action="store_true", help="Exit non-zero when any provider check reports error.")
    args = parser.parse_args()

    started_at = datetime.now(timezone.utc).isoformat()
    compound = DEFAULT_COMPOUND
    checks = [
        check_rdkit(compound["smiles"]),
        check_pubchem_name(compound["name"]),
        check_pubchem_formula(compound["formula"]),
        check_chembl_similarity(compound["smiles"]),
        check_chembl_substructure(compound["smiles"]),
        check_semantic_scholar(f"{compound['name']} {compound['inchi_key']}", fallback_query=compound["name"]),
        check_crossref(compound["name"]),
        check_surechembl_discovery(),
        check_epo_ops_credentials(),
    ]

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "started_at": started_at,
        "compound": compound,
        "results": [asdict(result) for result in checks],
    }
    (out_dir / "phase0_api_spike.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    (out_dir / "phase0_api_spike.md").write_text(render_markdown(checks, started_at), encoding="utf-8")

    print(render_markdown(checks, started_at))
    return 1 if args.strict and any(result.status == "error" for result in checks) else 0


if __name__ == "__main__":
    raise SystemExit(main())
