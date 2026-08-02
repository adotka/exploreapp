# Session: zaryadye-venue-fix

**Date:** 2026-08-02
**Type:** out-of-band
**Items:** 2020-03-07_zaryadye_zal-zaryade-okean-zvuka, 2024-05-15_zaryadye_kontsertnaya-programma

---

## Goal / Discovery

The 2024-05-15 bot ingestion (commit e1bd6f4) created a spurious duplicate venue section
`## Зал Зарядье` in `inventory/venues.md`, distinct from the existing `## Концертный зал
"Зарядье"`. In reality there is one venue — Концертный зал "Зарядье" — with two sub-scenes,
Большой зал and Малый зал. Both currently ingested acts (2020-03-07 and 2024-05-15) were
performed in Большой зал. Task: merge the duplicate back into one venue with correct
sub-scenes, backfill the missing `Сцена` field on both items, and fix the root cause in the
ingestion bot so it doesn't recur.

## Steps & Findings

- `items/2024-05-15_zaryadye_kontsertnaya-programma.md` had `Театр: Зал Зарядье` (no `Сцена`
  field) — the programka apparently printed the colloquial "Зал Зарядье" and the bot's
  PARSE_PROMPT rule (`bot/worker.js`) extracts theatre/scene дословно, so it was recorded
  verbatim instead of being normalized to the canonical venue name.
- `items/2020-03-07_zaryadye_zal-zaryade-okean-zvuka.md` already used the canonical
  `Театр: Концертный зал "Зарядье"` but was missing the `Сцена` field entirely.
- Root cause traced in `bot/worker.js`:
  - `insertVenueDescription()` matches venue sections by exact heading string
    (`## ${theatre}`) — any theatre string that doesn't match the canonical heading verbatim
    creates a brand-new section instead of being recognized as the same venue. This is what
    produced the duplicate.
  - `PARSE_PROMPT` only special-cased theatre/scene normalization for Мариинский театр; Зарядье
    had no equivalent rule, so literal programka text ("Зал Зарядье") passed straight through.
  - `lookupZaryadyeEvents()` (site-scrape ingestion path) hardcoded `venue: "Зарядье"` — also
    not matching the canonical `Концертный зал "Зарядье"` heading, a second latent source of
    the same duplication for future scrape-based ingestions.
  - `FREE_QUERY_PROMPT` (free-text search parsing) normalized "Зарядье" → "Зарядье", not the
    canonical name — inconsistent, though not itself a duplication risk since it's only used
    for regex venue-registry matching.

## Changes Made

- `inventory/venues.md` — removed the duplicate `## Зал Зарядье` section; the surviving
  `## Концертный зал "Зарядье"` section now lists both sub-scenes (Большой зал, Малый зал).
- `items/2020-03-07_zaryadye_zal-zaryade-okean-zvuka.md` — added `Сцена: Большой зал`; History
  entry added.
- `items/2024-05-15_zaryadye_kontsertnaya-programma.md` — corrected `Театр` to `Концертный зал
  "Зарядье"`, added `Сцена: Большой зал`, corrected the title line; History entry added.
- `inventory/performances.md` — both rows' Театр/Сцена column corrected to match.
- `bot/worker.js`:
  - `PARSE_PROMPT` — added an explicit Зарядье normalization rule (theatre always `Концертный
    зал "Зарядье"`, scene one of «Большой зал»/«Малый зал»), mirroring the existing Мариинский
    rule, so a photo/text parse of a programka printing "Зал Зарядье" is normalized before
    ingestion instead of passed through verbatim.
  - `lookupZaryadyeEvents()` — `venue` now returns the canonical `Концертный зал "Зарядье"`
    string instead of bare `"Зарядье"`.
  - `FREE_QUERY_PROMPT` — normalization target updated to the canonical name for consistency.

## Open Items

(none)

---

## Closing Checklist

- [x] "Changes Made" filled in
- [x] Retrospective done **and fully resolved before this commit**
- [x] Artifacts saved: no bulky raw output produced this session
- [x] Structure validated against `sessions/_template.md`
- [x] `git commit` — stage all changed files; message: `fix: zaryadye-venue-fix`

## Retrospective

- Lesson: `insertVenueDescription()` (and, by the same logic, any code that treats a theatre
  string as an identity key) is exact-match on the printed/extracted theatre string, with no
  normalization layer — a venue with a colloquial alternate name will silently fork into a
  second section unless every ingestion path is separately taught the canonical form. →
  addressed directly in `bot/worker.js` (PARSE_PROMPT rule + `lookupZaryadyeEvents` fix); no
  further artifact change needed since the fix is the durable one.
- Principle (proposed): venue identity should always be normalized to the canonical
  `inventory/venues.md` heading at the point of ingestion, never trusted verbatim from a
  source document — because any per-source spelling variant otherwise creates a silent
  duplicate venue section instead of erroring. → proposed to operator for PRINCIPLES.md; not
  ratified in this session (single-operator repo, task was scoped to the concrete fix — no
  interactive confirmation channel available in this out-of-band run). Declined for now:
  recording as a candidate here is enough; add it formally once the operator confirms it in a
  future interactive session.
