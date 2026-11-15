#!/usr/bin/env bash
# Render a Markdown document to A4 PDF.
# Usage: bash docs/render/render.sh <file.md> [out.pdf]
# Requires: node/npx (marked is fetched on first run), Python 3, Chrome or Edge.
set -euo pipefail
# Unicode file names must survive the Python calls below on Windows consoles (cp1252).
export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8

SRC="${1:-}"
if [ -z "$SRC" ]; then
  echo "usage: bash docs/render/render.sh <file.md> [out.pdf]" >&2
  exit 2
fi
[ -f "$SRC" ] || { echo "not found: $SRC" >&2; exit 1; }

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${2:-${SRC%.md}.pdf}"
TMP_HTML="${SRC%.md}.render.html"

command -v npx >/dev/null 2>&1 || { echo "npx not found" >&2; exit 1; }
command -v python >/dev/null 2>&1 || { echo "python not found" >&2; exit 1; }

npx --yes marked@14 -i "$SRC" -o "$TMP_HTML"
python "$DIR/postprocess.py" "$TMP_HTML" "$DIR/style.css"

CHROME="${CHROME:-}"
if [ -z "$CHROME" ]; then
  for candidate in \
    "/c/Program Files/Google/Chrome/Application/chrome.exe" \
    "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" \
    "/c/Program Files/Microsoft/Edge/Application/msedge.exe" \
    "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"; do
    if [ -x "$candidate" ]; then
      CHROME="$candidate"
      break
    fi
  done
fi
if [ -z "$CHROME" ]; then
  for candidate in google-chrome chromium chromium-browser chrome; do
    if command -v "$candidate" >/dev/null 2>&1; then
      CHROME="$candidate"
      break
    fi
  done
fi
[ -n "$CHROME" ] || { echo "Chrome/Edge not found; set CHROME=/path/to/chrome" >&2; exit 1; }

mkdir -p "$(dirname "$OUT")"
OUT_WIN="$(python -c 'import os,sys; print(os.path.abspath(sys.argv[1]))' "$OUT")"
URI="$(python -c 'import pathlib,sys; print(pathlib.Path(sys.argv[1]).resolve().as_uri())' "$TMP_HTML")"

trap 'rm -f "$TMP_HTML"' EXIT

"$CHROME" \
  --headless=new \
  --disable-gpu \
  --disable-extensions \
  --hide-scrollbars \
  --no-pdf-header-footer \
  --virtual-time-budget=5000 \
  --print-to-pdf="$OUT_WIN" \
  "$URI" >/dev/null 2>&1

[ -s "$OUT" ] || { echo "PDF not written: $OUT" >&2; exit 1; }
echo "$OUT"
