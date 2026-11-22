import hashlib
import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "boards"))
from expiry import aged_lines, sweep_board


class ExpiryTest(unittest.TestCase):
    def test_explicit_and_historical(self):
        today = date(2030, 4, 20)
        historical = "- 2029-01-01 · an earlier finding\r\n"
        old = "- 2030-04-01 · an old note\r\n"
        current = "- 2030-04-06 · fourteen days\r\n"
        timed = "- 2030-04-01 · still needed <!-- until 2030-04-20 -->\r\n"
        keep = {hashlib.sha256(historical.rstrip().encode()).hexdigest()}
        text = historical + old + current + timed
        self.assertEqual(aged_lines(text, today, keep), (historical + current + timed, [old]))
        self.assertEqual(sweep_board(text, today), (text, []))
        self.assertEqual(sweep_board(text, date(2030, 4, 21))[0], historical + old + current)


if __name__ == "__main__":
    unittest.main()
