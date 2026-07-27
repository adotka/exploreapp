# Session: participants-venues

**Date:** 2026-07-27
**Type:** planned
**Items:** helpers/build_site.py, people/, inventory/venues.md, bot/worker.js

<!-- Type is exactly `planned` or `out-of-band` — no other values. Describe what kind of
     session this was in Goal/Discovery, not here. -->

---

## Goal / Discovery

Operator asked for two things: (1) rename the site's "Спектакли"/"Люди" sections to
"Представления"/"Участники"; (2) add short descriptions to collectives, venues, and authors —
authors specifically regardless of recurrence (unlike the general people/ rule of "only if met
twice") — as a one-time backfill, folded into the ongoing playbill-ingestion bot code.

## Steps & Findings

- Renamed the nav/heading labels in `helpers/build_site.py` ("Спектакли" → "Представления",
  "Люди" → "Участники"); left folder/URL slugs (`spektakli/`... actually `index.html`/`lyudi/`)
  unchanged since only the display text was in scope.
- Computed the exact gap using the project's own parsing (`load_performances` +
  `load_people_profiles`), not a hand grep: 23 distinct authors across `items/*.md` without a
  `people/*.md` profile (composers ranging from Mozart/Beethoven to contemporary figures like
  Kevin Volans and Alexander Tchaikovsky), and 3 genuine performing collectives credited under
  an exact `Оркестр`/`Хор`/`Ансамбль` role (Симфонический оркестр Мариинского театра, Ансамбль
  солистов АМОП, Персимфанс) — as opposed to people whose role merely *contains* those
  substrings (hormeisters, choreographers), which the exact-role match correctly excludes.
- Extended `people/_template.md` to allow `Type: collective` alongside `Type: person`, and
  documented a standing exception to the "only if met twice" rule: authors and collectives get a
  profile immediately, even on a single appearance — this is the same recurring-entity-owns-its-
  facts resolution as `people/`/`works/`, applied a third time (per `P-shared-facts-own-entity`,
  whose "known exceptions" note explicitly anticipated this).
- `helpers/build_site.py`: `load_people_profiles()` now accepts `Type: collective`; added
  `load_venue_profiles()` (parses `inventory/venues.md`'s `## <Театр>` blocks, taking the first
  prose paragraph before the address bullet list as the theatre-level description) and rendered
  it on `/sceny/<theatre>.html`; exposed `profiled_people` (list) and `venues: {theatre:
  {documented}}` in `data/index.json` for the bot.
- Found `inventory/venues.md` was missing an entry for «Зарядье» entirely, despite one item
  attending it — added the section (description only; address/coordinates flagged for manual
  follow-up, since the visit wasn't geolocation-tagged).
- Wrote short descriptions (no photo — out of scope for "short descriptions") for all 23
  authors and 3 collectives, and theatre-level descriptions for both Мариинский театр and
  «Зарядье», using established general/verifiable knowledge; kept especially cautious wording
  for a couple of low-certainty cases (Оливия Дуссек's dates, Персимфанс's "conductorless"
  tradition vs. this item's credited conductor) rather than overclaiming.
- Extended `bot/worker.js` with `authorsOf()`/`collectivesOf()` (exact-role/placeholder-name
  filtering) and `undocumentedParticipants()`, a combined `draftParticipantNotes()` Claude call
  covering all three kinds (author/collective/venue) in one request, `renderParticipant()`
  (person vs collective `Type` by kind), and `insertVenueDescription()` (inserts under an
  existing `## <Театр>` heading, or appends a new one with address left for manual completion).
  Wired into `proposeIngest`/`confirmIngest`/`preview` exactly like the existing works
  mechanism — drafted content is shown in the confirmation message (`👤 Новые участники…`) and
  committed only on the operator's ✅.
- Caught my own bug before deploying: `renderParticipant()` initially compared `entry.kind`
  against the English literal `"collective"`, but the rest of the new code uses Russian kind
  labels (`"автор"`/`"коллектив"`/`"театр"`) — found via a quick ad-hoc `node --input-type=module`
  smoke test of the new pure functions before `wrangler deploy`, not just `node --check`.
- Also excluded authors/collectives that just got a profile written in the *same* commit from
  the existing "👤 Впервые повторно" (newly-recurring) nudge, so the operator isn't told to
  manually write a bio for someone the bot just profiled automatically.
- Updated `AGENTS.md` (bot commit scope now includes `people/`) and `runbook/bot.md` (documented
  the author/collective/venue drafting, and narrowed the "bot never writes people/ profiles"
  line to the ordinary-cast/crew case only).

## Changes Made

- `helpers/build_site.py`: renamed nav/heading labels; `load_people_profiles()` accepts
  `Type: collective`; new `load_venue_profiles()`; venue description rendered on `/sceny/`
  pages; `data/index.json` gained `profiled_people` and `venues`.
- `people/_template.md`: documents `Type: collective` and the authors/collectives
  always-profiled exception.
- `people/*.md` (26 new files): 23 authors + 3 collectives, short Коротко/Био, no photo.
- `inventory/venues.md`: added theatre-level descriptions for Мариинский театр and «Зарядье»
  (new entry).
- `bot/worker.js`: `authorsOf()`, `collectivesOf()`, `undocumentedParticipants()`,
  `draftParticipantNotes()`, `renderParticipant()`, `insertVenueDescription()`; wired into
  `proposeIngest()`/`confirmIngest()`/`preview()`; newly-recurring nudge excludes
  just-auto-profiled names. Deployed via `npx wrangler deploy`.
- `AGENTS.md`: bot-commit-scope bullet now includes `people/`.
- `runbook/bot.md`: documented author/collective/venue drafting; narrowed the
  newly-recurring-people bullet to non-author/collective cast/crew.

## Open Items

- [ ] «Зарядье»'s address/coordinates are still unset in `inventory/venues.md` — add on the
      next visit or if a geolocation ingestion happens to land there.

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
      as `discovery_*` — not lost to summarization (none — the `people/*.md` files and
      `inventory/venues.md` edits are themselves the durable distillation)
- [x] Structure validated against `sessions/_template.md` (re-read it — do not trust memory;
      when the lint organ exists per GROWTH.md, run it instead)
- [x] `git commit` — stage all changed files; message: `participants: rename sections, add
      author/collective/venue descriptions, fold into bot ingestion`. **Tick this box in the
      same edit that stages the commit** — its `[x]` state must be written *before* `git add`,
      because this commit freezes the file and the box can never be ticked afterward.

## Retrospective

- Lesson: caught a real bug in new bot code (`renderParticipant()` checking an English
  `"collective"` literal against Russian-labeled kind values) via a quick ad-hoc smoke test of
  the new pure functions before deploying, not just `node --check` syntax validation. → no
  artifact change; reinforces existing practice from the prior works-descriptions session,
  worth naming here since it caught something `node --check` alone would have missed.
- Pain axis: no repeated operational pain — this session was content-authoring (26 people
  profiles + 2 venue descriptions), not a fiddly recurring command.
- Principle: the author/collective/venue handling is exactly the third recurring-entity
  instance that `P-shared-facts-own-entity`'s "known exceptions" note anticipated when it was
  ratified last session → already covered by the existing principle, no change needed.
