# Session: duplicate-gate

**Date:** 2026-08-04
**Type:** out-of-band
**Items:** items/2023-01-20_dom-radio_solisty-orkestra-musicaeterna, bot/worker.js

---

## Goal / Discovery

Operator mistakenly re-uploaded the 2023-01-20 Дом Радио concert; the bot created a second,
separate item (`Камерный концерт`) instead of recognizing it as the same show already in the
archive (`Солисты оркестра musicAeterna`). Requested: remove the duplicate, keep the
`Солисты оркестра musicAeterna` entry, and add a gate so the bot catches this itself going
forward.

## Steps & Findings

- Confirmed the duplicate: both items — same date (2023-01-20), same theatre (Дом Радио, both
  with empty Сцена — no sub-scene rule exists for this venue), identical Программа (same 4
  works, same authors, same order), identical Состав (same 12 performers, same instruments).
  `Камерный концерт` even records `Цикл: Солисты оркестра musicAeterna`, confirming it's the
  same performance series/event, just parsed slightly differently on the reupload (its
  Постановщики list is a strict subset of the kept item's — missing Художественный
  руководитель, Генеральный директор, and several other Дом Радио leadership credits the first
  parse captured). No data loss from keeping the original per the operator's instruction.
- `helpers/build_site.py`'s `index.json` already publishes a `performances` array with
  `{slug, title, date, genre, theatre, scene}` for every item — everything needed for a
  same-date duplicate check was already available with no new data-layer plumbing.
- Designed the gate the same way as the empty-Театр hard gate from
  `2026-08-03_hard-venue-gate.md`: match strength varies (same date at a different venue is a
  perfectly normal thing to happen; same date at the same venue, as here, is a very strong
  signal but not proof — a real matinee+evening double-header is possible), so this is a
  **question to the operator**, not an automatic reject or automatic accept. Silently blocking
  a real second same-day show would be its own kind of data loss.

## Changes Made

- Deleted the duplicate: `items/2023-01-20_dom-radio_kamernyi-kontsert.md` and its two playbill
  scans, and its row in `inventory/performances.md`. Added a History note to the kept
  `items/2023-01-20_dom-radio_solisty-orkestra-musicaeterna.md` recording that the duplicate
  existed and was removed, so a future reader isn't confused by a gap.
- `bot/worker.js`:
  - New `findDuplicateCandidates(index, parsed)` — filters the published `index.performances`
    for any entry sharing the incoming item's date.
  - New `askDuplicateConfirm()` — when candidates are found, stores the pending
    `{parsed, sourceUrl, photos}` and asks the operator directly, listing what's already on
    that date, with two buttons: "➕ Это другое, добавить" (`d:<key>`) and "❌ Дубликат, не
    добавлять" (`x:<key>`, reusing the existing generic cancel handler — same pattern as the
    venue-ask and photo-group-confirm flows).
  - New `confirmDuplicateAnyway()` — handles "➕ Это другое, добавить" by re-invoking
    `proposeIngest()` with a new `skipDuplicateCheck` flag so it doesn't loop back into asking
    again.
  - `proposeIngest()` restructured: the `index.json` fetch now happens once up front (used to
    live inside the canonicalization `try` block) and is reused for both the duplicate check
    and the existing canonicalization/undocumented-participant logic; the duplicate check runs
    right after the (now-established) venue hard gate, before anything else.
  - Wired the new `d:` callback prefix into `handleUpdate()`'s dispatch.
- Validated with a scratch script mocking KV/`fetch`: `findDuplicateCandidates` correctly
  matches same-date entries and correctly finds nothing on a free date; `askDuplicateConfirm`
  names the existing entry and renders both buttons; `confirmDuplicateAnyway` degrades
  gracefully (a friendly message, no throw) when its pending key has expired — 5/5 checks
  passed.
- `python3 helpers/build_site.py`: 41 спектаклей (down one from the duplicate's removal), no
  other regressions.

## Open Items

- [ ] **Unverified against the live bot** — needs deploy + a real duplicate-upload test.
- [ ] Match key is date-only, not date+theatre — a genuinely different show at a *different*
  venue on the same date would also trigger the question. Considered narrowing to date+theatre
  (which is what actually happened here) but chose the broader date-only match deliberately:
  the cost of one extra confirmation tap on a rare true coincidence is much lower than missing
  a duplicate that happens to have a theatre-name mismatch (exactly what several sessions today
  were about) — the operator can always tap "это другое" in three seconds; a silently-created
  duplicate needs a whole recheck session, as this one did.

---

## Closing Checklist

- [x] "Changes Made" filled in
- [x] Retrospective done **and fully resolved before this commit**
- [x] Artifacts saved: no bulky raw output this session
- [x] Structure validated against `sessions/_template.md`
- [x] `git commit` — stage all changed files; message: `fix: remove duplicate 2023-01-20 entry, add duplicate-ingest gate`

## Retrospective

- Principle (third concrete instance today of the standing proposal from
  `2026-08-02_llm-output-gates.md`): a load-bearing risk (venue identity, and now
  duplicate-performance identity) should be caught at ingestion time with a direct question to
  the operator, not left to a recheck session after the fact discovers it. → still recommend
  formal ratification in `PRINCIPLES.md`; not done here (no interactive confirmation channel in
  this out-of-band run) — three sessions building the same principle's concrete instances in
  two days is a strong signal it's ready to be written down rather than re-derived each time.
- Lesson: `index.json` already carried everything this gate needed (`performances` array with
  date/theatre/title) — worth remembering that the published index is a fairly rich, already-
  computed resource before reaching for a new data source or KV structure when building the
  next gate.
