# Session: works-descriptions

**Date:** 2026-07-27
**Type:** planned
**Items:** works/ (new organ), items/*.md, helpers/build_site.py, bot/worker.js

<!-- Type is exactly `planned` or `out-of-band` — no other values. Describe what kind of
     session this was in Goal/Discovery, not here. -->

---

## Goal / Discovery

Operator asked for short descriptions (and librettos/plot synopses where appropriate) to be
added to events (performances) and compositions, a one-time backfill run across the existing
archive, and the same acquisition folded into the ongoing playbill-ingestion rules and bot code
going forward.

## Steps & Findings

- Confirmed via `AskUserQuestion` before building anything: libretto scope = plot synopsis (not
  verbatim text); composition-level facts get a new `works/<slug>.md` entity mirroring the
  existing `people/` pattern (matched by exact title, like people are matched by exact name);
  events additionally get their own short **Описание** field distinct from the composition's.
- Discovered compositions had no durable entity at all — `helpers/build_site.py` computes the
  `/proizvedeniya/` grouping purely in memory from item titles at build time. Built the new
  `works/` organ (`_template.md`, `Type: work`) to hold it.
- Added `load_work_profiles()` to `build_site.py` (parallel to `load_people_profiles()`),
  rendered Описание/Либретто on work pages and Описание on performance pages, and exposed
  `works: {title: {documented}}` in `data/index.json` so the bot can tell what's already
  documented.
- While computing the exact distinct-work list (`(title, author)` grouping via the project's
  own `load_performances()`, not a hand grep) found a real pre-existing bot-ingestion bug:
  `items/2024-10-13_..._simfoniya-6.md` had three separate concert pieces (Tchaikovsky,
  Prokofiev, Shostakovich) concatenated into one `Название` field instead of using
  `## Программа` — fixed by splitting it into a proper program list.
- While writing `works/*.md` Автор fields, found genitive-case `Автор` values in six items
  (Вагнер/Парсифаль, Моцарт/Похищение из сераля, Дебюсси/Пеллеас и Мелизанда,
  Бриттен/Сон в летнюю ночь 2023-05-18, Штраус/Летучая мышь, Адан/Жизель) — these silently
  fragment the site's person cross-linking (exact-string match), inflating "recurring person"
  counts by counting the same author as two different people. Fixed all six to nominative case;
  rebuild confirmed the fix merged 4 previously-duplicated author identities (357 → 353 distinct
  people). Also strengthened `PARSE_PROMPT` in `bot/worker.js` to explicitly require nominative
  case for `author`/`program[].author`, so future ingestions don't reintroduce this.
- Verified the handful of less-common/contemporary works (Kevin Volans' *Crossing the
  Atlantic*, John Luther Adams' *Dark Waves*, Alexander Tchaikovsky's *Король шахмат*, Valery
  Kikta's *Шотландская рапсодия*, Eduard Kiprsky's *Вальс на свидание*, Vinko Globokar's
  *Диалог о Земле*) via web search rather than writing from memory; Globokar's piece had no
  verifiable programme-specific detail, so its description stays generic about the composer's
  style rather than inventing specifics about this particular work.
- Wrote all 53 `works/<slug>.md` files (description + libretto/synopsis for opera/ballet/drama
  works; description only for symphonies, concert pieces, folk/medieval instrumental numbers —
  per the "librettos where appropriate" scope) and added a short **Описание** to all 32 existing
  `items/*.md`, synthesized only from facts already present in each file (cast, conductor,
  cycle, staging year) — no new facts invented.
- Extended `bot/worker.js`: on every ingestion, checks the published `data/index.json` for
  undocumented compositions (`worksOf()` + `undocumentedWorks()`), drafts description/libretto
  via a second Claude call (`draftWorkNotes()`, explicitly instructed to return empty fields
  rather than guess at unfamiliar titles), shows the draft in the confirmation preview
  (`🎼 Новые произведения…`), and commits `works/<slug>.md` alongside the rest only on the
  operator's ✅ tap — same confirmation gate as everything else, per
  P-operator-confirms-automated-writes. Updated `AGENTS.md`'s bot-commit-scope line to include
  `works/`, and `runbook/bot.md` with the new behavior. Deployed twice (once for the works
  feature, once more for the Автор-case prompt fix).
- Proposed and the operator ratified a new principle, `P-shared-facts-own-entity` (see
  PRINCIPLES.md): recurring-entity facts (person, composition, and now confirmed twice as a
  pattern) get their own file matched by exact-string identity, never duplicated inline into
  every event record.

## Changes Made

- `works/_template.md` (new organ): `Type: work`, Facts include Название/Автор/Жанр/Описание/
  Либретто, matched to items by exact title.
- `works/*.md` (53 new files): description (+ libretto/synopsis where the work has a plot) for
  every distinct composition across the archive.
- `items/_template_performance.md`: added optional **Описание** field (event-level blurb,
  distinct from the composition's own description).
- `items/*.md` (32 files): added **Описание**; 6 of these also had their **Автор** field
  corrected from genitive to nominative case; `2024-10-13_..._simfoniya-6.md` also had its
  jammed multi-work Название split into `## Программа`.
- `helpers/build_site.py`: `Performance.description`, `load_work_profiles()`, description/
  libretto rendering on performance and work pages, `works` key in `data/index.json`.
- `bot/worker.js`: `worksOf()`, `undocumentedWorks()`, `draftWorkNotes()`, `renderWork()`;
  wired into `proposeIngest()`/`confirmIngest()`/`preview()`; `PARSE_PROMPT` now requires
  nominative case for author fields. Deployed via `npx wrangler deploy`.
- `AGENTS.md`: folder-structure diagram gained `works/`; bot-commit-scope bullet now includes
  `works/`.
- `runbook/bot.md`: documented the composition-description/libretto behavior and the
  `works/<slug>.md` commit path.
- `PRINCIPLES.md`: added `P-shared-facts-own-entity` (operator-ratified).

## Open Items

- [ ] None outstanding. The backfill covers all 32 existing items and 53 distinct compositions;
      going forward the bot handles new compositions automatically (with operator confirmation).

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
      as `discovery_*` — not lost to summarization (none — the `works/*.md` files are themselves
      the durable distillation, consistent with how `people/*.md` was handled)
- [x] Structure validated against `sessions/_template.md` (re-read it — do not trust memory;
      when the lint organ exists per GROWTH.md, run it instead)
- [x] `git commit` — stage all changed files; message: `works: add composition descriptions/
      librettos + event descriptions, fold into bot ingestion`. **Tick this box in the same edit
      that stages the commit** — its `[x]` state must be written *before* `git add`, because
      this commit freezes the file and the box can never be ticked afterward.

## Retrospective

- Lesson: a bot-ingested concert item had three works concatenated into one `Название` field
  instead of `## Программа` — a one-off LLM parsing slip, not yet a recurring pattern (trigger
  for a lint/validation organ hasn't fired per GROWTH.md's "mechanize late"). → fixed directly
  in the item; no new tooling built, since this is a single observed occurrence [project data].
- Lesson: genitive-case `Автор` values (from six items) were silently fragmenting the site's
  person cross-linking by exact-string match, inflating recurring-person counts. → fixed in the
  six items, and `bot/worker.js` `PARSE_PROMPT` strengthened to require nominative case going
  forward, so the ingestion pipeline itself now prevents recurrence [project mind/code].
- Pain axis: no repeated manual toil this session — the volume was content-authoring (53 work
  profiles + 32 event blurbs), not a fiddly repeated command; generated via one-off Python
  scripts in the scratchpad, not durable helpers, since this was a one-time backfill.
- Principle: resolving "where do composition facts live" by extending the existing `people/`
  pattern is now a two-instance pattern (person, composition) rather than a one-off design
  choice. → proposed to operator and ratified as `P-shared-facts-own-entity` in `PRINCIPLES.md`
  [project mind].
