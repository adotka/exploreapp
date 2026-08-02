# Session: mosconsv-venue-and-names

**Date:** 2026-08-02
**Type:** out-of-band
**Items:** 2022-03-24_consv_shedevry-velikih-kompozitorov

---

## Goal / Discovery

Operator reported that the latest bot ingestion (2022-03-24, "ШЕДЕВРЫ ВЕЛИКИХ КОМПОЗИТОРОВ")
produced a performance page mentioning venue "Большой зал консерватории" with no
venue created or cross-linked on the site.

## Steps & Findings

- The item's `Театр` field was **empty** and `Сцена` held the whole compound phrase
  "Большой зал консерватории" verbatim. `helpers/build_site.py`'s `build()` only adds a
  performance to the `theatres` dict `if p.theatre:` — an empty theatre silently drops it from
  any venue grouping, which is exactly the "no venue created/crosslinked" symptom (not a crash,
  just silent omission).
- Read the actual scan: it prints "БОЛЬШОЙ ЗАЛ КОНСЕРВАТОРИИ" as a single line, with no
  separately-named venue/wordmark (unlike the Зарядье scans, which have a distinct venue
  logo). Root cause: `PARSE_PROMPT` had explicit theatre/scene-splitting rules for Мариинский
  and Зарядье (added in earlier sessions) but **none for the Moscow Conservatory** — so Claude
  had nothing telling it "Большой зал консерватории" should split into `theatre: "Московская
  консерватория"` + `scene: "Большой зал"`, and instead dumped the unsplit phrase into `scene`,
  leaving `theatre` blank. Confirmed `inventory/venues.md` never had a `## Московская
  консерватория` section at all, even though `bot/worker.js` already has substantial code
  supporting this venue (`lookupMosconsvEvents`, `theatreSlug`, `VENUE_REGISTRY`,
  `FREE_QUERY_PROMPT` normalization, `HELP` text) — the canonical registry was simply never
  filled in for it.
- While fixing this, found a second, independent bug from the same ingestion: `people/`
  gained a new `v-a-motsart.md` ("В. А. Моцарт") profile, but Wolfgang Amadeus Mozart was
  **already documented** as `people/volfgang-amadei-motsart.md` ("Вольфганг Амадей Моцарт",
  created 2026-07-27, used in two Мариинский items). Since the exact-string identity check
  (`undocumentedParticipants`) doesn't recognize an abbreviated name as the same person, this
  forked into a second Mozart profile — same underlying "exact-string identity, no
  canonicalization" bug class as the earlier Болеро/Зарядье sessions today, but for authors
  this time. The two other new composer profiles this ingestion created (`f-mendelson.md`,
  `f-shopen.md`) don't collide with an existing profile (first appearance), but were
  documented under initialed names too, which would fork identically the next time either
  composer's full name appears on a scan.
- `PARSE_PROMPT` already has a rule "Имена людей — полной формой, как напечатано («Виктория
  Терешкина», не «В. Терешкина»)" for cast/crew names, but the author-specific rule right
  after it only addresses grammatical case (nominative vs genitive), not abbreviation — Claude
  evidently didn't reliably carry the general full-name rule over to the `author`/
  `program[].author` fields specifically.

## Changes Made

- `inventory/venues.md` — added `## Московская консерватория` section (founding date, Большой/
  Малый/Рахманиновский зал sub-scenes with the shared address — public, well-established
  facts), matching the existing Мариинский/Зарядье structure.
- `items/2022-03-24_teatr_..._` → renamed to `..._consv_...` (item + playbill; `Театр` was
  empty at ingestion, so `theatreSlug()` fell back to its generic "teatr" placeholder).
  `Театр` set to `Московская консерватория`, `Сцена` to `Большой зал`; author names in
  `## Программа` expanded to full form. History entry added.
- `inventory/performances.md` — row corrected (Театр/Сцена, file link).
- `people/v-a-motsart.md` — deleted (duplicate of the already-documented
  `people/volfgang-amadei-motsart.md`).
- `people/f-mendelson.md` → renamed `people/feliks-mendelson.md`, `people/f-shopen.md` →
  renamed `people/fridrik-shopen.md`; H1/`Имя` fields expanded to full names (their own
  bot-drafted `Био` text already used the full names — only the identity fields lagged).
- `works/uvertyura-k-opere-svadba-figaro.md`,
  `works/kontsert-2-dlya-fortepiano-...md`,
  `works/syuita-iz-muzyki-k-komedii-shekspira-...md` — `Автор` fields expanded to full names to
  match. History entries added to all three.
- `bot/worker.js` `PARSE_PROMPT`:
  - Added an explicit Moscow Conservatory theatre/scene-splitting rule, mirroring the existing
    Мариинский/Зарядье pattern.
  - Extended the `author`/`program[].author` rule to explicitly require full-name expansion
    for well-known composers/authors printed as initials (not just correct grammatical case),
    restating the same requirement already given for cast names — the general rule alone
    evidently wasn't reliably carried over to the author field.
- Verified with `python3 helpers/build_site.py` (after clearing `_site/`): 3 театров (up from
  2 — Moscow Conservatory now groups correctly), `moskovskaya-konservatoriya.html` scene page
  now exists, and there's exactly one person page each for Mozart/Mendelssohn/Chopin (no
  duplicates).

## Open Items

- (none — no fabricated/uncertain facts added; venue addresses and Mozart/Mendelssohn/Chopin
  biographical facts are well-established public knowledge, consistent with how the Мариинский/
  Зарядье sections were filled in earlier)

---

## Closing Checklist

- [x] "Changes Made" filled in
- [x] Retrospective done **and fully resolved before this commit**
- [x] Artifacts saved: no bulky raw output this session
- [x] Structure validated against `sessions/_template.md`
- [x] `git commit` — stage all changed files; message: `fix: mosconsv-venue-and-names`

## Retrospective

- Lesson (same root cause, now confirmed across three sessions today — venue, work-title, and
  now author-name identity): exact-string matching with no canonicalization silently forks
  recurring entities whenever a source document's wording deviates even slightly from the
  already-documented form. Each occurrence so far has needed a bespoke PARSE_PROMPT rule
  (Мариинский, Зарядье, now Moscow Conservatory theatre/scene splitting; full-name expansion
  for authors) rather than a single general mechanism. → the general principle proposed in
  earlier sessions (canonicalize against already-documented records at ingestion time) now has
  a *third* independent occurrence; still not ratified into PRINCIPLES.md (no interactive
  confirmation channel in this out-of-band run). Given three occurrences in one day, strongly
  recommend the operator ratify it explicitly next session, and consider whether a
  structural fix (e.g., always resolving a newly-parsed author/theatre/title against a fetched
  list of known-canonical names before rendering, the same technique already applied for works
  via `canonicalizeWorkTitles`) is worth building generally rather than one bespoke prompt rule
  per venue/case as it comes up.
- Lesson: a venue can have extensive code support (`lookupMosconsvEvents`, `VENUE_REGISTRY`,
  `theatreSlug`, help text) while never having been added to the canonical
  `inventory/venues.md` registry that PARSE_PROMPT rules and `insertVenueDescription()` actually
  key off of. Worth a quick audit: any other venue named in `bot/worker.js` but missing from
  `inventory/venues.md`? Checked at the time of this fix — МАМТ and Внутри are also referenced
  in code (`lookupMamtEvents`, `lookupVnutriEvents`, `VENUE_REGISTRY`, `HELP` text) but have no
  `inventory/venues.md` section and no PARSE_PROMPT theatre/scene rule either, same latent gap
  as Moscow Conservatory had. Not fixed here (no ingestion has hit them yet, and inventing venue
  descriptions with no confirmed visit/scan would be fabrication) — flagged for whoever's
  ingestion first surfaces one of them, or for a proactive follow-up session.
