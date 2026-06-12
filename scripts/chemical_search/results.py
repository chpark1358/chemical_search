"""Merge, dedup, score, and sort papers from multiple providers."""

from __future__ import annotations

import math
import re
from copy import deepcopy
from typing import Iterable

from .models import UNTITLED_PAPER, PaperItem, PatentItem


VALID_SORTS = ("relevance", "citations", "year")

# Duplicate-merge preference: the most metadata-rich provider record wins.
SOURCE_PREFERENCE = ("semantic_scholar", "openalex", "crossref")

# Non-alphanumeric characters stripped from a publication number before
# comparing it across patent sources (see ``_normalize_publication_number``).
_PATENT_KEY_STRIP_RE = re.compile(r"[^A-Za-z0-9]")


def merge_papers(
    paper_lists: Iterable[list[PaperItem]],
    *,
    sort: str = "relevance",
) -> list[PaperItem]:
    """Merge per-provider rank-ordered paper lists into a deduplicated list.

    Duplicates are detected by lowercased DOI when both papers carry one,
    otherwise by normalized title (casefold, alphanumeric characters only);
    papers carrying the untitled placeholder never match by title.
    On duplicates the preferred-source record wins (semantic_scholar >
    openalex > crossref), with missing citations, abstract, venue, DOI, URL,
    and year merged in from the other record.
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


def dedup_patents(patents: list[PatentItem]) -> list[PatentItem]:
    """Drop patents sharing a publication number, preserving first-seen order.

    Patents are merged across sources (Google Patents, KIPRIS, SureChEMBL), so
    first-seen-wins determines which source represents a shared document; the
    caller orders the input list to control that preference. Patents without a
    publication number are always kept.

    Sources format the same publication number differently — Google Patents
    keeps the raw value (e.g. "CN-102369480-A") while SureChEMBL strips hyphens
    ("CN102369480A"). We therefore compare by a NORMALIZED key (alphanumeric
    characters only, upper-cased) so those variants dedupe across sources, while
    each surviving record keeps its source's original ``publication_number`` for
    display.
    """
    seen: set[str] = set()
    unique: list[PatentItem] = []
    for patent in patents:
        key = _normalize_publication_number(patent.publication_number)
        if key and key in seen:
            continue
        if key:
            seen.add(key)
        unique.append(patent)
    return unique


def _normalize_publication_number(publication_number: str) -> str:
    """Normalize a publication number for cross-source duplicate detection.

    Strips every non-alphanumeric character (hyphens, spaces) and upper-cases
    the result so "CN-102369480-A" and "cn102369480a" map to the same key.
    """
    return _PATENT_KEY_STRIP_RE.sub("", publication_number).upper()


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


def _source_rank(source: str) -> int:
    try:
        return SOURCE_PREFERENCE.index(source)
    except ValueError:
        return len(SOURCE_PREFERENCE)


def _merge_pair(existing: PaperItem, incoming: PaperItem) -> PaperItem:
    if _source_rank(incoming.source) < _source_rank(existing.source):
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
