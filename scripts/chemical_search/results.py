from __future__ import annotations

import re
from copy import deepcopy

from .models import NormalizedCompound, ProviderResult, SearchItem


def merge_and_rank(
    provider_results: list[ProviderResult],
    selected_compound: NormalizedCompound,
) -> list[SearchItem]:
    merged: dict[str, SearchItem] = {}
    for result in provider_results:
        for item in result.items:
            key = _dedupe_key(item)
            evidence = {
                "source": item.source,
                "operation": result.operation,
                "source_url": item.source_url,
                "match_reason": item.match_reason,
                "provider_score": item.score,
            }
            score = _rank_score(item, result.operation, selected_compound)
            if key not in merged:
                merged_item = deepcopy(item)
                merged_item.score = score
                merged_item.data["sources"] = [item.source]
                merged_item.data["evidence"] = [evidence]
                merged[key] = merged_item
                continue

            existing = merged[key]
            existing.score = max(existing.score or 0, score) + _additional_source_bonus(existing, item)
            if item.source not in existing.data["sources"]:
                existing.data["sources"].append(item.source)
            existing.data["evidence"].append(evidence)
            if existing.title.startswith(("CHEMBL", "PubChem CID")) and not item.title.startswith(
                ("CHEMBL", "PubChem CID")
            ):
                existing.title = item.title

    return sorted(
        merged.values(),
        key=lambda item: (-(item.score or 0), item.kind, item.title.lower(), item.id),
    )


def _dedupe_key(item: SearchItem) -> str:
    if item.kind == "compound":
        inchi_key = item.data.get("inchi_key") or (item.data.get("structures") or {}).get(
            "standard_inchi_key"
        )
        if inchi_key:
            return f"compound:inchi_key:{str(inchi_key).upper()}"
        smiles = item.data.get("canonical_smiles") or (item.data.get("structures") or {}).get(
            "canonical_smiles"
        )
        if smiles:
            return f"compound:smiles:{smiles}"
    if item.kind == "paper":
        doi = item.data.get("doi") or (item.data.get("external_ids") or {}).get("DOI")
        if doi:
            return f"paper:doi:{str(doi).lower().removeprefix('https://doi.org/')}"
        title = re.sub(r"\W+", " ", item.title.lower()).strip()
        return f"paper:title:{title}"
    return f"{item.kind}:id:{item.id}"


def _rank_score(item: SearchItem, operation: str, selected_compound: NormalizedCompound) -> float:
    score = 0.0
    if item.kind == "compound":
        inchi_key = item.data.get("inchi_key") or (item.data.get("structures") or {}).get(
            "standard_inchi_key"
        )
        if inchi_key == selected_compound.inchi_key:
            score += 50
        elif inchi_key and str(inchi_key).split("-")[0] == selected_compound.inchi_key.split("-")[0]:
            score += 35
        elif operation == "substructure":
            score += 25
        elif operation == "similarity":
            similarity = float(item.data.get("similarity") or item.score or 0)
            score += 30 if similarity >= 90 else 20 if similarity >= 80 else 10
        elif operation == "resolve_formula":
            score += 5
        elif operation.startswith("resolve_"):
            score += 20
    elif item.kind == "paper":
        score += 10
        citation_count = item.data.get("citation_count")
        if isinstance(citation_count, int):
            score += min(10, citation_count / 100)
    score += {"pubchem": 5, "chembl": 5, "semantic_scholar": 4, "crossref": 3}.get(
        item.source, 0
    )
    return round(score, 3)


def _additional_source_bonus(existing: SearchItem, item: SearchItem) -> float:
    return 5.0 if item.source not in existing.data["sources"] else 0.0
