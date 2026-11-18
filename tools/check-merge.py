#!/usr/bin/env python3
"""Check that the current branch still merges into main, and which open pull requests touch the same files.

Run from anywhere inside the repository:

    python tools/check-merge.py [--base origin/main] [--no-fetch]

Exit code 1 when the branch conflicts with the base.
A conflict or a shared file with another open pull request is printed as a warning:
it blocks whichever of the two merges second, so the two owners agree on an order or stack the branches.
Needs git 2.38 or newer (`git merge-tree --write-tree`); the open pull requests come from `gh` when it is installed.
"""
import argparse
import json
import shutil
import subprocess
import sys


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args], capture_output=True, text=True, encoding="utf-8", check=check
    )


def conflicts(ours: str, theirs: str) -> list[str]:
    """Files that a three-way merge of the two commits leaves conflicted, without touching the work tree."""
    result = git("merge-tree", "--write-tree", "--name-only", "--no-messages", ours, theirs, check=False)
    if result.returncode == 0:
        return []
    if result.returncode != 1:
        raise SystemExit(f"git merge-tree failed: {result.stderr.strip()}")
    return sorted(set(line for line in result.stdout.splitlines()[1:] if line))


def onto(base: str, tip: str) -> str | None:
    """A throwaway commit holding `tip` merged into `base`, or None when that merge conflicts.

    Another pull request may still sit on an older main, so its own conflicts with main
    must not be blamed on the current branch.
    """
    result = git("merge-tree", "--write-tree", "--no-messages", base, tip, check=False)
    if result.returncode != 0:
        return None
    tree = result.stdout.splitlines()[0]
    return git("commit-tree", tree, "-p", base, "-p", tip, "-m", "check-merge").stdout.strip()


def changed(base: str, tip: str) -> set[str]:
    """Files a branch changed since it left the base."""
    return set(git("diff", "--name-only", f"{base}...{tip}").stdout.split())


def open_pull_requests() -> list[dict] | None:
    if shutil.which("gh") is None:
        return None
    result = subprocess.run(
        ["gh", "pr", "list", "--state", "open", "--limit", "100", "--json", "number,title,headRefName"],
        capture_output=True, text=True, encoding="utf-8",
    )
    if result.returncode != 0:
        return None
    return json.loads(result.stdout)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--base", default="origin/main", help="branch the pull request merges into")
    parser.add_argument("--no-fetch", action="store_true", help="use the remote branches already fetched")
    args = parser.parse_args()

    if not args.no_fetch:
        git("fetch", "--quiet", "--prune", "origin")
    branch = git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    head = git("rev-parse", "HEAD").stdout.strip()
    mine = changed(args.base, "HEAD")
    if not mine:
        print(f"{branch} changes no file against {args.base}; nothing to check.")
        return 0

    status = 0
    against_base = conflicts(args.base, "HEAD")
    if against_base:
        status = 1
        print(f"CONFLICT with {args.base}: rebase {branch} and resolve")
        for name in against_base:
            print(f"  {name}")
    else:
        print(f"{branch} merges cleanly into {args.base}.")

    prs = open_pull_requests()
    if prs is None:
        print("Open pull requests not checked: gh is missing or not signed in.")
        return status
    for pr in prs:
        ref = f"origin/{pr['headRefName']}"
        tip = git("rev-parse", "--verify", "--quiet", ref, check=False).stdout.strip()
        if not tip or tip == head or pr["headRefName"] == branch:
            continue
        shared = mine & changed(args.base, ref)
        if not shared:
            continue
        label = f"#{pr['number']} {pr['title']}"
        landed = onto(args.base, ref)
        if landed is None:
            print(f"Note: {label} does not merge into {args.base} yet; recheck after it rebases. Shared files: {', '.join(sorted(shared))}")
            continue
        clash = [name for name in conflicts("HEAD", landed) if name in shared]
        if clash:
            print(f"WARNING: conflicts with {label}; agree which merges first, or stack the branches")
            for name in clash:
                print(f"  {name}")
        else:
            print(f"Note: shares files with {label} without a conflict yet: {', '.join(sorted(shared))}")
    return status


if __name__ == "__main__":
    sys.exit(main())
