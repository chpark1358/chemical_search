from __future__ import annotations

import argparse
from pathlib import Path

from .pipeline import SearchPipeline
from .rendering import render_csv, render_json, render_markdown


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the Chemical Search Phase 1 POC.")
    parser.add_argument("query", help="SMILES, name, formula, InChI, or InChIKey.")
    parser.add_argument(
        "--input-type",
        default="auto",
        choices=["auto", "smiles", "name", "formula", "inchi", "inchi_key"],
    )
    parser.add_argument(
        "--mode",
        default="all",
        choices=["all", "exact", "similarity", "substructure"],
    )
    parser.add_argument("--threshold", type=int, default=80)
    parser.add_argument("--candidate-index", type=int, default=0)
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--out", default="output/chemical-search/poc")
    parser.add_argument("--no-semantic-scholar", action="store_true")
    parser.add_argument("--no-cache", action="store_true")
    args = parser.parse_args()

    pipeline = SearchPipeline(
        cache_dir=Path("output/chemical-search/cache"),
        cache_enabled=not args.no_cache,
    )
    report = pipeline.run(
        args.query,
        input_type=args.input_type,
        mode=args.mode,
        threshold=args.threshold,
        candidate_index=args.candidate_index,
        limit=args.limit,
        include_semantic_scholar=not args.no_semantic_scholar,
    )

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "search-result.json").write_text(render_json(report), encoding="utf-8")
    (out_dir / "search-result.csv").write_text(render_csv(report), encoding="utf-8-sig")
    markdown = render_markdown(report)
    (out_dir / "search-result.md").write_text(markdown, encoding="utf-8")
    print(markdown)
    return 0 if report.selected_compound else 1


if __name__ == "__main__":
    raise SystemExit(main())
