# Session: people-enrichment-batch2

**Date:** 2026-07-27
**Type:** planned
**Items:** (project data — second batch of the recurring-people enrichment initiative)

<!-- Type is exactly `planned` or `out-of-band` — no other values. Describe what kind of
     session this was in Goal/Discovery, not here. -->

---

## Goal / Discovery

Continuation of `sessions/2026-07-27_people-enrichment.md`: operator asked to "select and
fill another batch" of recurring-people profiles. No new architecture or policy decisions
needed — reused the `people/<slug>.md` organ, sourcing convention (official venue pages
preferred, small ID-only photo thumbnails), and parallel-research pattern established last
time.

## Steps & Findings

- Re-ranked recurring people (count > 1, placeholders/collectives excluded) against the
  now-larger `profiles` set to get the next 20 by frequency, none overlapping the first
  pilot batch.
- Learned from last time's near-miss: before dispatching research, checked each name's
  *actual* credited role directly in `items/*.md` (one `grep` per name) and handed those
  confirmed roles to the research agents as trusted hints, instead of guessing from memory.
  This avoided repeating the earlier Соболева/Ларина-style role mismatch entirely this round.
- Ran 4 parallel general-purpose research agents (5 people each, research-only, no file
  writes), same brief as last time. 19 of 20 came back with verified official-source bios
  and photo URLs (mostly mariinsky.ru company pages; one historical composer — Verdi — from
  Wikipedia/Wikimedia Commons, public domain).
- Ирина Яцемирская (children's-choir chorus master, carried over from batch 1's unresolved
  list) was re-searched with fresh angles at my request — still no public bio or photo
  exists anywhere; confirmed her role via the Mariinsky chorus-management page (plain-text
  listing, no link, no image) but left her un-enriched again rather than fabricate.
- Downloaded, center-cropped, and resized all 19 confirmed photos to the same 180×180
  thumbnail convention as batch 1, then wrote all 19 `people/<slug>.md` files.

## Changes Made

- `people/*.md` (19 new files) + `people/photos/*.jpg` (19 new thumbnails): Кристина Гонца,
  Георгий Цыпин, Вадим Бродский, Наталия Мордашова, Ольга Пудова, Борис Степанов, Владимир
  Мороз, Антонина Весенина, Джузеппе Верди, Ирина Чурилова, Владимир Лукасевич, Татьяна
  Ногинова, Мария Баянкина, Татьяна Павловская, Андрей Попов, Злата Булычёва, Вадим
  Дуленко, Илья Устьянцев, Владислав Карклин.
- No code changes this session — the infrastructure from batch 1 needed no modification.

## Open Items

- [ ] Ирина Яцемирская — still no public bio/photo after a second search attempt; unlikely
      to resolve without a primary source (e.g. a playbill program note) surfacing her.
- [ ] ~50 more recurring people remain un-enriched. Continue at whatever pace fits.

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
      as `discovery_*` — not lost to summarization (none — same as batch 1, the `people/*.md`
      files are themselves the durable distillation of the research)
- [x] Structure validated against `sessions/_template.md` (re-read it — do not trust memory;
      when the lint organ exists per GROWTH.md, run it instead)
- [x] `git commit` — stage all changed files; message: `people: second enrichment batch (19
      more recurring people)`. **Tick this box in the same edit that stages the commit** —
      its `[x]` state must be written *before* `git add`, because this commit freezes the
      file and the box can never be ticked afterward.

## Retrospective

- Lesson confirmed from batch 1: pre-verifying each person's credited role against
  `items/*.md` before writing the research brief eliminated the role-mismatch failure mode
  entirely this round (zero mismatches vs. two last time). → already covered by batch 1's
  retrospective disposition (no invented facts / verify before delegating); this session is
  that lesson being applied, not a new one (no change)
- Pain axis: the photo download→crop→resize→write loop was repeated 19 more times this
  session (38 total across both batches now), still by hand with the same inline PIL
  snippet. This is the second time the exact toil recurred — per batch 1's own flagged
  countermeasure, this crosses the threshold. → build `helpers/fetch_person_photo.py`
  (slug + URL in, resized thumbnail in `people/photos/` out) before the next enrichment
  batch, so a third repetition doesn't happen by hand. Declined to build it *this* session
  (the batch was already done manually by the time the threshold was crossed) — opening as
  the concrete task for whoever runs batch 3.
- No new principles surfaced this session (nothing beyond what batch 1 already ratified via
  reference to P-operator-confirms-automated-writes).
