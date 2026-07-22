# Session: theatre-inventory-and-site

**Date:** 2026-07-22
**Type:** planned
**Items:** (schema & site infrastructure — no individual items yet)

<!-- Type is exactly `planned` or `out-of-band` — no other values. Describe what kind of
     session this was in Goal/Discovery, not here. -->

---

## Goal / Discovery

Prepare MindHorizon to receive theatrical experiences (links or scanned playbills) and explore
them: (1) a structured performance schema for `items/` capturing act details — original art
author, regie/staging, date, theatre + scene (e.g. Mariinsky's three), main staff, cast;
(2) inventory registries; (3) a static site generated automatically from `items/`, fully in
Russian, interlinking performances ↔ people ↔ works ↔ venues, deployed via GitHub Actions to
GitHub Pages on every push.

Operator decisions taken this session:
- Deploy: GitHub Actions → GitHub Pages (no generated HTML committed; `_site/` gitignored).
- Language: the entire site in Russian — navigation and content; names recorded as printed in
  the playbill (original language).

## Steps & Findings

- Checked `kb/` — empty, nothing relevant yet.
- Designed the performance schema as `items/_template_performance.md`: engine-level structure
  stays English (`Type`/`Status`, `## Facts`, `## History` — consistent with `_template.md`);
  domain fields and sections are Russian (`Название`, `Жанр`, `Автор`, `Театр`, `Сцена`,
  `Дата`, `## Постановщики`, `## Составы`, `## Впечатления`). Field lines and role lines are
  machine-parseable (`**Ключ:** значение`; `- Роль — Имя`) so the site is generated with zero
  extra markup.
- Created inventory registries: `inventory/performances.md` (summary index of attended acts)
  and `inventory/venues.md` (theatres and their scenes; Mariinsky pre-seeded with its three
  scenes as the operator's named example).
- Added `playbills/` as the evidence layer for source scans, referenced from item files.
- Built `helpers/build_site.py` (Python 3 stdlib only): parses `items/*.md` with
  `Type: performance`, derives people/works/venue pages automatically (no per-person files
  until an item earns one — matches the provisional-assets convention), emits a fully
  interlinked static site in Russian to `_site/` with relative links (works under any Pages
  base path). Graceful empty state before the first playbill arrives.
- Added `.github/workflows/pages.yml`: build on push to main → deploy to GitHub Pages.
- Tested the generator against a synthetic performance in the scratchpad (not committed):
  pages, cross-links, empty-state, and Cyrillic slugs verified.
- Added runbooks: `runbook/ingest-playbill.md` (the recurring procedure the operator announced)
  and `runbook/site.md` (local preview + one-time GitHub Pages setup); indexed in RUNBOOK.md.

## Changes Made

- `items/_template_performance.md` — new performance schema (project mind, operator-approved).
- `inventory/performances.md`, `inventory/venues.md` — new registries.
- `playbills/` created (with `.gitkeep`); AGENTS.md folder tree gained the `playbills/` line
  (project mind, operator-approved).
- `helpers/build_site.py` — static site generator (Russian UI).
- `.github/workflows/pages.yml` — build & deploy to GitHub Pages.
- `runbook/ingest-playbill.md`, `runbook/site.md` added; RUNBOOK.md index updated (project
  mind, operator-approved).
- `.gitignore`: added `/_site/`.

## Open Items

- [ ] Operator: create the GitHub repo, push, and set Pages source to "GitHub Actions"
      (one-time; steps in `runbook/site.md`).
- [ ] First playbill ingestion will exercise `runbook/ingest-playbill.md`; refine it then if
      reality disagrees.

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
      as `discovery_*` — not lost to summarization (none worth keeping — generator test output
      was throwaway scratchpad HTML)
- [x] Structure validated against `sessions/_template.md` (re-read it — do not trust memory;
      when the lint organ exists per GROWTH.md, run it instead)
- [x] `git commit` — stage all changed files; message: `theatre: inventory schema and site
      generator`. **Tick this box in the same edit that stages the commit** — its `[x]` state
      must be written *before* `git add`, because this commit freezes the file and the box can
      never be ticked afterward.

## Retrospective

- Site is a generated view of `items/`; never hand-edit `_site/` → already covered by the
  "single source of truth; edit the canonical file" convention in AGENTS.md (no change)
- Names recorded as printed in the playbill, one consistent full form per person (identity
  discipline for cross-linking) → items/_template_performance.md instructions (added,
  operator-approved with the schema)  [project mind]
- Ingestion will recur every playbill → runbook/ingest-playbill.md (added)  [project mind]
- Lessons axis: no avoidable detours this session → declined (nothing durable beyond the above)
- Pain axis: no repeated toil yet — ingestion hasn't started → declined (revisit after real
  ingestions)
