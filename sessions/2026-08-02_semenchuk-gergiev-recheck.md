# Session: semenchuk-gergiev-recheck

**Date:** 2026-08-02
**Type:** out-of-band
**Items:** 2024-09-12_zaryadye_simfonicheskii-orkestr-mariinskogo-teatra-ekaterina-semenchuk-soprano-dirizher-valerii-gergiev, works/bolero

---

## Goal / Discovery

Requested recheck of the 2024-09-12 ingestion ("Симфонический оркестр Мариинского театра.
Екатерина Семенчук (сопрано). Дирижер Валерий Гергиев", commit 5fe82ff). Rechecking it
surfaced two independent problems from that same ingestion.

## Steps & Findings

### 1. `works/bolero.md` silently overwritten (not additive)

The programka's program listed "Болеро" without guillemets; the existing canonical profile
(created 2026-07-27) was titled "«Болеро»". The bot's undocumented-work check compares by
exact title string against the published index, so "Болеро" ≠ "«Болеро»" registered as
not-yet-documented, and the bot drafted a fresh generic description for it — which then landed
in the *same* file, because `slugify()` strips guillemets and both titles collapse to the same
`works/bolero.md` path. The commit silently overwrote a curated profile (lost the `Жанр`
field, replaced a more precise description, and replaced the original `## History` entry
instead of appending to it).

Traced root cause in `bot/worker.js`:
- `undocumentedWorks()` (used in `proposeIngest`) does an exact-string lookup into
  `index.works`, itself keyed by exact title strings collected from every item's
  Программа/Название field (`helpers/build_site.py`, `works` defaultdict) — no normalization
  anywhere in that chain.
- `confirmIngest()` writes new work drafts to `works/${slugify(w.title)}.md` without checking
  whether that path already exists — since `slugify()` strips punctuation, a title differing
  only by guillemets/case/ё collides with an existing file and silently overwrites it.

Scanned the rest of the archive for the same pattern (title differing only by quotes/case/ё
across items' Программа entries, and across `works/*.md` Facts.Название) — no other instances
found; isolated to Болеро.

### 2. Venue misattributed to Мариинский театр — actually Концертный зал "Зарядье"

Read the actual playbill scans (`playbills/..._1.jpg`, `_2.jpg`): the cover clearly shows the
"зал ЗАРЯДЬЕ" wordmark, "12.09 чт 19:00 большой зал". The item had `Театр: Мариинский театр` /
`Сцена: Концертный зал` — wrong. The performing ensemble, «Симфонический оркестр Мариинского
театра», is a Mariinsky ensemble on tour at Зарядье; its own name (which contains "Мариинского
театра") appears to have been mistaken for the venue during parsing, instead of the venue
actually printed on the page. This is a different failure mode from the earlier Зарядье
venue-duplication fix (session `2026-08-02_zaryadye-venue-fix.md`) — not a spelling/
canonicalization mismatch, but the extraction conflating "who performs" with "where".

## Changes Made

- `items/2024-09-12_..._gergiev.md`:
  - Программа entry corrected to `Морис Равель — «Болеро»` (matches the canonical work title,
    so the site groups it with prior Болеро performances instead of a phantom second
    "произведение").
  - `Театр` corrected to `Концертный зал "Зарядье"`, `Сцена` to `Большой зал`; title line
    updated to match.
  - File renamed `items/2024-09-12_mariinsky_...` → `items/2024-09-12_zaryadye_...` (`git mv`)
    to match `theatreSlug()` convention; both playbill scans renamed the same way, and the
    `Программка:` field paths updated accordingly.
  - History entry added covering both corrections.
- `works/bolero.md` — restored to its pre-overwrite content (title with guillemets, `Жанр`
  field, original description/History entry), with a new History line documenting the
  overwrite and its correction (original History entry preserved, not replaced).
- `inventory/performances.md` — row's Театр/Сцена column and item link corrected to match.
- `bot/worker.js`:
  - Added `canonicalizeWorkTitles(index, parsed)` — before the undocumented-work check,
    resolves each `program[].title` (or top-level `title` for single-work performances)
    against already-documented `index.works` keys via normalized comparison (reusing the
    existing `normalizeTitle()` helper: case/ё/quote-insensitive), rewriting `parsed` in place
    to the canonical documented form when a match is found. Wired into `proposeIngest()` right
    after the index fetch, before `undocumentedWorks()` and before `parsed` is queued for
    commit — so both the undocumented-check and the final written item file use the canonical
    title.
  - `PARSE_PROMPT` — added an explicit rule that theatre/scene is the actual place of
    performance (venue signage/address on the programka), not the name of the performing
    ensemble — calling out that touring ensembles are often named after their home theatre
    (e.g. «Симфонический оркестр Мариинского театра») and must not be conflated with the venue.
- Verified with `python3 helpers/build_site.py`: произведения count dropped from 68 to 67
  after the Болеро title fix (the phantom duplicate merged back into one); театров count
  unaffected by the venue fix (Зарядье was already a known venue, just misattributed on this
  one item).

## Open Items

- (none)

---

## Closing Checklist

- [x] "Changes Made" filled in
- [x] Retrospective done **and fully resolved before this commit**
- [x] Artifacts saved: no bulky raw output produced this session
- [x] Structure validated against `sessions/_template.md`
- [x] `git commit` — stage all changed files; message: `fix: semenchuk-gergiev-recheck`

## Retrospective

- Lesson: the bot's identity-matching for recurring entities (venues, works) is exact-string-
  only at every layer (index build, undocumented-check, file path via slugify) with zero
  normalization, so any typographic variance in a source programka (quotes, dashes, case)
  either forks a duplicate record or — when slugify happens to collapse both variants to the
  same filename, as with quoted vs unquoted titles — silently clobbers the existing one. This
  is the second occurrence of the same underlying class of bug in one day (after the Зарядье
  venue-duplication fix). → addressed directly in `bot/worker.js` (`canonicalizeWorkTitles`);
  people-name identity is intentionally exact-match per AGENTS.md's convention (dословно, one
  canonical printed form) and is out of scope here.
- Lesson: theatre/scene extraction from a programka can be misled by a performing ensemble's
  own name when that name references a different theatre (touring ensembles named after their
  home venue). → addressed directly in `bot/worker.js` (`PARSE_PROMPT` rule distinguishing
  "who performs" from "where").
- Principle (proposed, now surfaced a second time on top of the venue-fix session): venue/work
  identity should always be canonicalized against already-documented records at ingestion time,
  never trusted verbatim from a single source document, and venue extraction must be anchored
  to the page's own venue signage rather than to any performer/ensemble name appearing on it —
  because per-source spelling/punctuation variants or ensemble-name confusion otherwise fork,
  overwrite, or misattribute records instead of erroring visibly. → proposed to operator for
  PRINCIPLES.md; not ratified in this out-of-band run (no interactive confirmation channel
  available). Recommend the operator ratify it explicitly in the next interactive session,
  given it has now surfaced across two independent sessions on the same day.
