"""Resolve Korean (Hangul) chemical names to PubChem identifiers via Wikidata.

The PubChem name lookup does not understand Korean chemical names, so when a
query contains Hangul we first ask Wikidata's public SPARQL endpoint for the
matching item's PubChem CID (property P662) and InChIKey (P235). The caller
then feeds the resulting InChIKey (or CID) into the existing PubChem resolution
path. Wikidata needs no API key but asks callers to be polite: a descriptive
User-Agent and >=1s between requests (the throttle for ``query.wikidata.org``
lives in http_client.py).
"""

from __future__ import annotations

import logging
from urllib.parse import quote

from .http_client import HttpClient, ProviderHttpError
from .models import KoreanNameResolution


logger = logging.getLogger(__name__)

WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql"
# Wikidata's usage policy requires a descriptive User-Agent identifying the
# client and a contact; requests without one may be blocked.
WIKIDATA_USER_AGENT = "chemical-papers/1.0 (solutionops@jiran.com)"
WIKIDATA_CACHE_TTL = 7 * 24 * 60 * 60

# Hangul Syllables block (precomposed Korean syllables).
_HANGUL_START = "가"
_HANGUL_END = "힣"


def contains_hangul(value: str) -> bool:
    """Return True if ``value`` contains any precomposed Hangul syllable."""
    return any(_HANGUL_START <= char <= _HANGUL_END for char in value)


def _build_query(name: str) -> str:
    """Build the SPARQL query for ``name``.

    The name is embedded as a quoted Korean (``@ko``) string literal, matching
    either ``rdfs:label`` or ``skos:altLabel``, and returns the first item with
    a PubChem CID plus an optional InChIKey.

    An exact ``rdfs:label`` match is preferred over an ``skos:altLabel`` match:
    a homonymous Korean altLabel can point at the wrong compound, whereas the
    primary label is the canonical Korean name. Each branch is tagged with a
    ``?labelMatch`` flag (1 for the primary label, 0 for an altLabel) and the
    results are ordered so label matches sort first before ``LIMIT 1`` picks the
    single best item.
    """
    escaped = name.replace("\\", "\\\\").replace('"', '\\"')
    return (
        "SELECT ?item ?cid ?inchikey ?labelMatch WHERE { "
        f'{{ ?item rdfs:label "{escaped}"@ko. BIND(1 AS ?labelMatch) }} '
        f'UNION {{ ?item skos:altLabel "{escaped}"@ko. BIND(0 AS ?labelMatch) }} '
        "?item wdt:P662 ?cid. "
        "OPTIONAL { ?item wdt:P235 ?inchikey. } "
        "} ORDER BY DESC(?labelMatch) LIMIT 1"
    )


def resolve_korean_name(query: str, http: HttpClient) -> KoreanNameResolution | None:
    """Resolve a Korean chemical name to a PubChem CID/InChIKey via Wikidata.

    Returns ``None`` when the query has no Hangul, when Wikidata finds no
    matching item with a PubChem CID, or when the request fails (callers fall
    through to the normal PubChem lookup on ``None``).
    """
    name = query.strip()
    if not contains_hangul(name):
        return None

    url = (
        f"{WIKIDATA_SPARQL_URL}?query={quote(_build_query(name), safe='')}"
        "&format=json"
    )
    headers = {
        "Accept": "application/sparql-results+json",
        "User-Agent": WIKIDATA_USER_AGENT,
    }
    try:
        data, _ = http.get_json(
            url,
            headers=headers,
            cache_ttl_seconds=WIKIDATA_CACHE_TTL,
            retries=1,
        )
    except ProviderHttpError as exc:
        # A Wikidata failure is never fatal: fall through to the PubChem name
        # lookup. Log the transport status only (no URL/secret leakage).
        logger.warning("Wikidata Korean-name resolution failed (%s).", exc.status)
        return None

    bindings = (data.get("results") or {}).get("bindings") or []
    if not bindings:
        return None
    first = bindings[0]
    cid = _binding_int(first, "cid")
    inchi_key = _binding_str(first, "inchikey")
    if cid is None and inchi_key is None:
        return None
    return KoreanNameResolution(label=name, cid=cid, inchi_key=inchi_key)


def _binding_value(binding: dict, key: str) -> str | None:
    cell = binding.get(key)
    if not isinstance(cell, dict):
        return None
    value = cell.get("value")
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value or None


def _binding_str(binding: dict, key: str) -> str | None:
    return _binding_value(binding, key)


def _binding_int(binding: dict, key: str) -> int | None:
    value = _binding_value(binding, key)
    if value is None:
        return None
    if value.lstrip("-").isdigit():
        return int(value)
    return None
