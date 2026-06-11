"""Curated Korean-name fallback for the Wikidata Korean-name resolver.

Wikidata's labels cover IUPAC/systematic Korean chemical names well (포름알데하이드,
에탄올, 벤젠 all resolve), but it misses many common *solution*, colloquial, and
brand names: 포르말린 (formalin, an aqueous formaldehyde solution), 포도당/글루코스
(glucose), 타이레놀 (Tylenol). For those the Wikidata SPARQL lookup returns no
match and the pipeline would otherwise fall through to PubChem's name lookup,
which does not understand Korean.

This module is a tiny, hand-curated dictionary checked AFTER a Wikidata miss and
BEFORE giving up. Each entry maps a normalized Korean name to either an English
query string (fed to PubChem's name lookup) or a PubChem CID (resolved directly
by CID). Entries are kept chemically sensible: e.g. 포르말린 -> formaldehyde,
since formalin is simply aqueous formaldehyde and PubChem has no distinct
"formalin" compound record.

The CIDs below are stable PubChem compound identifiers. Where a CID is given it
is preferred (one confident record, no name ambiguity); where only a name is
given, PubChem's English name lookup resolves it.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class KoreanAlias:
    """A curated resolution target for a Korean name.

    Exactly one of ``name`` / ``cid`` is meaningful per entry, but both are
    optional so the lookup can return whichever the curator supplied.
    """

    name: str | None = None
    cid: int | None = None


# Normalized Korean name -> resolution target. Keys are already normalized
# (stripped, internal whitespace collapsed) so lookups compare like-for-like.
#
# Several entries (포름알데히드, 아스피린, 카페인, 에탄올) already resolve via
# Wikidata; they are included as harmless, explicit fallbacks in case Wikidata
# is unavailable or its labels change.
KOREAN_ALIASES: dict[str, KoreanAlias] = {
    # Formalin is aqueous formaldehyde; PubChem has no separate formalin record.
    "포르말린": KoreanAlias(name="formaldehyde", cid=712),
    "포름알데히드": KoreanAlias(name="formaldehyde", cid=712),
    "포름알데하이드": KoreanAlias(name="formaldehyde", cid=712),
    # Glucose: D-glucose, PubChem CID 5793.
    "포도당": KoreanAlias(name="glucose", cid=5793),
    "글루코스": KoreanAlias(name="glucose", cid=5793),
    "글루코오스": KoreanAlias(name="glucose", cid=5793),
    # Tylenol -> acetaminophen (paracetamol), CID 1983.
    "타이레놀": KoreanAlias(name="acetaminophen", cid=1983),
    "타이레놀정": KoreanAlias(name="acetaminophen", cid=1983),
    "아세트아미노펜": KoreanAlias(name="acetaminophen", cid=1983),
    "파라세타몰": KoreanAlias(name="acetaminophen", cid=1983),
    # Aspirin -> acetylsalicylic acid, CID 2244 (already works via Wikidata).
    "아스피린": KoreanAlias(name="aspirin", cid=2244),
    # Caffeine, CID 2519 (already works via Wikidata).
    "카페인": KoreanAlias(name="caffeine", cid=2519),
    # Table salt -> sodium chloride, CID 5234.
    "소금": KoreanAlias(name="sodium chloride", cid=5234),
    "식염": KoreanAlias(name="sodium chloride", cid=5234),
    "염화나트륨": KoreanAlias(name="sodium chloride", cid=5234),
    # Vinegar / acetic acid, CID 176.
    "식초": KoreanAlias(name="acetic acid", cid=176),
    "아세트산": KoreanAlias(name="acetic acid", cid=176),
    "초산": KoreanAlias(name="acetic acid", cid=176),
    # Ethanol, CID 702 (already works via Wikidata).
    "에탄올": KoreanAlias(name="ethanol", cid=702),
    "에틸알코올": KoreanAlias(name="ethanol", cid=702),
    # Methanol, CID 887.
    "메탄올": KoreanAlias(name="methanol", cid=887),
    "메틸알코올": KoreanAlias(name="methanol", cid=887),
    # Ammonia, CID 222.
    "암모니아": KoreanAlias(name="ammonia", cid=222),
    # Hydrogen peroxide, CID 784.
    "과산화수소": KoreanAlias(name="hydrogen peroxide", cid=784),
    # Sulfuric acid, CID 1118.
    "황산": KoreanAlias(name="sulfuric acid", cid=1118),
    # Hydrochloric acid, CID 313.
    "염산": KoreanAlias(name="hydrochloric acid", cid=313),
    # Citric acid, CID 311.
    "구연산": KoreanAlias(name="citric acid", cid=311),
    "시트르산": KoreanAlias(name="citric acid", cid=311),
    # Urea, CID 1176.
    "요소": KoreanAlias(name="urea", cid=1176),
    # Sucrose / table sugar, CID 5988.
    "설탕": KoreanAlias(name="sucrose", cid=5988),
    "자당": KoreanAlias(name="sucrose", cid=5988),
}


def _normalize(query: str) -> str:
    """Normalize a Korean query for alias lookup: strip and collapse whitespace.

    Korean is written without spaces between words, so a stray internal space
    (e.g. from copy/paste) would otherwise defeat an exact-key match.
    """
    return "".join(query.split())


def lookup_korean_alias(query: str) -> dict[str, object] | None:
    """Return the curated resolution for ``query`` or ``None`` if unknown.

    The result is a dict with optional ``"name"`` (English PubChem query) and
    ``"cid"`` (PubChem CID) keys; callers prefer the CID when present. Returns
    ``None`` for any name not in :data:`KOREAN_ALIASES`.
    """
    alias = KOREAN_ALIASES.get(_normalize(query))
    if alias is None:
        return None
    result: dict[str, object] = {}
    if alias.name is not None:
        result["name"] = alias.name
    if alias.cid is not None:
        result["cid"] = alias.cid
    if not result:  # pragma: no cover - every entry carries name and/or cid
        return None
    return result
