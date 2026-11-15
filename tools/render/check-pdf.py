#!/usr/bin/env python3
"""Fail when a rendered PDF still carries the metadata line (date and status).

The line lives under the title, so the first pages are enough. Needs pypdf:
python -m pip install pypdf
"""

import re
import sys

META = re.compile(r"Ngày: \d{4}-\d{2}-\d{2}\. Trạng thái:")
PAGES = 3


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: check-pdf.py <file.pdf>", file=sys.stderr)
        return 2
    path = sys.argv[1]
    try:
        from pypdf import PdfReader
    except ImportError:
        print("pypdf not installed, PDF metadata check skipped: python -m pip install pypdf", file=sys.stderr)
        return 0
    reader = PdfReader(path)
    for number, page in enumerate(reader.pages[:PAGES], 1):
        if META.search(page.extract_text() or ""):
            print(f"{path}: page {number} still carries the date and status line", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
