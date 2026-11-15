#!/usr/bin/env python3
"""Wrap marked HTML for A4 printing: heading anchors, mermaid figures, stylesheet."""

import html
import pathlib
import re
import sys
import urllib.request

KROKI = "https://kroki.io/mermaid/svg"

MERMAID_STYLE = (
    '%%{init: {"theme":"base","themeVariables":{'
    '"primaryColor":"#dbe8f6",'
    '"primaryTextColor":"#0f2740",'
    '"primaryBorderColor":"#2c6da4",'
    '"lineColor":"#2c6da4",'
    '"secondaryColor":"#c8dcef",'
    '"tertiaryColor":"#f3f8fd",'
    '"edgeLabelBackground":"#eef5fb",'
    '"fontFamily":"Segoe UI, Arial, sans-serif",'
    '"fontSize":"15px"}}}%%\n'
)

def render_mermaid(body: str) -> str:
    """Thay khối ```mermaid bằng SVG vẽ sẵn, để PDF có hình thay vì code."""
    pattern = re.compile(r'<pre><code class="language-mermaid">(.*?)</code></pre>', re.S)

    def repl(match):
        src = MERMAID_STYLE + html.unescape(match.group(1))
        try:
            req = urllib.request.Request(
                KROKI,
                data=src.encode("utf-8"),
                headers={
                    "Content-Type": "text/plain",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                },
            )
            with urllib.request.urlopen(req, timeout=60) as response:
                svg = response.read().decode("utf-8")
        except Exception as exc:  # offline hoặc Kroki lỗi: giữ nguyên code
            print(f"mermaid khong ve duoc, giu nguyen code: {exc}", file=sys.stderr)
            return match.group(0)
        svg = svg[svg.index("<svg"):]
        svg = re.sub(r'(<svg[^>]*?)\swidth="[^"]*"', r"\1", svg, count=1)
        svg = re.sub(r'(<svg[^>]*?)\sheight="[^"]*"', r"\1", svg, count=1)
        return f'<figure class="diagram">{svg}</figure>'

    return pattern.sub(repl, body)

def wrap_figures(body: str) -> str:
    """Gom đoạn chỉ có một ảnh thành figure, và gắn dòng "Hình N. ..." ngay sau thành figcaption."""
    pattern = re.compile(r'<p>\s*(<img\b[^>]*>)\s*</p>(?:\s*<p>(Hình \d+\.[^<]*)</p>)?', re.S)

    def repl(match):
        img, caption = match.group(1), match.group(2)
        if caption:
            return f'<figure class="diagram">{img}<figcaption>{caption.strip()}</figcaption></figure>'
        return f'<figure class="diagram">{img}</figure>'

    return pattern.sub(repl, body)

def strip_tags(value: str) -> str:
    return re.sub(r"<[^>]+>", "", value)

def slug(text: str) -> str:
    text = html.unescape(strip_tags(text)).strip().lower()
    text = re.sub(r"[^0-9a-zàáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]+", "-", text)
    return text.strip("-") or "muc"

def add_heading_ids(body: str):
    headings = []

    def repl(match):
        level, inner = match.group(1), match.group(2)
        text = html.unescape(strip_tags(inner)).strip()
        number = re.match(r"^(\d+(?:\.\d+)*)\.?\s", text)
        anchor = f"sec-{number.group(1)}" if number else f"sec-{slug(text)}"
        headings.append((int(level), anchor, text))
        return f'<h{level} id="{anchor}">{inner}</h{level}>'

    body = re.sub(r"<h([1-4])>(.*?)</h\1>", repl, body, flags=re.S)
    return body, headings

def main() -> int:
    if len(sys.argv) != 3:
        print("usage: postprocess.py <file.html> <style.css>", file=sys.stderr)
        return 2

    html_path = pathlib.Path(sys.argv[1])
    css_path = pathlib.Path(sys.argv[2])
    body = html_path.read_text(encoding="utf-8")
    css = css_path.read_text(encoding="utf-8")

    body, _ = add_heading_ids(body)
    body = render_mermaid(body)
    body = wrap_figures(body)

    title_match = re.search(r"<h1[^>]*>(.*?)</h1>", body, flags=re.S)
    title = html.unescape(strip_tags(title_match.group(1))).strip() if title_match else html_path.stem

    document = (
        "<!doctype html>\n"
        '<html lang="vi">\n<head>\n<meta charset="utf-8">\n'
        f"<title>{html.escape(title)}</title>\n"
        f"<style>\n{css}\n</style>\n</head>\n<body>\n{body}\n</body>\n</html>\n"
    )
    html_path.write_text(document, encoding="utf-8")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
