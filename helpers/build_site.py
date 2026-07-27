#!/usr/bin/env python3
"""Генератор статического сайта «Йорик».

Читает items/*.md с Type: performance, строит взаимосвязанный сайт на русском:
спектакли ↔ люди ↔ произведения ↔ театры и сцены. Пишет в _site/ (гитигнорится;
никогда не редактировать руками — это генерируемое представление items/).

Запуск: python3 helpers/build_site.py [--items items] [--out _site]
Только стандартная библиотека Python 3.
"""

import argparse
import html
import json
import re
import shutil
import sys
from datetime import date
from collections import defaultdict
from pathlib import Path

FIELD_RE = re.compile(r"^\s*(?:[-*]\s*)?\*\*(.+?):\*\*\s*(.*)$")
ROLE_RE = re.compile(r"^\s*[-*]\s+(.+?)\s+—\s+(.+)$")
SECTION_RE = re.compile(r"^##\s+(.+?)\s*$")
COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)

TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "i", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}

CSS = """
:root { --bg: #ffffff; --fg: #1a1a1a; --muted: #666; --line: #e0e0e0;
        --accent: #7a1f2b; --accent-bg: #faf6f3; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #17181a; --fg: #e8e6e3; --muted: #999; --line: #33353a;
          --accent: #d98a94; --accent-bg: #1f2023; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg);
       font: 17px/1.6 Georgia, "Times New Roman", serif; }
header { border-bottom: 1px solid var(--line); background: var(--accent-bg); }
.wrap { max-width: 56rem; margin: 0 auto; padding: 0 1.25rem; }
header .wrap { display: flex; flex-wrap: wrap; align-items: baseline;
               gap: 0.5rem 1.5rem; padding: 1rem 1.25rem; }
.brand { font-weight: bold; font-size: 1.15rem; color: var(--fg);
         text-decoration: none; }
.tagline { font-style: italic; color: var(--muted); font-size: 0.9rem; }
nav { display: flex; flex-wrap: wrap; gap: 1rem; }
nav a { color: var(--muted); text-decoration: none; }
nav a:hover, nav a.here { color: var(--accent); }
main { padding: 1.5rem 0 3rem; }
h1 { font-size: 1.7rem; line-height: 1.25; margin: 0.5rem 0 0.25rem; }
h2 { font-size: 1.15rem; margin-top: 1.75rem; border-bottom: 1px solid var(--line);
     padding-bottom: 0.2rem; }
a { color: var(--accent); }
.meta { color: var(--muted); margin: 0 0 1rem; }
table { border-collapse: collapse; width: 100%; }
.tablewrap { overflow-x: auto; }
th, td { text-align: left; padding: 0.4rem 0.75rem 0.4rem 0; vertical-align: top;
         border-bottom: 1px solid var(--line); }
th { color: var(--muted); font-weight: normal; font-size: 0.85rem; }
td:first-child, th:first-child { white-space: nowrap; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; }
dt { color: var(--muted); }
dd { margin: 0; }
ul.plain { list-style: none; padding: 0; }
ul.plain li { padding: 0.2rem 0; }
.empty { color: var(--muted); font-style: italic; margin: 2rem 0; }
a.recurring { font-weight: 700; }
.count { color: var(--muted); font-size: 0.82em; margin-left: 0.15em; }
.filter-row { margin: 0 0 1rem; }
.filter-row label { cursor: pointer; }
a.has-tip { position: relative; }
a.has-tip .tip {
  display: none; position: absolute; left: 0; bottom: 100%; margin-bottom: 0.4rem;
  z-index: 10; background: var(--accent-bg); border: 1px solid var(--line);
  border-radius: 0.4rem; padding: 0.5rem 0.6rem; width: max-content; max-width: 16rem;
  font-weight: normal; font-size: 0.85rem; color: var(--fg);
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
a.has-tip:hover .tip, a.has-tip:focus .tip { display: block; }
a.has-tip .tip img { display: block; width: 64px; height: 64px; object-fit: cover;
                      border-radius: 0.3rem; margin-bottom: 0.35rem; }
.profile { display: flex; gap: 1rem; align-items: flex-start; margin: 1rem 0; }
.profile .portrait { width: 120px; height: 120px; object-fit: cover; border-radius: 0.5rem; flex: none; }
.profile p { margin: 0; }
"""

NAV = [
    ("index.html", "Представления"),
    ("lyudi/index.html", "Участники"),
    ("proizvedeniya/index.html", "Произведения"),
    ("sceny/index.html", "Театры и сцены"),
]


def slugify(text: str) -> str:
    out = []
    for ch in text.lower():
        if ch in TRANSLIT:
            out.append(TRANSLIT[ch])
        elif ch.isalnum() and ch.isascii():
            out.append(ch)
        else:
            out.append("-")
    slug = re.sub(r"-+", "-", "".join(out)).strip("-")
    return slug or "x"


def esc(text: str) -> str:
    return html.escape(text, quote=True)


class Performance:
    def __init__(self, path: Path, fields: dict, sections: dict):
        self.path = path
        self.slug = slugify(path.stem)
        self.title = fields.get("Название", path.stem)
        self.genre = fields.get("Жанр", "")
        self.author = fields.get("Автор", "")
        self.theatre = fields.get("Театр", "")
        self.scene = fields.get("Сцена", "")
        self.date = fields.get("Дата", "")
        self.playbill = fields.get("Программка", "")
        self.source = fields.get("Источник", "")
        self.description = fields.get("Описание", "")
        self.status = fields.get("Status", "active")
        self.staff = parse_roles(sections.get("Постановщики", []))
        self.cast = parse_roles(sections.get("Состав", []))
        self.program = parse_program(sections.get("Программа", []))
        self.impressions = "\n".join(sections.get("Впечатления", [])).strip()

    @property
    def venue_label(self):
        if self.theatre and self.scene:
            return f"{self.theatre} · {self.scene}"
        return self.theatre or self.scene

    def people(self):
        """(имя, роль) для всех участников, включая автора(ов)."""
        seen = []
        if self.author:
            seen.append((clean_name(self.author), "автор"))
        for author, _title in self.program:
            seen.append((author, "автор"))
        for role, names in self.staff + self.cast:
            for name in names:
                seen.append((name, role))
        return seen


def clean_name(name: str) -> str:
    return re.sub(r"\s*\(.*?\)\s*", " ", name).strip()


def parse_roles(lines):
    roles = []
    for line in lines:
        m = ROLE_RE.match(line)
        if not m:
            continue
        role = m.group(1).strip()
        names = [clean_name(n) for n in m.group(2).split(",") if n.strip()]
        if role.startswith("<") or any(n.startswith("<") for n in names):
            continue  # незаполненная строка из шаблона
        roles.append((role, names))
    return roles


def parse_program(lines):
    """«Автор — Название произведения», по одному произведению в строке (сборные концерты)."""
    program = []
    for line in lines:
        m = ROLE_RE.match(line)
        if not m:
            continue
        author = clean_name(m.group(1).strip())
        title = m.group(2).strip()
        if author.startswith("<") or title.startswith("<"):
            continue  # незаполненная строка из шаблона
        program.append((author, title))
    return program


def parse_item(path: Path):
    text = COMMENT_RE.sub("", path.read_text(encoding="utf-8"))
    fields, sections, current = {}, defaultdict(list), None
    for line in text.splitlines():
        sm = SECTION_RE.match(line)
        if sm:
            current = sm.group(1)
            continue
        fm = FIELD_RE.match(line)
        if fm and current in (None, "Facts"):
            value = fm.group(2).strip()
            if not value.startswith("<"):
                fields[fm.group(1).strip()] = value
            continue
        if current:
            sections[current].append(line)
    return fields, sections


def load_performances(items_dir: Path):
    perfs = []
    for path in sorted(items_dir.glob("*.md")):
        if path.name.startswith("_"):
            continue
        fields, sections = parse_item(path)
        if fields.get("Type") != "performance":
            continue
        perfs.append(Performance(path, fields, sections))
    perfs.sort(key=lambda p: p.date, reverse=True)
    return perfs


def load_people_profiles(people_dir: Path):
    """people/*.md — необязательные профили (био/фото) для людей (встреченных повторно, или
    авторов/коллективов, которые заводятся всегда — см. people/_template.md)."""
    profiles = {}
    if not people_dir.is_dir():
        return profiles
    for path in sorted(people_dir.glob("*.md")):
        if path.name.startswith("_"):
            continue
        fields, _sections = parse_item(path)
        if fields.get("Type") not in ("person", "collective"):
            continue
        name = fields.get("Имя", "").strip()
        if not name:
            continue
        profiles[name] = {
            "photo": fields.get("Фото", "").strip(),
            "short_bio": fields.get("Коротко", "").strip(),
            "bio": fields.get("Био", "").strip(),
        }
    return profiles


def load_venue_profiles(venues_path: Path):
    """inventory/venues.md — короткое описание на театр в целом (не на отдельную сцену):
    первый абзац текста под каждым заголовком «## <Театр>», до списка сцен/адресов."""
    profiles = {}
    if not venues_path.is_file():
        return profiles
    text = COMMENT_RE.sub("", venues_path.read_text(encoding="utf-8"))
    for block in re.split(r"(?m)^## ", text)[1:]:
        lines = block.split("\n")
        theatre = lines[0].strip()
        desc_lines = []
        for line in lines[1:]:
            stripped = line.strip()
            if stripped.startswith("-"):
                break
            if not stripped:
                if desc_lines:
                    break
                continue
            desc_lines.append(stripped)
        if theatre and desc_lines:
            profiles[theatre] = " ".join(desc_lines)
    return profiles


def load_work_profiles(works_dir: Path):
    """works/*.md — необязательные профили (описание/либретто) для произведений."""
    profiles = {}
    if not works_dir.is_dir():
        return profiles
    for path in sorted(works_dir.glob("*.md")):
        if path.name.startswith("_"):
            continue
        fields, _sections = parse_item(path)
        if fields.get("Type") != "work":
            continue
        title = fields.get("Название", "").strip()
        if not title:
            continue
        profiles[title] = {
            "author": fields.get("Автор", "").strip(),
            "genre": fields.get("Жанр", "").strip(),
            "description": fields.get("Описание", "").strip(),
            "libretto": fields.get("Либретто", "").strip(),
        }
    return profiles


def page(root: str, title: str, active: str, body: str) -> str:
    nav_parts = []
    for href, label in NAV:
        cls = ' class="here"' if href == active else ""
        nav_parts.append(f'<a href="{root}{href}"{cls}>{label}</a>')
    nav = "\n".join(nav_parts)
    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)} — Йорик</title>
<style>{CSS}</style>
</head>
<body>
<header><div class="wrap">
  <a class="brand" href="{root}index.html">Йорик</a>
  <span class="tagline">Я знал его…</span>
  <nav>{nav}</nav>
</div></header>
<main><div class="wrap">
{body}
</div></main>
</body>
</html>
"""


def link_person(root, name, count=None, profiles=None):
    cls_parts = []
    tip = ""
    if count and count > 1:
        cls_parts.append("recurring")
        profile = (profiles or {}).get(name)
        if profile and (profile.get("photo") or profile.get("short_bio")):
            cls_parts.append("has-tip")
            img = f'<img src="{root}{esc(profile["photo"])}" alt="">' if profile.get("photo") else ""
            text = f'<span class="tip-text">{esc(profile["short_bio"])}</span>' if profile.get("short_bio") else ""
            tip = f'<span class="tip">{img}{text}</span>'
    cls = f' class="{" ".join(cls_parts)}"' if cls_parts else ""
    return f'<a href="{root}lyudi/{slugify(name)}.html"{cls}>{esc(name)}{tip}</a>'


def perf_count(entries):
    """Число РАЗНЫХ спектаклей, а не число ролей — один человек с двумя ролями в одном
    спектакле (напр. «режиссёр-постановщик, художник по костюмам») — это одна встреча,
    не две."""
    return len({p.slug for _role, p in entries})


def person_ref(root, name, people, profiles=None):
    """Ссылка на человека + бейдж числа встреч, если их больше одной (списки на странице спектакля)."""
    count = perf_count(people.get(name, []))
    link = link_person(root, name, count, profiles)
    return f'{link} <span class="count">×{count}</span>' if count > 1 else link


def link_perf(root, p):
    return f'<a href="{root}spektakli/{p.slug}.html">{esc(p.title)}</a>'


def link_work(root, title, count=None):
    cls = ' class="recurring"' if count and count > 1 else ""
    return f'<a href="{root}proizvedeniya/{slugify(title)}.html"{cls}>{esc(title)}</a>'


def link_theatre(root, theatre):
    return f'<a href="{root}sceny/{slugify(theatre)}.html">{esc(theatre)}</a>'


def perf_row(root, p, show_venue=True):
    cells = f"<td>{esc(p.date)}</td><td>{link_perf(root, p)}</td><td>{esc(p.genre)}</td>"
    if show_venue:
        venue = ""
        if p.theatre:
            venue = link_theatre(root, p.theatre)
            if p.scene:
                venue += f" · {esc(p.scene)}"
        cells += f"<td>{venue}</td>"
    return f"<tr>{cells}</tr>"


def perf_table(root, perfs, show_venue=True):
    rows = "\n".join(perf_row(root, p, show_venue) for p in perfs)
    header = "<tr><th>Дата</th><th>Название</th><th>Жанр</th>"
    if show_venue:
        header += "<th>Театр / Сцена</th>"
    header += "</tr>"
    return f'<div class="tablewrap"><table>{header}{rows}</table></div>'


def render_impressions(text: str) -> str:
    paras = [f"<p>{esc(par.strip())}</p>" for par in re.split(r"\n\s*\n", text) if par.strip()]
    return "\n".join(paras)


def build(items_dir: Path, out_dir: Path) -> int:
    perfs = load_performances(items_dir)
    profiles = load_people_profiles(items_dir.parent / "people")
    work_profiles = load_work_profiles(items_dir.parent / "works")
    venue_profiles = load_venue_profiles(items_dir.parent / "inventory" / "venues.md")

    people = defaultdict(list)   # имя -> [(роль, perf)]
    works = defaultdict(list)    # название -> [perf]
    theatres = defaultdict(list) # театр -> [perf]
    for p in perfs:
        for name, role in p.people():
            people[name].append((role, p))
        if p.program:
            # Сборный концерт — не единое произведение; индексируем каждое из программы.
            for _author, work_title in p.program:
                works[work_title].append(p)
        else:
            works[p.title].append(p)
        if p.theatre:
            theatres[p.theatre].append(p)

    out_dir.mkdir(parents=True, exist_ok=True)
    for sub in ("spektakli", "lyudi", "proizvedeniya", "sceny"):
        (out_dir / sub).mkdir(exist_ok=True)
    (out_dir / ".nojekyll").write_text("")

    # Сканы программок — чтобы ссылки «скан» работали на опубликованном сайте
    playbills = items_dir.parent / "playbills"
    if playbills.is_dir():
        shutil.copytree(playbills, out_dir / "playbills", dirs_exist_ok=True)

    # Фото людей (people/photos/) — миниатюры для карточек и подсказок при наведении
    people_photos = items_dir.parent / "people" / "photos"
    if people_photos.is_dir():
        shutil.copytree(people_photos, out_dir / "people" / "photos", dirs_exist_ok=True)

    # Главная — хронология спектаклей
    if perfs:
        body = f"<h1>Представления</h1><p class=\"meta\">Всего: {len(perfs)}</p>" + perf_table("", perfs)
    else:
        body = ("<h1>Представления</h1><p class=\"empty\">Архив пока пуст — добавьте первый "
                "спектакль в items/ по шаблону items/_template_performance.md.</p>")
    (out_dir / "index.html").write_text(page("", "Представления", "index.html", body), encoding="utf-8")

    # Страницы спектаклей
    for p in perfs:
        root = "../"
        facts = []
        if p.title and not p.program:
            facts.append(("Произведение", link_work(root, p.title, len(works.get(p.title, [])))))
        if p.genre:
            facts.append(("Жанр", esc(p.genre)))
        if p.author and not p.program:
            author_name = clean_name(p.author)
            facts.append(("Автор", link_person(root, author_name, perf_count(people.get(author_name, [])), profiles)))
        if p.theatre:
            venue = link_theatre(root, p.theatre)
            if p.scene:
                venue += f" · {esc(p.scene)}"
            facts.append(("Театр / Сцена", venue))
        if p.date:
            facts.append(("Дата", esc(p.date)))
        if p.playbill:
            paths = [x.strip() for x in p.playbill.split(",") if x.strip()]
            links = []
            for i, path in enumerate(paths):
                if path.startswith("http"):
                    links.append(f'<a href="{esc(path)}">ссылка</a>')
                else:
                    label = "скан" if len(paths) == 1 else f"скан {i + 1}"
                    links.append(f'<a href="{root}{esc(path)}">{label}</a>')
            facts.append(("Программка", ", ".join(links)))
        if p.source:
            facts.append(("Источник", f'<a href="{esc(p.source)}">страница спектакля</a>'))
        if p.status == "retired":
            facts.append(("Статус", "в архиве (retired)"))
        dl = "".join(f"<dt>{k}</dt><dd>{v}</dd>" for k, v in facts)
        body = [f"<h1>{esc(p.title)}</h1>",
                f'<p class="meta">{esc(p.venue_label)}{" · " + esc(p.date) if p.date else ""}</p>',
                f"<dl>{dl}</dl>"]
        if p.description:
            body.append(f"<p>{esc(p.description)}</p>")
        if p.program:
            rows = "".join(
                f"<li>{person_ref(root, author, people, profiles)} — "
                f"{link_work(root, title, len(works.get(title, [])))}</li>"
                for author, title in p.program)
            body.append(f'<h2>Программа</h2><ul class="plain">{rows}</ul>')
        if p.staff:
            rows = "".join(
                f"<li>{esc(role)} — " + ", ".join(person_ref(root, n, people, profiles) for n in names) + "</li>"
                for role, names in p.staff)
            body.append(f'<h2>Постановщики</h2><ul class="plain">{rows}</ul>')
        if p.cast:
            rows = "".join(
                f"<li>{esc(role)} — " + ", ".join(person_ref(root, n, people, profiles) for n in names) + "</li>"
                for role, names in p.cast)
            body.append(f'<h2>Состав</h2><ul class="plain">{rows}</ul>')
        if p.impressions:
            body.append(f"<h2>Впечатления</h2>{render_impressions(p.impressions)}")
        (out_dir / "spektakli" / f"{p.slug}.html").write_text(
            page(root, p.title, "", "\n".join(body)), encoding="utf-8")

    # Участники
    root = "../"
    if people:
        rows = "".join(
            f'<li data-count="{perf_count(entries)}">{link_person(root, name, perf_count(entries), profiles)} '
            f'<span class="meta">({perf_count(entries)})</span></li>'
            for name, entries in sorted(people.items()))
        filter_ui = (
            '<p class="filter-row"><label>'
            '<input type="checkbox" id="filter-recurring" checked> '
            'Только те, кого встречали больше одного раза</label></p>'
        )
        script = """<script>
(function () {
  var cb = document.getElementById("filter-recurring");
  var items = document.querySelectorAll("#people-list li");
  function apply() {
    items.forEach(function (li) {
      var show = !cb.checked || parseInt(li.dataset.count, 10) > 1;
      li.style.display = show ? "" : "none";
    });
  }
  cb.addEventListener("change", apply);
  apply();
})();
</script>"""
        body = f'<h1>Участники</h1>{filter_ui}<ul class="plain" id="people-list">{rows}</ul>{script}'
    else:
        body = '<h1>Участники</h1><p class="empty">Пока никого — участники появятся из программок.</p>'
    (out_dir / "lyudi" / "index.html").write_text(
        page(root, "Участники", "lyudi/index.html", body), encoding="utf-8")
    for name, entries in people.items():
        items = "".join(
            f"<li>{esc(role)} — {link_perf(root, p)} "
            f"<span class=\"meta\">({esc(p.date)}, {esc(p.venue_label)})</span></li>"
            for role, p in sorted(entries, key=lambda e: e[1].date, reverse=True))
        profile = profiles.get(name)
        header = ""
        if profile and (profile.get("photo") or profile.get("bio")):
            img = f'<img class="portrait" src="{root}{esc(profile["photo"])}" alt="{esc(name)}">' if profile.get("photo") else ""
            bio = f'<p>{esc(profile["bio"])}</p>' if profile.get("bio") else ""
            header = f'<div class="profile">{img}{bio}</div>'
        body = f'<h1>{esc(name)}</h1>{header}<ul class="plain">{items}</ul>'
        (out_dir / "lyudi" / f"{slugify(name)}.html").write_text(
            page(root, name, "lyudi/index.html", body), encoding="utf-8")

    # Произведения
    if works:
        rows = "".join(
            f"<li>{link_work('', title, len(ps)).replace('proizvedeniya/', '')} "
            f"<span class=\"meta\">({len(ps)})</span></li>"
            for title, ps in sorted(works.items()))
        body = f'<h1>Произведения</h1><ul class="plain">{rows}</ul>'
    else:
        body = '<h1>Произведения</h1><p class="empty">Пока пусто.</p>'
    (out_dir / "proizvedeniya" / "index.html").write_text(
        page(root, "Произведения", "proizvedeniya/index.html", body), encoding="utf-8")
    for title, ps in works.items():
        authors = set()
        for p in ps:
            if p.program:
                authors.update(a for a, t in p.program if t == title)
            elif p.author:
                authors.add(clean_name(p.author))
        authors = sorted(authors)
        meta = ""
        if authors:
            meta = ('<p class="meta">Автор: '
                    + ", ".join(link_person(root, a, perf_count(people.get(a, [])), profiles) for a in authors) + "</p>")
        profile = work_profiles.get(title)
        details = ""
        if profile and (profile.get("description") or profile.get("libretto")):
            desc = f'<p>{esc(profile["description"])}</p>' if profile.get("description") else ""
            libretto = (f'<h2>Либретто</h2>{render_impressions(profile["libretto"])}'
                        if profile.get("libretto") else "")
            details = f"{desc}{libretto}"
        body = f"<h1>{esc(title)}</h1>{meta}{details}" + perf_table(root, ps)
        (out_dir / "proizvedeniya" / f"{slugify(title)}.html").write_text(
            page(root, title, "proizvedeniya/index.html", body), encoding="utf-8")

    # Театры и сцены
    if theatres:
        rows = ""
        for theatre, ps in sorted(theatres.items()):
            scenes = sorted({p.scene for p in ps if p.scene})
            scenes_txt = f' <span class="meta">— {esc(", ".join(scenes))}</span>' if scenes else ""
            rows += (f"<li>{link_theatre('', theatre).replace('sceny/', '')} "
                     f"<span class=\"meta\">({len(ps)})</span>{scenes_txt}</li>")
        body = f'<h1>Театры и сцены</h1><ul class="plain">{rows}</ul>'
    else:
        body = '<h1>Театры и сцены</h1><p class="empty">Пока пусто.</p>'
    (out_dir / "sceny" / "index.html").write_text(
        page(root, "Театры и сцены", "sceny/index.html", body), encoding="utf-8")
    for theatre, ps in theatres.items():
        parts = [f"<h1>{esc(theatre)}</h1>"]
        if venue_profiles.get(theatre):
            parts.append(f"<p>{esc(venue_profiles[theatre])}</p>")
        scenes = sorted({p.scene for p in ps if p.scene})
        for scene in scenes:
            scoped = [p for p in ps if p.scene == scene]
            parts.append(f"<h2>{esc(scene)}</h2>" + perf_table(root, scoped, show_venue=False))
        unscoped = [p for p in ps if not p.scene]
        if unscoped:
            title = "Без указания сцены" if scenes else "Представления"
            parts.append(f"<h2>{title}</h2>" + perf_table(root, unscoped, show_venue=False))
        (out_dir / "sceny" / f"{slugify(theatre)}.html").write_text(
            page(root, theatre, "sceny/index.html", "\n".join(parts)), encoding="utf-8")

    # Машинный индекс — его читает телеграм-бот (bot/worker.js) для функции
    # «вы уже встречали»: люди сопоставляются по точному совпадению имени.
    (out_dir / "data").mkdir(exist_ok=True)
    index = {
        "generated": date.today().isoformat(),
        "performances": [
            {"slug": p.slug, "title": p.title, "date": p.date, "genre": p.genre,
             "theatre": p.theatre, "scene": p.scene}
            for p in perfs
        ],
        "people": {
            name: [{"role": role, "title": p.title, "date": p.date, "slug": p.slug}
                   for role, p in entries]
            for name, entries in sorted(people.items())
        },
        "works": {
            title: {"documented": title in work_profiles}
            for title in sorted(works)
        },
        "profiled_people": sorted(profiles.keys()),
        "venues": {
            theatre: {"documented": theatre in venue_profiles}
            for theatre in sorted(theatres)
        },
    }
    (out_dir / "data" / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"Собрано: {len(perfs)} спектаклей, {len(people)} людей, "
          f"{len(works)} произведений, {len(theatres)} театров → {out_dir}/")
    return 0


def main():
    ap = argparse.ArgumentParser(description="Сборка сайта «Йорик» из items/")
    repo = Path(__file__).resolve().parent.parent
    ap.add_argument("--items", type=Path, default=repo / "items")
    ap.add_argument("--out", type=Path, default=repo / "_site")
    args = ap.parse_args()
    if not args.items.is_dir():
        print(f"Нет каталога items: {args.items}", file=sys.stderr)
        return 1
    return build(args.items, args.out)


if __name__ == "__main__":
    sys.exit(main())
