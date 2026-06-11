from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from chemical_search.models import UNTITLED_PAPER, PaperItem, PatentItem
from chemical_search.results import dedup_patents, merge_papers


def paper(
    source: str,
    *,
    suffix: str = "1",
    title: str = "Aspirin paper",
    doi: str | None = None,
    url: str | None = None,
    citations: int | None = None,
    year: int | None = None,
    venue: str | None = None,
    abstract: str | None = None,
) -> PaperItem:
    return PaperItem(
        id=f"{source}:{suffix}",
        title=title,
        authors=[],
        venue=venue,
        year=year,
        doi=doi,
        url=url,
        citations=citations,
        abstract=abstract,
        source=source,
    )


class MergeTests(unittest.TestCase):
    def test_duplicates_by_doi_are_case_insensitive(self):
        merged = merge_papers(
            [
                [paper("crossref", doi="10.1000/ABC", title="Title A")],
                [paper("semantic_scholar", doi="10.1000/abc", title="Totally different")],
            ]
        )

        self.assertEqual(len(merged), 1)

    def test_semantic_scholar_record_is_preferred_and_enriched(self):
        crossref = paper(
            "crossref",
            doi="10.1/x",
            title="Crossref title",
            citations=99,
            venue="J. Chem",
            abstract="Crossref abstract",
        )
        semantic = paper(
            "semantic_scholar",
            doi="10.1/X",
            title="Semantic title",
            citations=None,
            venue=None,
            abstract=None,
        )

        merged = merge_papers([[crossref], [semantic]])

        self.assertEqual(len(merged), 1)
        result = merged[0]
        self.assertEqual(result.source, "semantic_scholar")
        self.assertEqual(result.title, "Semantic title")
        self.assertEqual(result.citations, 99)
        self.assertEqual(result.venue, "J. Chem")
        self.assertEqual(result.abstract, "Crossref abstract")

    def test_openalex_record_is_preferred_over_crossref_and_enriched(self):
        crossref = paper(
            "crossref",
            doi="10.2/y",
            title="Crossref title",
            citations=55,
            venue="J. Org. Chem",
            abstract="Crossref abstract",
        )
        openalex = paper(
            "openalex",
            doi="10.2/Y",
            title="OpenAlex title",
            citations=None,
            venue=None,
            abstract=None,
        )

        merged = merge_papers([[crossref], [openalex]])

        self.assertEqual(len(merged), 1)
        result = merged[0]
        self.assertEqual(result.source, "openalex")
        self.assertEqual(result.title, "OpenAlex title")
        self.assertEqual(result.citations, 55)
        self.assertEqual(result.venue, "J. Org. Chem")
        self.assertEqual(result.abstract, "Crossref abstract")

    def test_openalex_record_loses_to_semantic_scholar(self):
        openalex = paper(
            "openalex",
            doi="10.3/z",
            title="OpenAlex title",
            citations=None,
            abstract="OpenAlex abstract",
        )
        semantic = paper(
            "semantic_scholar",
            doi="10.3/Z",
            title="Semantic title",
            citations=12,
            abstract=None,
        )

        merged = merge_papers([[openalex], [semantic]])

        self.assertEqual(len(merged), 1)
        result = merged[0]
        self.assertEqual(result.source, "semantic_scholar")
        self.assertEqual(result.title, "Semantic title")
        self.assertEqual(result.citations, 12)
        self.assertEqual(result.abstract, "OpenAlex abstract")

    def test_three_source_duplicate_keeps_semantic_scholar(self):
        doi = "10.4/w"
        merged = merge_papers(
            [
                [paper("crossref", doi=doi, title="Crossref title", venue="J. Chem")],
                [paper("openalex", doi=doi, title="OpenAlex title", abstract="Recovered abstract")],
                [paper("semantic_scholar", doi=doi, title="Semantic title")],
            ]
        )

        self.assertEqual(len(merged), 1)
        result = merged[0]
        self.assertEqual(result.source, "semantic_scholar")
        self.assertEqual(result.venue, "J. Chem")
        self.assertEqual(result.abstract, "Recovered abstract")

    def test_different_dois_with_same_title_are_not_merged(self):
        merged = merge_papers(
            [
                [paper("semantic_scholar", doi="10.1/a", title="Same Title")],
                [paper("crossref", doi="10.1/b", title="Same Title")],
            ]
        )

        self.assertEqual(len(merged), 2)

    def test_missing_doi_falls_back_to_normalized_title(self):
        merged = merge_papers(
            [
                [paper("semantic_scholar", doi=None, title="Aspirin: A Review!")],
                [paper("crossref", doi="10.1/a", title="aspirin a review")],
            ]
        )

        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0].source, "semantic_scholar")

    def test_untitled_papers_without_doi_are_not_merged(self):
        merged = merge_papers(
            [
                [paper("semantic_scholar", suffix="1", title=UNTITLED_PAPER)],
                [paper("crossref", suffix="2", title=UNTITLED_PAPER)],
            ]
        )

        self.assertEqual(len(merged), 2)

    def test_merge_backfills_doi_url_and_year(self):
        semantic = paper(
            "semantic_scholar",
            title="Shared Title",
            doi=None,
            url=None,
            year=None,
        )
        crossref = paper(
            "crossref",
            title="Shared: Title!",
            doi="10.1/back",
            url="https://doi.org/10.1/back",
            year=2021,
        )

        merged = merge_papers([[semantic], [crossref]])

        self.assertEqual(len(merged), 1)
        result = merged[0]
        self.assertEqual(result.source, "semantic_scholar")
        self.assertEqual(result.doi, "10.1/back")
        self.assertEqual(result.url, "https://doi.org/10.1/back")
        self.assertEqual(result.year, 2021)

    def test_score_combines_rank_base_and_citation_boost(self):
        merged = merge_papers(
            [[paper("semantic_scholar", citations=999, title="Cited")]],
        )

        expected = 1.0 + 0.1 * math.log10(1000)
        self.assertAlmostEqual(merged[0].score, expected, places=3)

    def test_relevance_sort_ranks_first_results_higher(self):
        merged = merge_papers(
            [
                [
                    paper("semantic_scholar", suffix="1", title="First"),
                    paper("semantic_scholar", suffix="2", title="Second"),
                ]
            ],
            sort="relevance",
        )

        self.assertEqual([item.title for item in merged], ["First", "Second"])

    def test_citations_sort_places_none_last(self):
        merged = merge_papers(
            [
                [
                    paper("semantic_scholar", suffix="1", title="No citations", citations=None),
                    paper("semantic_scholar", suffix="2", title="Few", citations=3),
                    paper("semantic_scholar", suffix="3", title="Many", citations=500),
                ]
            ],
            sort="citations",
        )

        self.assertEqual([item.title for item in merged], ["Many", "Few", "No citations"])

    def test_year_sort_is_descending_with_none_last(self):
        merged = merge_papers(
            [
                [
                    paper("semantic_scholar", suffix="1", title="Old", year=1999),
                    paper("semantic_scholar", suffix="2", title="New", year=2024),
                    paper("semantic_scholar", suffix="3", title="Unknown", year=None),
                ]
            ],
            sort="year",
        )

        self.assertEqual([item.title for item in merged], ["New", "Old", "Unknown"])

    def test_unknown_sort_raises(self):
        with self.assertRaises(ValueError):
            merge_papers([[paper("semantic_scholar")]], sort="alphabetical")


def patent(publication_number: str, title: str = "Patent") -> PatentItem:
    return PatentItem(
        id=publication_number,
        publication_number=publication_number,
        title=title,
        url=f"https://patents.google.com/patent/{publication_number}/en",
        source="surechembl",
    )


class DedupPatentsTests(unittest.TestCase):
    def test_duplicate_publication_numbers_are_dropped_first_seen_kept(self):
        unique = dedup_patents(
            [
                patent("CN102369480A", title="First"),
                patent("CN102369480A", title="Duplicate"),
                patent("US1234567B2", title="Second"),
            ]
        )

        self.assertEqual([item.title for item in unique], ["First", "Second"])

    def test_patents_without_publication_number_are_all_kept(self):
        unique = dedup_patents(
            [
                patent("", title="No number A"),
                patent("", title="No number B"),
            ]
        )

        self.assertEqual(len(unique), 2)

    def test_empty_list_returns_empty(self):
        self.assertEqual(dedup_patents([]), [])


if __name__ == "__main__":
    unittest.main()
