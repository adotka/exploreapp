# Session: ingest-mariinsky-2026-07

**Date:** 2026-07-22
**Type:** planned
**Items:** Бенвенуто Челлини (2026-07-07), Лакме (2026-07-06)

<!-- Type is exactly `planned` or `out-of-band` — no other values. Describe what kind of
     session this was in Goal/Discovery, not here. -->

---

## Goal / Discovery

First real ingestion: the operator supplied two Mariinsky playbill links
(mariinsky.ru/playbill/…/2026/7/7/2_1900/ and …/2026/7/6/3_1900/). Ingest both per
runbook/ingest-playbill.md and verify the site interlinks them.

## Steps & Findings

- Checked `kb/` — no Mariinsky notes existed yet.
- Fetched both pages (WebFetch); saved the extractions verbatim as
  `discovery_mariinsky_benvenuto-chellini.txt` and `discovery_mariinsky_lakme.txt` in the
  session artifact dir — afisha pages are volatile.
- **Бенвенуто Челлини** — опера Гектора Берлиоза, Мариинский-2, 2026-07-07 19:00; дирижёр
  Кристиан Кнапп, режиссёр-постановщик Алексей Франдетти; 6 исполнителей записаны.
- **Лакме** — опера Лео Делиба, Концертный зал, 2026-07-06 19:00; дирижёр Кристиан Кнапп,
  режиссёр адаптации Анна Шишкина; 4 исполнителя записаны; на французском с русскими титрами.
- Both venue scenes matched `inventory/venues.md` verbatim (Мариинский-2, Концертный зал) —
  no registry change needed.
- Discovered the mariinsky.ru URL structure encodes date, time, and scene
  (`<сцена>_<ЧЧММ>`: 2 = Мариинский-2, 3 = Концертный зал, both confirmed) → `kb/`.
- Playbills carried fields absent from the performance template (Либретто, Время, Язык,
  Продолжительность, Премьера); recorded them as extra fact lines — the generator ignores
  unknown fields gracefully, data preserved in the source of truth.
- Site rebuilt: 2 спектаклей, 22 людей, 2 произведений, 1 театр; all internal links verified;
  cross-linking confirmed — Кристиан Кнапп and Ярослав Петряник each aggregate both operas.

## Changes Made

- `items/2026-07-07_mariinsky_benvenuto-chellini.md`, `items/2026-07-06_mariinsky_lakme.md` —
  created from `items/_template_performance.md`.
- `inventory/performances.md` — two rows added.
- `kb/mariinsky-playbill-urls.md` — new note (URL structure, scene codes, volatility warning).
- `items/_template_performance.md` — optional fields added (Либретто, Время, Язык,
  Продолжительность, Премьера) — operator-approved.
- Session artifact dir with two `discovery_*` files.

## Open Items

- [ ] Scene code `1` (предположительно Историческая сцена) unconfirmed — verify on the first
      such link (noted in kb/mariinsky-playbill-urls.md).
- [ ] Впечатления sections are empty — operator may dictate impressions for either evening in
      a future session (items stay editable; only sessions are immutable).

---

## Closing Checklist

- [x] "Changes Made" filled in
- [x] Retrospective done **and fully resolved before this commit** (it is a gate, not a note):
      all three axes scanned (lessons · repeated operational pain · surfaced **principles**);
      each **routed into a durable artifact** — owning artifact amended and the edit applied
      (project-mind/PRINCIPLES.md edits got the operator's approval *and* were applied), a task
      opened, or explicitly declined — and logged as a one-line disposition in
      `## Retrospective` below. **No item may be left unconfirmed or carried forward.**
- [x] Artifacts saved: bulky raw output worth reading twice is in `sessions/YYYY-MM-DD_topic/`
      as `discovery_*` — not lost to summarization
- [x] Structure validated against `sessions/_template.md` (re-read it — do not trust memory;
      when the lint organ exists per GROWTH.md, run it instead)
- [x] `git commit` — stage all changed files; message: `mariinsky: ingest July 2026 playbills`.
      **Tick this box in the same edit that stages the commit** — its `[x]` state must be
      written *before* `git add`, because this commit freezes the file and the box can never
      be ticked afterward.

## Retrospective

- mariinsky.ru URL encodes date/time/scene → kb/mariinsky-playbill-urls.md (added)  [project data]
- Real playbills carry fields the template lacked → items/_template_performance.md optional
  fields added (operator-approved)  [project mind]
- Afisha pages are volatile; extraction must be saved verbatim at fetch time → already covered
  by runbook/session.md step 6 and noted in the kb article (no change)
- Pain axis: two ingestions ran smoothly by hand via the runbook → declined (no recurring toil
  yet; revisit if manual entry grows tedious at higher volume)
- Principles axis: nothing constitution-level surfaced → declined
