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

def protect_short_code(body: str) -> str:
    """Giữ code ngắn trên một dòng, tránh gãy ở dấu gạch nối như svc-agent."""

    def repl(match):
        inner = match.group(1)
        if len(html.unescape(strip_tags(inner))) <= 24:
            return f'<code class="nowrap">{inner}</code>'
        return match.group(0)

    return re.sub(r"<code>(.*?)</code>", repl, body, flags=re.S)


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

def md_slug(text: str) -> str:
    """Slug giống tools/check-docs.py, để link nội bộ trong Markdown nhảy đúng."""
    text = html.unescape(strip_tags(text)).strip().lower()
    text = re.sub(r"[^\w\s-]", "", text)
    return re.sub(r"\s", "-", text)

def add_heading_ids(body: str):
    headings = []

    def repl(match):
        level, inner = match.group(1), match.group(2)
        text = html.unescape(strip_tags(inner)).strip()
        number = re.match(r"^(\d+(?:\.\d+)*)\.?\s", text)
        anchor = f"sec-{number.group(1)}" if number else f"sec-{slug(text)}"
        plain = md_slug(text)
        alias = "" if plain == anchor else f'<a class="anchor" id="{plain}"></a>'
        headings.append((int(level), anchor, text))
        return f'<h{level} id="{anchor}">{alias}{inner}</h{level}>'

    body = re.sub(r"<h([1-4])>(.*?)</h\1>", repl, body, flags=re.S)
    return body, headings

def protect_short_cells(body: str) -> str:
    """Giữ ô bảng chỉ có hai, ba chữ ngắn như "Một phần" trên một dòng, tránh gãy giữa cụm."""

    def protect(match, limit):
        attrs, inner = match.group(1), match.group(2)
        text = html.unescape(strip_tags(inner)).strip()
        if " " in text and len(text) <= limit and "class=" not in attrs:
            return f'<td{attrs} class="nowrap">{inner}</td>'
        # Giữ cụm ngắn trong ngoặc như "(chị Hoa)" trên một dòng.
        inner = re.sub(
            r"\(([^()<>]{1,12})\)",
            lambda m: "(" + m.group(1).replace(" ", " ") + ")",
            inner,
        )
        return f"<td{attrs}>{inner}</td>"

    cell = re.compile(r"<td([^>]*)>(.*?)</td>", re.S)

    # Ô đầu dòng là nhãn của cả dòng, như "Người kiểm tra", nên được giữ dài hơn một chút.
    def row(match):
        tr = match.group(0)
        first = cell.search(tr)
        if not first:
            return tr
        head = tr[: first.start()] + protect(first, 16)
        return head + cell.sub(lambda m: protect(m, 12), tr[first.end() :])

    return re.sub(r"<tr[^>]*>.*?</tr>", row, body, flags=re.S)

def mark_compact_tables(body: str) -> str:
    """Giữ bảng ngắn trên một trang; bảng dài vẫn được cắt và lặp lại dòng tiêu đề."""

    def repl(match):
        table = match.group(0)
        rows = table.count("<tr")
        if rows <= 6:
            return table.replace("<table>", '<table class="keep">', 1)
        return table

    return re.sub(r"<table>.*?</table>", repl, body, flags=re.S)


META_LABELS = (
    "Ngày",
    "Trạng thái",
    "Owner",
    "Mentor",
    "Revision",
    "Phiên bản",
    "Người phụ trách",
    "Chủ sở hữu",
)


def strip_metadata(body: str) -> str:
    """Bỏ dòng ngày và trạng thái ở đầu tài liệu, để bản PDF nộp ra không mang dòng này."""
    split = re.search(r"<h[23]\b", body)
    head, tail = (body[: split.start()], body[split.start() :]) if split else (body, "")
    labels = "|".join(META_LABELS)
    paragraph = r"<(?:p|li)>(?:\s*<strong>)?\s*(?:%s)(?:\s*</strong>)?\s*:" % labels
    head = re.sub(paragraph + r".*?</(?:p|li)>\s*", "", head, flags=re.S)
    if re.search(paragraph, head):
        raise SystemExit(
            "metadata line is still in the top of the page; fix the Markdown shape so it renders as <p> or <li>"
        )
    return head + tail


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: postprocess.py <file.html> <style.css>", file=sys.stderr)
        return 2

    html_path = pathlib.Path(sys.argv[1])
    css_path = pathlib.Path(sys.argv[2])
    body = html_path.read_text(encoding="utf-8")
    css = css_path.read_text(encoding="utf-8")

    body = strip_metadata(body)
    body, _ = add_heading_ids(body)
    body = protect_short_code(body)
    body = render_mermaid(body)
    body = wrap_figures(body)
    body = protect_short_cells(body)
    body = mark_compact_tables(body)

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
