"""Merge, dedup, score, and sort papers from multiple providers."""

from __future__ import annotations

import math
from copy import deepcopy
from typing import Iterable

from .models import UNTITLED_PAPER, PaperItem


VALID_SORTS = ("relevance", "citations", "year")


def merge_papers(
    paper_lists: Iterable[list[PaperItem]],
    *,
    sort: str = "relevance",
) -> list[PaperItem]:
    """Merge per-provider rank-ordered paper lists into a deduplicated list.

    Duplicates are detected by lowercased DOI when both papers carry one,
    otherwise by normalized title (casefold, alphanumeric characters only);
    papers carrying the untitled placeholder never match by title.
    On duplicates the Semantic Scholar record wins, with missing citations,
    abstract, venue, DOI, URL, and year merged in from the other record.
    """
    if sort not in VALID_SORTS:
        raise ValueError(f"Unsupported sort '{sort}'. Expected one of {VALID_SORTS}.")

    merged: list[PaperItem] = []
    best_ranks: list[int] = []
    for papers in paper_lists:
        for rank, paper in enumerate(papers):
            index = _find_duplicate(merged, paper)
            if index is None:
                merged.append(deepcopy(paper))
                best_ranks.append(rank)
                continue
            merged[index] = _merge_pair(merged[index], paper)
            best_ranks[index] = min(best_ranks[index], rank)

    for paper, rank in zip(merged, best_ranks):
        paper.score = _score(rank, paper.citations)

    return _sorted(merged, sort)


def _find_duplicate(merged: list[PaperItem], paper: PaperItem) -> int | None:
    for index, existing in enumerate(merged):
        if _is_duplicate(existing, paper):
            return index
    return None


def _is_duplicate(left: PaperItem, right: PaperItem) -> bool:
    if left.doi and right.doi:
        return left.doi.lower() == right.doi.lower()
    left_title = _normalized_title(left.title)
    right_title = _normalized_title(right.title)
    return bool(left_title) and left_title == right_title


def _normalized_title(title: str) -> str:
    if title == UNTITLED_PAPER:
        # The provider placeholder carries no identity; returning "" keeps
        # untitled papers without a DOI from merging into one record.
        return ""
    return "".join(char for char in title.casefold() if char.isalnum())


def _merge_pair(existing: PaperItem, incoming: PaperItem) -> PaperItem:
    if incoming.source == "semantic_scholar" and existing.source != "semantic_scholar":
        preferred, other = deepcopy(incoming), existing
    else:
        preferred, other = existing, incoming
    if preferred.citations is None:
        preferred.citations = other.citations
    if not preferred.abstract:
        preferred.abstract = other.abstract
    if not preferred.venue:
        preferred.venue = other.venue
    if preferred.doi is None:
        preferred.doi = other.doi
    if preferred.url is None:
        preferred.url = other.url
    if preferred.year is None:
        preferred.year = other.year
    return preferred


def _score(rank: int, citations: int | None) -> float:
    base = 1.0 / (1.0 + rank)
    boost = 0.1 * math.log10((citations or 0) + 1)
    return round(base + boost, 4)


def _sorted(papers: list[PaperItem], sort: str) -> list[PaperItem]:
    if sort == "citations":
        return sorted(
            papers,
            key=lambda paper: (
                paper.citations is None,
                -(paper.citations or 0),
                -paper.score,
                paper.title.casefold(),
            ),
        )
    if sort == "year":
        return sorted(
            papers,
            key=lambda paper: (
                paper.year is None,
                -(paper.year or 0),
                -paper.score,
                paper.title.casefold(),
            ),
        )
    return sorted(papers, key=lambda paper: (-paper.score, paper.title.casefold(), paper.id))
