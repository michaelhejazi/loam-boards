"""Expire a card after its explicit last day, preserving all other bytes."""

import argparse
import os
import re
import sys
from datetime import date

UNTIL_RE = re.compile(r"\buntil (\d{4}-\d{2}-\d{2})\b")
ITEM_META_RE = re.compile(r"<!--\s*(.*?)\s*-->\s*$")


def item_meta(line: str) -> list[str]:
    match = ITEM_META_RE.search(line)
    if not match or not line.lstrip().startswith(("- ", "* ")):
        return []
    return [part.strip() for part in match.group(1).split("·")]


def sweep_board(markdown: str, today: date) -> tuple[str, list[str]]:
    """Remove every item whose ``until`` day has passed. The ``until`` day is
    the last day it stays, so an item until today is still here today."""
    kept, gone = [], []
    lines = markdown.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        expired = False
        for part in item_meta(line):
            match = UNTIL_RE.search(part)
            if match:
                try:
                    expired = date.fromisoformat(match.group(1)) < today
                except ValueError:
                    expired = False
        if expired:
            gone.append(line)
            indent = len(line) - len(line.lstrip())
            i += 1
            # An item's own continuation lines and children go with it.
            while i < len(lines) and lines[i].strip() and (
                    len(lines[i]) - len(lines[i].lstrip()) > indent):
                gone.append(lines[i])
                i += 1
            continue
        kept.append(line)
        i += 1
    return "\n".join(kept), gone


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    sys.path.insert(0, os.environ["LOAM_LIB"])
    import loam_thread_files as files
    import loam_threads
    removed = 0
    for tid, snapshot in files.existing_documents("boards"):
        text, gone = sweep_board(snapshot["markdown"], date.today())
        if gone and not args.dry_run:
            try:
                files.document("boards", tid, {"base_revision": snapshot["revision"], "markdown": text})
            except loam_threads.ThreadError as exc:
                if exc.status in (404, 409):
                    continue
                raise
        removed += len(gone)
    print(f"{removed} expired lines")
    return 0


if __name__ == "__main__":
    sys.exit(main())
