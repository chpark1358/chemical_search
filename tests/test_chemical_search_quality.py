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

        self.assertEqual(report["summary"]["passed"], report["summary"]["total"])
        self.assertEqual(report["summary"]["total"], 10)


if __name__ == "__main__":
    unittest.main()
