#!/usr/bin/env python3
"""部署前把本機 css/js 網址加上這次 commit，讓瀏覽器不要沿用舊檔。"""
import pathlib
import re
import sys

rev = (sys.argv[1] if len(sys.argv) > 1 else "dev")[:7]
root = pathlib.Path(__file__).resolve().parents[1] / "website"
pattern = re.compile(r'(href|src)="([^"]+\.(?:css|js))(?:\?[^"]*)?"')


def bust(html: str) -> str:
    def repl(match: re.Match) -> str:
        url = match.group(2)
        if url.startswith("http://") or url.startswith("https://"):
            return match.group(0)
        return f'{match.group(1)}="{url}?v={rev}"'

    return pattern.sub(repl, html)


for path in root.rglob("*.html"):
    path.write_text(bust(path.read_text()))
