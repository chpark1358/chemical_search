"""CLI for the papers-only chemical literature search POC.

Resolves a chemical input (name/SMILES/InChI/InChIKey/formula) into PubChem
candidates and searches Semantic Scholar + Crossref for papers about the
selected compound.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from .pipeline import PAPER_SOURCES, SearchPipeline
from .rendering import render_csv, render_json, render_markdown


def main() -> int:
    parser = argparse.ArgumentParser(description="화학물질 논문 검색 POC 실행기.")
    parser.add_argument("query", help="SMILES, name, formula, InChI, or InChIKey.")
    parser.add_argument(
        "--input-type",
        default="auto",
        choices=["auto", "name", "smiles", "inchi", "inchi_key", "formula"],
    )
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument(
        "--sort",
        default="relevance",
        choices=["relevance", "citations", "year"],
    )
    parser.add_argument(
        "--sources",
        nargs="*",
        choices=list(PAPER_SOURCES),
        default=None,
        help="Paper sources to query; omit for both.",
    )
    parser.add_argument(
        "--candidate-id",
        default=None,
        help="Candidate to use when the input resolves to multiple compounds.",
    )
    parser.add_argument("--out", default="output/chemical-search/poc")
    parser.add_argument("--no-cache", action="store_true")
    args = parser.parse_args()

    pipeline = SearchPipeline(
        cache_dir=Path("output/chemical-search/cache"),
        cache_enabled=not args.no_cache,
    )
    resolution = pipeline.resolve_candidates(args.query, args.input_type, args.limit)
    if not resolution.candidates:
        print("입력하신 화학물질을 찾을 수 없습니다. 입력 값을 다시 확인해 주세요.")
        return 1

    if args.candidate_id:
        candidate = next(
            (item for item in resolution.candidates if item.candidate_id == args.candidate_id),
            None,
        )
        if candidate is None:
            print(f"후보 '{args.candidate_id}'을(를) 찾을 수 없습니다.")
            return 1
    elif len(resolution.candidates) > 1:
        print("여러 후보 화합물이 검색되었습니다. --candidate-id 로 하나를 선택해 주세요:")
        for item in resolution.candidates:
            print(f"  {item.candidate_id}  {item.title}  ({item.formula or '-'})")
        return 2
    else:
        candidate = resolution.candidates[0]

    report = pipeline.run_papers(
        args.query,
        candidate,
        detected_type=resolution.detected_type,
        sources=args.sources,
        limit=args.limit,
        sort=args.sort,
        extra_providers=[resolution.diagnostics],
    )

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "search-result.json").write_text(render_json(report), encoding="utf-8")
    (out_dir / "search-result.csv").write_text(render_csv(report), encoding="utf-8-sig")
    markdown = render_markdown(report)
    (out_dir / "search-result.md").write_text(markdown, encoding="utf-8")
    print(markdown)
    return 0 if report.status != "failed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
