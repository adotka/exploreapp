#!/usr/bin/env python3
"""Скачивает фото человека, кадрирует в квадрат и уменьшает до миниатюры для people/photos/.

Требует Pillow (НЕ входит в стандартную библиотеку — в отличие от build_site.py, который
специально остаётся stdlib-only; это разовый инструмент обогащения данных, не часть сборки
сайта). Установка при отсутствии: pip install --user Pillow (или venv, если система
externally-managed).

Использование:
    python3 helpers/fetch_person_photo.py <slug> <url>
    python3 helpers/fetch_person_photo.py mihail-petrenko \
        https://www.mariinsky.ru/images/cms/data/opera_biography/avatar_new/petrenko.jpg

Пишет people/photos/<slug>.jpg (180×180, кадр по центру сверху — портретные фото обычно
компонованы с лицом в верхней части, центрирование по вертикали чаще обрезает голову).
"""
import sys
import urllib.request
from pathlib import Path

SIZE = 180


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    slug, url = sys.argv[1], sys.argv[2]

    try:
        from PIL import Image
    except ImportError:
        print("Pillow не установлен. См. docstring этого файла.", file=sys.stderr)
        sys.exit(1)

    out_dir = Path(__file__).resolve().parent.parent / "people" / "photos"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{slug}.jpg"

    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        raw = resp.read()

    import io
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    im = im.crop((left, 0, left + side, side))
    im = im.resize((SIZE, SIZE), Image.LANCZOS)
    im.save(out_path, quality=82)
    print(f"{out_path}  ({im.size[0]}x{im.size[1]}, {out_path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
