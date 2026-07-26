# Session: people-enrichment

**Date:** 2026-07-27
**Type:** planned
**Items:** (project mind + project data — a new organ plus its pilot content, no single performance)

<!-- Type is exactly `planned` or `out-of-band` — no other values. Describe what kind of
     session this was in Goal/Discovery, not here. -->

---

## Goal / Discovery

Operator request: start accumulating richer per-person data (photo, full bio, and a very
short tooltip bio) for people met more than once — display photo+bio on the person's own
card page, and a small photo+short-bio tooltip on hover wherever a recurring person is
linked, everywhere on the site. Run a one-time research/backfill pass over the current
recurring-people list, and wire detection of *future* newly-recurring people into the
bot's ingest flow so the operator gets flagged when it's worth researching someone new.

## Steps & Findings

- Scoped the problem: ~90 people currently cross the "recurring" (count > 1) threshold,
  after excluding placeholder entries (`Неизвестный автор` etc.) and collectives
  (orchestras/ensembles). Full backfill of all 90 was too large to do reliably in one pass.
- Cleared two open decisions with the operator before building anything (both change the
  architecture materially): (1) photos — download real photos even for living performers,
  but keep resolution to identification-only size, not full professional resolution; (2)
  scope — pilot the top 15–20 most-frequently-encountered people first, not all 90.
- Designed a new source-of-truth category, `people/<slug>.md`, mirroring the existing
  `items/` convention (Facts fields, copy-the-template discipline, exact-string identity
  matching against `items/*.md`). Photos live in `people/photos/` as small thumbnails
  (180×180, cropped square, ~5–7 KB each) — this repo has no dependency on an image
  library at build time; resizing is a one-off step done with a scratch Pillow venv, not
  part of `helpers/build_site.py` (which stays stdlib-only).
- `helpers/build_site.py`: added `load_people_profiles()`; threaded an optional `profiles`
  dict through `link_person`/`person_ref` everywhere a person is linked (event pages'
  Программа/Постановщики/Состав, the Facts "Автор" row, the Люди index, per-work author
  lines); added a CSS-only hover tooltip (`.tip`, shown on `:hover`/`:focus`, no JS) and a
  `.profile` block (portrait + full bio) on the person's own card page. Also copies
  `people/photos/` into `_site/` alongside the existing `playbills/` copy.
  While wiring this in, simplified away a pre-existing href-shortening hack on the Люди
  index page (`.replace('href="lyudi/', 'href="')`) that would have silently broken photo
  paths on that one page — using the same `root="../"` as every other page removes the
  special case entirely.
- `bot/worker.js`: `confirmIngest` now checks the (pre-rebuild) `index.json` for each
  person in the just-confirmed item; anyone with exactly one prior appearance gets flagged
  in the confirmation message ("👤 Впервые повторно: ..."). The bot only notifies — it does
  not do research or write profiles itself, keeping this inside
  P-operator-confirms-automated-writes' spirit (research/sourcing judgment stays human).
- Validated the whole pipeline end-to-end on one person (Валерий Гергиев) — official
  Mariinsky bio page, downloaded/cropped/resized photo, hand-written profile — before
  committing to the rest, to de-risk the batch run.
- Ran the remaining pilot research as 3 parallel general-purpose agents (research-only, no
  file writes) covering 15 people, plus 4 I located directly from the Mariinsky company
  roster page. Two names in my initial brief turned out to be role mismatches — I had
  assumed "Ирина Соболева" and "Кристина Ларина" were singers; agents correctly identified
  them as a répétiteur/accompanist and a stage director respectively, and I verified this
  against the actual credited roles in `items/*.md` before writing their profiles (both
  confirmed correct — a good example of why "don't fabricate, flag uncertainty" instructions
  to agents pay off).
  One person (Ирина Яцемирская, children's-choir chorus master) had no findable public
  bio or photo anywhere — left un-enriched rather than inventing anything; she stays
  "recurring" on the site with no card content, same as anyone else not yet researched.
- 19 of the pilot 20 got full profiles (photo + bio + short bio + source link); sourced
  overwhelmingly from mariinsky.ru's own official company/roster pages (lowest copyright
  risk per the operator's guidance), Wikipedia for the one historical figure (Wagner,
  public domain portrait).

## Changes Made

- `people/_template.md` — new template (Facts: Имя/Фото/Коротко/Био/Источник).
- `people/*.md` (19 files) + `people/photos/*.jpg` (19 thumbnails) — pilot batch profiles:
  Валерий Гергиев, Михаил Петренко, Андрей Серов, Олег Сычёв, Михаил Векуа, Ирина Соболева,
  Кристина Ларина, Анна Кикнадзе, Евгений Никитин, Юрий Воробьёв, Константин Рылов,
  Ярослав Петряник, Павел Теплов, Глеб Фильштинский, Вячеслав Окунев, Марина Мишук,
  Рихард Вагнер, Кристиан Кнапп, Лариса Гергиева.
- `helpers/build_site.py` — profile loading, tooltip/portrait rendering, photo-copy step,
  removed the Люди-index href-shortening special case.
- `bot/worker.js` — newly-recurring-person notification in `confirmIngest`.
- `AGENTS.md` — folder tree gained `people/` (+ `_template.md`, `photos/`).
- `runbook/bot.md` — documented the new notification behavior and pointed at this session
  for the sourcing convention.

## Open Items

- [ ] Ирина Яцемирская — no public bio/photo found; re-check if she ever gets one, or if a
      playbill someday prints more detail about her.
- [ ] ~70 more recurring people remain un-enriched (the rest of the ~90). Continue in a
      future session at whatever pace fits — this is genuinely optional per-person data,
      not a completeness requirement.

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
      as `discovery_*` — not lost to summarization (none — the research agents' full findings
      are already condensed into the `people/*.md` files themselves, which *are* the durable
      artifact here; nothing bulkier is worth keeping separately)
- [x] Structure validated against `sessions/_template.md` (re-read it — do not trust memory;
      when the lint organ exists per GROWTH.md, run it instead)
- [x] `git commit` — stage all changed files; message: `people: add photo/bio enrichment for
      recurring people (pilot batch)`. **Tick this box in the same edit that stages the
      commit** — its `[x]` state must be written *before* `git add`, because this commit
      freezes the file and the box can never be ticked afterward.

## Retrospective

- Lesson: don't assume a recurring name's role from the item title/my own memory of the
  playbill — verify against the actual credited role string in `items/*.md` before sending
  a research agent down the wrong path. Caught this turn because the agents were instructed
  to flag uncertainty rather than comply with a wrong premise; got lucky that the premise
  was checkable. → no new artifact; this is exactly what "Ничего не выдумывай" already
  covers for humans and agents alike (no change)
- Pain axis: the photo download→crop→resize→write dance was repeated ~19 times by hand this
  session (same 6-line PIL snippet each time). Small enough this session that scripting it
  felt like premature tooling for a one-off pilot, but if the remaining ~70 people get done
  in a similar pattern, this recurs enough to be worth a `helpers/fetch_person_photo.py`
  helper (URL in, slug in, resized thumbnail out). → declined for *this* close (only 19
  reps, still cheap by hand); flagging here so the *next* enrichment session opens that
  helper if the toil repeats again, per the GROWTH.md pain-axis convention
- Principle surfaced: automated writers (the bot) may *flag* facts worth researching but
  must not *write* researched facts about real people without a human sourcing/verifying
  them first — this is a specific instance of the existing P-operator-confirms-automated-writes
  principle (research/sourcing judgment is exactly the kind of "content" that principle
  says needs human confirmation, not a new category of write) → already covered by
  P-operator-confirms-automated-writes (no new principle needed)
