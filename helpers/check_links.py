#!/usr/bin/env python3
"""Проверка внутренних ссылок собранного сайта (_site/).

Обходит все .html, проверяет что каждый относительный href существует.
Внешние (http…) и якорные (#…) ссылки пропускаются. Выход 1 при битых ссылках.

Запуск: python3 helpers/check_links.py [--site _site]
"""

import argparse
import re
import sys
from pathlib import Path


def main():
    ap = argparse.ArgumentParser(description="Проверка ссылок сайта")
    repo = Path(__file__).resolve().parent.parent
    ap.add_argument("--site", type=Path, default=repo / "_site")
    args = ap.parse_args()
    if not args.site.is_dir():
        print(f"Нет каталога сайта: {args.site} (сначала helpers/build_site.py)",
              file=sys.stderr)
        return 1
    bad = 0
    for f in sorted(args.site.rglob("*.html")):
        for href in re.findall(r'href="([^"]+)"', f.read_text(encoding="utf-8")):
            if href.startswith(("http://", "https://", "#", "mailto:")):
                continue
            if not (f.parent / href).resolve().exists():
                print(f"БИТАЯ ССЫЛКА: {f.relative_to(args.site)} -> {href}")
                bad = bad + 1
    print("Ссылки в порядке" if bad == 0 else f"Битых ссылок: {bad}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
