import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from chemical_search.env import _parse_line, load_dotenv


class ParseLineTests(unittest.TestCase):
    def test_basic_key_value(self):
        self.assertEqual(_parse_line("FOO=bar"), ("FOO", "bar"))

    def test_strips_double_quotes(self):
        self.assertEqual(_parse_line('KEY="a/b=c="'), ("KEY", "a/b=c="))

    def test_strips_single_quotes(self):
        self.assertEqual(_parse_line("KEY='value'"), ("KEY", "value"))

    def test_value_with_equals_kept(self):
        # A KIPRIS decoding key can contain '=' inside the value.
        self.assertEqual(_parse_line("K=/iIRlZ=bUkU="), ("K", "/iIRlZ=bUkU="))

    def test_ignores_comments_blanks_and_malformed(self):
        self.assertIsNone(_parse_line("# comment"))
        self.assertIsNone(_parse_line(""))
        self.assertIsNone(_parse_line("no_equals_here"))
        self.assertIsNone(_parse_line("=novalue"))


class LoadDotenvTests(unittest.TestCase):
    def test_loads_without_overriding_existing(self):
        with tempfile.TemporaryDirectory() as d:
            env_file = Path(d) / ".env"
            env_file.write_text(
                '# comment\nNEW_VAR="hello"\nEXISTING_VAR="from_file"\n',
                encoding="utf-8",
            )
            os.environ.pop("NEW_VAR", None)
            os.environ["EXISTING_VAR"] = "from_env"
            try:
                load_dotenv(env_file)
                self.assertEqual(os.environ["NEW_VAR"], "hello")
                # Real environment variables win over the file.
                self.assertEqual(os.environ["EXISTING_VAR"], "from_env")
            finally:
                os.environ.pop("NEW_VAR", None)
                os.environ.pop("EXISTING_VAR", None)

    def test_missing_file_is_silent(self):
        load_dotenv(Path("/nonexistent/.env"))  # must not raise


if __name__ == "__main__":
    unittest.main()
