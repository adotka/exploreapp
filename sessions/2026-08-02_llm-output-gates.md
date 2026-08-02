# Session: llm-output-gates

**Date:** 2026-08-02
**Type:** planned
**Items:** bot/worker.js

---

## Goal / Discovery

Today's sessions found the same underlying bug class recurring four times, each time fixed
after the fact: an entity (venue, work title, author) gets recorded under a form that doesn't
match its already-documented canonical form, and — because every identity check in the bot is
exact-string — this either silently forks a duplicate record or drops the entity from
cross-linking entirely:

1. `2026-08-02_zaryadye-venue-fix.md` — "Зал Зарядье" vs "Концертный зал \"Зарядье\"" forked
   `inventory/venues.md` into two sections.
2. `2026-08-02_semenchuk-gergiev-recheck.md` — "Болеро" vs "«Болеро»" forked/overwrote
   `works/bolero.md` (same file via slugify collision, worse than a fork — a silent overwrite).
3. `2026-08-02_mosconsv-venue-and-names.md` — Театр left empty entirely (no rule existed for
   the venue), and "В. А. Моцарт" forked away from the already-documented "Вольфганг Амадей
   Моцарт".

Each was fixed with a bespoke `PARSE_PROMPT` rule after the fact. The request now: build
general gates on the bot's LLM output so future instances of the same bug classes are either
prevented or, at minimum, made visible to the operator before they're committed, instead of
requiring another after-the-fact recheck session.

## Steps & Findings

- All four instances share one root cause: identity is matched by literal printed string, with
  no canonicalization step and no visibility into when a canonicalization *should* have
  happened but didn't.
- `canonicalizeWorkTitles()` (built in session 2 above) was already a working example of the
  right shape — normalize against already-documented titles before treating something as new.
  The gap: (a) it only covered work titles, not theatres or authors; (b) it acted silently —
  the operator had no way to see, in the confirmation preview, that a canonicalization
  happened, so a *wrong* fuzzy match would have gone to the archive unnoticed just as easily as
  a *missing* one did today.
- Confirmed `index.people` (from `helpers/build_site.py`) includes author names, not just
  cast/crew — `ItemRecord.people()` appends `(self.author, "автор")` and each `program[]`
  author — so an author-canonicalization gate has the data it needs from the same published
  index the other gates already fetch.
- Author-name abbreviation (initials vs full name) can't be solved with the same
  punctuation/case normalization used for titles — "В. А. Моцарт" and "Вольфганг Амадей
  Моцарт" don't collapse to the same string under any simple normalization. Built a
  surname-plus-initials matcher instead, deliberately scoped to *authors only*
  (`authorsOf()`/`program[].author`), not ordinary cast — two different performers sharing a
  surname is common and would make this heuristic actively harmful there, whereas an "author"
  is, by the archive's own convention, always one canonical entity
  (`people/_template.md`, P-shared-facts-own-entity).
- Venue wording mismatches ("Зал Зарядье" vs "Концертный зал \"Зарядье\"") don't share a
  common normalized string either, but usually share one distinctive keyword once generic
  words (зал/театр/концертный/сцена/дворец/дом) are stripped. Built a keyword-overlap matcher,
  deliberately requiring an *unambiguous single match* among all known venues — 0 or 2+
  candidate matches are left alone rather than guessed.
- The empty-Театр case (Moscow Conservatory) can't be fixed by fuzzy-matching after the fact —
  there's nothing to match against when the field is blank. Added a mechanical, index-free
  check instead: Театр empty + Сцена non-empty is inherently suspicious (a scene is meaningless
  without a theatre to scope it) and gets flagged every time, independent of whether this
  specific venue has ever been seen before.

## Changes Made

- `bot/worker.js`:
  - `canonicalizeWorkTitles()` — unchanged behavior, but now **returns** the list of
    corrections made (`{kind, from, to}`) instead of silently mutating `parsed`.
  - `canonicalizeTheatre(index, parsed)` — new. Fuzzy-matches `parsed.theatre` against
    every already-seen theatre in `index.venues` by shared distinctive keyword (venue words
    like зал/театр/концертный stripped); only acts on an unambiguous single match; returns the
    correction made, if any.
  - `matchAbbreviatedName(shortName, knownNames)` / `canonicalizeAuthorNames(index, parsed)` —
    new. Matches an abbreviated author name ("Ф. Шопен") against already-documented full names
    in `index.people` by surname + matching initials; scoped to `author`/`program[].author`
    only (never ordinary cast, where same-surname collisions are common and this heuristic
    would be actively wrong).
  - `gateWarnings(parsed)` — new. Mechanical, index-independent checks; currently one rule:
    Театр empty while Сцена is non-empty ⇒ warn (this exact shape is what the Conservatory
    scan produced).
  - `preview()` — now renders two new sections when non-empty: "⚠️ Проверьте перед
    подтверждением" (gate warnings) and "🔗 Приведено к уже известной форме" (canonicalization
    corrections) — both appear in the **confirmation message**, before the operator taps ✅, so
    a wrong auto-match or a real structural gap is visible at exactly the point it can still be
    caught for free (cancel and resend corrected text/photo) rather than requiring a whole
    recheck session afterward.
  - `proposeIngest()` — wires all three canonicalizers plus `gateWarnings()` in before
    building the preview.
  - All five new/changed functions exported (matching the existing convention for pure
    helper functions like `peopleOf`/`authorsOf`/`undocumentedWorks`) for testability.
- Verified with an ad-hoc script (`/tmp/.../test-gates.mjs`, not committed — scratch, not a
  repo artifact) reproducing all four of today's real cases plus two negative controls (an
  unrelated surname must NOT match; an already-full name must NOT be treated as an
  abbreviation) — all ten checks passed.
- Verified `python3 helpers/build_site.py` still produces identical counts (36/387/74/3) —
  no regression to existing data from the refactor.

## Open Items

- [ ] Still no automated test runner for `bot/worker.js` (no `package.json` test script, no CI
  step) — today's verification was one-off. If bot logic keeps growing bespoke fixes at this
  rate, worth adding a real test file + `npm test`, per GROWTH.md's trigger-based-growth
  principle (not built now — one script today doesn't yet justify permanent test
  infrastructure, but a fifth occurrence might).
- [ ] The theatre keyword-matcher doesn't handle grammatical case variation (e.g. a
  compound "Большой зал консерватории" ending up entirely in `theatre` with `scene` empty
  wouldn't match "Московская консерватория" because "консерватории" ≠ "консерватория" as
  strings) — accepted as a known limitation; the actually-observed failure mode (empty
  Театр) is caught by `gateWarnings` instead, and the `PARSE_PROMPT` rule added in the prior
  session is the primary defense against the compound-string case.
- [ ] These gates only run in `proposeIngest()` (photo/document/URL/free-text paths that go
  through it). `minimalParsed()` (used when a site-scraped event has no individual programka
  page) bypasses `proposeIngest`'s index fetch entirely in one branch — confirmed it still
  goes through `proposeIngest` in all current call sites, so no gap today, but worth
  remembering if a new ingestion path is added later.

---

## Closing Checklist

- [x] "Changes Made" filled in
- [x] Retrospective done **and fully resolved before this commit**
- [x] Artifacts saved: no bulky raw output; the validation script is scratch, not a repo
      artifact, per its purpose (one-off logic check, not a permanent test asset)
- [x] Structure validated against `sessions/_template.md`
- [x] `git commit` — stage all changed files; message: `bot: add ingestion gates`

## Retrospective

- Principle (this is the fourth occurrence of the same proposal today, across four
  independent sessions — venue fix, work-title fix, Mozart/Conservatory fix, and now this
  one): ingestion should canonicalize against already-documented records and flag mechanical
  inconsistencies **visibly, before commit**, rather than trust a single source document's
  wording and let mismatches surface only when a human happens to notice a broken cross-link
  days or weeks later. → proposed to operator for `PRINCIPLES.md`, `P-canonicalize-at-ingestion`
  (draft slug); not ratified in this out-of-band run (no interactive confirmation channel
  available). This is the strongest case yet for ratifying it explicitly, given it's now
  motivated four separate fixes in one day and this session is the direct implementation of
  it — recommend the operator confirm it first thing next interactive session so it's
  recorded as a standing tenet rather than re-discovered a fifth time.
- Lesson: a canonicalization that runs silently is only half a fix — it removes the chance for
  a human to catch a *wrong* auto-correction the same way it removes the chance to catch a
  missed one. Surfacing every gate/correction in the confirmation preview (already-existing
  UI, no new surface needed) was cheap and directly closes that gap.
