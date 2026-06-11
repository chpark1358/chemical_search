from __future__ import annotations

import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from chemical_search.evaluate_quality import evaluate


class QualityFixtureTests(unittest.TestCase):
    def test_normalization_quality_cases_pass(self):
        cases = Path(__file__).resolve().parents[1] / "scripts/chemical_search/quality-cases.json"
        report = evaluate(cases)

        self.assertGreater(report["summary"]["total"], 0)
        failed_cases = [result["name"] for result in report["results"] if not result["passed"]]
        self.assertEqual(
            failed_cases,
            [],
            f"Failed quality cases: {', '.join(failed_cases)}",
        )


if __name__ == "__main__":
    unittest.main()
