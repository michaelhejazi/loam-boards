import hashlib
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "boards"))
from expiry import aged_lines, sweep_board, sweep_file


class _FakeConflict(Exception):
    pass


class _FakeRevisions:
    RevisionConflict = _FakeConflict

    def __init__(self, *, conflict=False):
        self.conflict = conflict
        self.writes = []

    def revision(self, raw: bytes) -> str:
        return hashlib.sha256(raw).hexdigest()

    def replace_text(self, path: Path, text: str, base: str):
        if self.conflict:
            raise _FakeConflict("concurrent edit")
        self.writes.append((path, text, base))
        path.write_text(text, encoding="utf-8")


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

    def test_sweep_file_expires_chat_board_preserving_frontmatter(self):
        today = date(2030, 4, 21)
        with tempfile.TemporaryDirectory() as tmp:
            chat_board = Path(tmp) / "Chat board.md"
            initial = (
                "---\ncreated_by: owner\n---\n# Chat board\n\n"
                "- 2030-04-20 · Keep plain <!-- Scout · new · until 2030-04-21 -->\n"
                "- 2030-04-10 · Expired plain <!-- Scout · new · until 2030-04-20 -->\n"
                "- [ ] Keep me <!-- until 2030-04-21 -->\n"
                "- [ ] Expired thought <!-- until 2030-04-20 -->\n"
                "  continuation line\n"
                "- [ ] Undated note\n"
            )
            chat_board.write_text(initial, encoding="utf-8")

            revs = _FakeRevisions()
            self.assertEqual(sweep_file(chat_board, today, dry_run=True, revisions=revs), 3)
            self.assertEqual(revs.writes, [])
            self.assertEqual(chat_board.read_text(encoding="utf-8"), initial)

            self.assertEqual(sweep_file(chat_board, today, dry_run=False, revisions=revs), 3)
            self.assertEqual(len(revs.writes), 1)
            expected = (
                "---\ncreated_by: owner\n---\n# Chat board\n\n"
                "- 2030-04-20 · Keep plain <!-- Scout · new · until 2030-04-21 -->\n"
                "- [ ] Keep me <!-- until 2030-04-21 -->\n"
                "- [ ] Undated note\n"
            )
            self.assertEqual(chat_board.read_text(encoding="utf-8"), expected)

    def test_sweep_file_missing_and_conflict(self):
        today = date(2030, 4, 21)
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / "Chat board.md"
            revs = _FakeRevisions()
            self.assertEqual(sweep_file(missing, today, revisions=revs), 0)

            missing.write_text("# Chat board\n\n- Old <!-- until 2030-04-20 -->\n", encoding="utf-8")
            conflict_revs = _FakeRevisions(conflict=True)
            self.assertEqual(sweep_file(missing, today, revisions=conflict_revs), 0)
            self.assertIn("Old", missing.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
