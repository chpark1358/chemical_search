"""Tests for the curated Korean-alias fallback (korean_aliases.py) and its
integration into the candidate-resolution pipeline.

No live network is used: the HttpClient is faked to return an empty SPARQL
result (a Wikidata miss), forcing the curated-alias path to run. The alias
dictionary covers common solution/colloquial/brand names that Wikidata lacks
(verified live: 포르말린 / 포도당 / 타이레놀 all return NO MATCH from Wikidata).
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from typing import Any


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from chemical_search.korean_aliases import KOREAN_ALIASES, lookup_korean_alias
from chemical_search.models import CompoundCandidate, ProviderDiagnostics
from chemical_search.pipeline import (
    KOREAN_ALIAS_RESOLVED_WARNING,
    SearchPipeline,
)


EMPTY_SPARQL_FIXTURE: dict[str, Any] = {
    "head": {"vars": ["item", "cid", "inchikey"]},
    "results": {"bindings": []},
}


class LookupKoreanAliasTests(unittest.TestCase):
    def test_formalin_resolves_to_formaldehyde(self):
        # Formalin is aqueous formaldehyde; the curator maps it to formaldehyde.
        result = lookup_korean_alias("포르말린")
        self.assertEqual(result, {"name": "formaldehyde", "cid": 712})

    def test_glucose_korean_and_loanword(self):
        self.assertEqual(lookup_korean_alias("포도당"), {"name": "glucose", "cid": 5793})
        self.assertEqual(lookup_korean_alias("글루코스"), {"name": "glucose", "cid": 5793})

    def test_tylenol_resolves_to_acetaminophen(self):
        self.assertEqual(
            lookup_korean_alias("타이레놀"), {"name": "acetaminophen", "cid": 1983}
        )

    def test_unknown_name_returns_none(self):
        self.assertIsNone(lookup_korean_alias("가상물질"))
        self.assertIsNone(lookup_korean_alias(""))

    def test_query_is_normalized_strip_and_internal_space(self):
        # Leading/trailing whitespace and a stray internal space are stripped.
        self.assertEqual(
            lookup_korean_alias("  포르말린  "), {"name": "formaldehyde", "cid": 712}
        )
        self.assertEqual(
            lookup_korean_alias("포 르 말 린"), {"name": "formaldehyde", "cid": 712}
        )

    def test_every_entry_carries_name_or_cid(self):
        for korean, alias in KOREAN_ALIASES.items():
            with self.subTest(korean=korean):
                self.assertTrue(
                    alias.name is not None or alias.cid is not None,
                    f"{korean!r} has neither name nor cid",
                )


class FakeHttp:
    """Returns the queued SPARQL payload (so Wikidata always 'misses' here)."""

    def __init__(self, payloads: list):
        self.payloads = list(payloads)
        self.urls: list[str] = []

    def get_json(self, url, *, headers=None, cache_ttl_seconds=0, retries=0):
        from chemical_search.models import HttpDiagnostics

        self.urls.append(url)
        return self.payloads.pop(0), HttpDiagnostics(latency_ms=1)


class FakePubChem:
    """Scriptable PubChem stub recording how it was called."""

    def __init__(
        self,
        *,
        name_candidates: list[CompoundCandidate] | None = None,
        cid_candidates: list[CompoundCandidate] | None = None,
    ):
        self.name_candidates = name_candidates or []
        self.cid_candidates = cid_candidates or []
        self.resolve_calls: list[tuple[str, str]] = []
        self.cid_calls: list[int] = []

    def resolve_candidates(self, query, input_type, limit):
        self.resolve_calls.append((query, input_type))
        status = "ok" if self.name_candidates else "empty"
        return list(self.name_candidates), ProviderDiagnostics(
            name="pubchem", status=status, latency_ms=1
        )

    def resolve_by_cid(self, cid, limit=1):
        self.cid_calls.append(cid)
        status = "ok" if self.cid_candidates else "empty"
        return list(self.cid_candidates), ProviderDiagnostics(
            name="pubchem", status=status, latency_ms=1
        )


def candidate(cid: int) -> CompoundCandidate:
    return CompoundCandidate(
        candidate_id=f"pubchem:{cid}",
        title="Formaldehyde",
        formula="CH2O",
        smiles="C=O",
        cid=cid,
    )


def make_pipeline(pubchem: FakePubChem, http: FakeHttp) -> SearchPipeline:
    pipeline = SearchPipeline.__new__(SearchPipeline)
    pipeline.http = http
    pipeline.pubchem = pubchem
    pipeline.semantic_scholar = None
    pipeline.openalex = None
    pipeline.crossref = None
    pipeline.surechembl = None
    pipeline.kipris = None
    return pipeline


class KoreanAliasPipelineTests(unittest.TestCase):
    def test_formalin_resolves_via_alias_cid_path_after_wikidata_miss(self):
        # Wikidata returns empty bindings (a miss). The curated alias prefers the
        # CID, so PubChem is driven via resolve_by_cid(712), NOT a name lookup.
        pubchem = FakePubChem(cid_candidates=[candidate(712)])
        http = FakeHttp([EMPTY_SPARQL_FIXTURE])
        pipeline = make_pipeline(pubchem, http)

        resolution = pipeline.resolve_candidates("포르말린", "auto", 20)

        self.assertEqual(resolution.detected_type, "name")
        self.assertEqual(len(resolution.candidates), 1)
        self.assertEqual(pubchem.cid_calls, [712])
        self.assertEqual(pubchem.resolve_calls, [])
        expected = KOREAN_ALIAS_RESOLVED_WARNING.format(
            name="포르말린", target="formaldehyde", cid=712
        )
        self.assertIn(expected, resolution.candidates[0].warnings)

    def test_alias_falls_through_when_pubchem_does_not_confirm(self):
        # Alias matches, but PubChem returns nothing for the CID -> fall through
        # to the normal PubChem name lookup with the original Korean query.
        pubchem = FakePubChem(cid_candidates=[], name_candidates=[])
        http = FakeHttp([EMPTY_SPARQL_FIXTURE])
        pipeline = make_pipeline(pubchem, http)

        resolution = pipeline.resolve_candidates("포르말린", "auto", 20)

        self.assertEqual(resolution.candidates, [])
        self.assertEqual(pubchem.cid_calls, [712])
        self.assertEqual(pubchem.resolve_calls, [("포르말린", "name")])

    def test_unknown_korean_skips_alias_path(self):
        # Not in the alias dict -> no CID call; straight to PubChem name lookup.
        pubchem = FakePubChem(name_candidates=[])
        http = FakeHttp([EMPTY_SPARQL_FIXTURE])
        pipeline = make_pipeline(pubchem, http)

        resolution = pipeline.resolve_candidates("가상물질", "auto", 20)

        self.assertEqual(resolution.candidates, [])
        self.assertEqual(pubchem.cid_calls, [])
        self.assertEqual(pubchem.resolve_calls, [("가상물질", "name")])


if __name__ == "__main__":
    unittest.main()
