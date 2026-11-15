#!/usr/bin/env python3
"""Check Markdown docs: relative links resolve, no em dash, file names follow the convention.

Run from anywhere: python tools/check-docs.py
Exit code 1 when any problem is found.
"""
import re
import sys
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {".git", ".lavish", "scratch", "dist", "node_modules"}
LINK = re.compile(r"(?<!\!)\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
NAME_OK = re.compile(r"^(?:\d{4}-\d{2}-\d{2}-)?[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+$")
NAME_EXEMPT = {"README.md", "AGENTS.md", "CLAUDE.md", "CHANGELOG.md"}
NAME_EXEMPT_DIRS = {"program"}  # original program documents keep their official names
EM_DASH = "—"


def files():
    for p in sorted(ROOT.rglob("*")):
        if p.is_file() and not (set(p.relative_to(ROOT).parts) & SKIP_DIRS):
            yield p


def slug(heading: str) -> str:
    s = heading.strip().lower()
    s = re.sub(r"[^\w\s-]", "", s)
    return re.sub(r"\s", "-", s)


def anchors(path: Path) -> set:
    out = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"#{1,6}\s+(.*)", line)
        if m:
            out.add(slug(m.group(1)))
    return out


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    problems = []
    for p in files():
        rel = p.relative_to(ROOT).as_posix()
        if p.name not in NAME_EXEMPT and not p.name.startswith(".") and not (set(p.relative_to(ROOT).parts) & NAME_EXEMPT_DIRS) and not NAME_OK.match(p.name):
            problems.append(f"{rel}: file name must be lowercase ASCII kebab-case (optional YYYY-MM-DD- prefix)")
        if p.suffix != ".md":
            continue
        text = p.read_text(encoding="utf-8")
        if EM_DASH in text:
            problems.append(f"{rel}: contains an em dash")
        in_code = False
        for n, line in enumerate(text.splitlines(), 1):
            if line.lstrip().startswith("```"):
                in_code = not in_code
            if in_code:
                continue
            for target in LINK.findall(line):
                if re.match(r"^[a-z]+:", target):
                    continue
                path_part, _, frag = target.partition("#")
                dest = p if not path_part else (p.parent / unquote(path_part)).resolve()
                if not dest.exists():
                    problems.append(f"{rel}:{n}: broken link {target}")
                elif frag and dest.suffix == ".md" and slug(unquote(frag)) not in anchors(dest):
                    problems.append(f"{rel}:{n}: missing anchor #{frag} in {dest.name}")
    for msg in problems:
        print(msg)
    print(f"{len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
