from __future__ import annotations

import argparse
import json
from pathlib import Path

from .normalize import normalize_structure


def evaluate(cases_path: Path) -> dict:
    cases = json.loads(cases_path.read_text(encoding="utf-8"))
    results = []
    passed = 0
    for case in cases:
        error = None
        compound = None
        try:
            compound = normalize_structure(case["input"], case["input_type"])
        except (RuntimeError, ValueError) as exc:
            error = str(exc)

        normalized = compound is not None
        case_passed = normalized == case["should_normalize"]
        if compound and case.get("expected_formula"):
            case_passed = case_passed and compound.formula == case["expected_formula"]
        if compound and case.get("expected_inchi_key"):
            case_passed = case_passed and compound.inchi_key == case["expected_inchi_key"]
        passed += int(case_passed)
        results.append(
            {
                "name": case["name"],
                "passed": case_passed,
                "normalized": normalized,
                "formula": compound.formula if compound else None,
                "inchi_key": compound.inchi_key if compound else None,
                "error": error,
            }
        )

    return {
        "summary": {
            "passed": passed,
            "total": len(cases),
            "pass_rate": round(passed / len(cases), 4) if cases else 0,
        },
        "results": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate Chemical Search normalization fixtures.")
    parser.add_argument(
        "--cases",
        type=Path,
        default=Path(__file__).with_name("quality-cases.json"),
    )
    parser.add_argument("--out", type=Path, default=Path("output/chemical-search/quality-report.json"))
    args = parser.parse_args()

    report = evaluate(args.cases)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report["summary"], indent=2))
    return 0 if report["summary"]["passed"] == report["summary"]["total"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
