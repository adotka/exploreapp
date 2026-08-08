# Session: recurring-people-batch3

**Date:** 2026-08-08
**Type:** planned
**Items:** (project data — continuing batch of `people/*.md` profiles; no single performance)

---

## Goal / Discovery

Operator request: continue the recurring-people enrichment backlog with the next batch of 7
(by frequency), following directly on `sessions/2026-08-08_recurring-people-photo-and-bio-backfill.md`,
which left ~31 recurring people un-enriched (excluding the 2 known name collisions and the 4
declined that session).

## Steps & Findings

- Re-checked `bolshoi.ru` reachability before deciding whether to retry the 4 people declined
  last session for that reason (Игорь Янулайтис, Александр Колесников, Александра Таликова,
  Елена Балаева) — still unreachable (timeout, `curl` exit 28, ~16s). No new information, so
  did not re-attempt them this batch; picked the next 7 by frequency instead.
- Verified each of the next 7 names' actual credited role(s) directly against `items/*.md`
  (one `grep` per name) before researching, and their theatre affiliation via each item's
  `Театр:` field: 3 are Bolshoi/Камерная сцена Покровского (Захар Ковалёв, Злата Рубинова,
  Ирина Алексеенко — `bolshoi.ru` still blocked), 4 are Mariinsky/Гергиев productions staged
  either at the Мариинский театр or touring at Концертный зал "Зарядье" (Елена Витман, Жанна
  Домбровская, Иван Новосёлов, Илья Банник — `mariinsky.ru` reachable).
- Ran 2 parallel general-purpose research agents split by theatre (3 Bolshoi, 4 Mariinsky),
  same briefing discipline as the previous session (confirmed roles handed over as trusted
  hints, current network-egress status stated up front so no agent wasted calls rediscovering
  the `bolshoi.ru` block).
- **Out-of-band interrupt while waiting on the research agents:** operator reported a site-
  generation bug — the published person page for Астор Пьяццолла
  (`adotka.github.io/exploreapp/lyudi/astor-pyatstsolla.html`) showed several identical entries
  per single performance. Root cause: `Performance.people()` in `helpers/build_site.py` appends
  one `(author, "автор")` pair per line of the item's `## Программа` section — for a mixed-
  composer concert with 16 Piazzolla pieces on one bill (`items/2017-03-11_consv_solo-tango-
  orquesta.md`), that's 16 duplicate `("Астор Пьяццолла", "автор")` entries for the *same*
  performance, each rendered as its own `<li>` on his person page (plus a 17th from the item's
  own `Автор:` field, also Piazzolla, also not deduped against the program entries). Fixed by
  deduplicating `(name, role)` pairs within `people()` before returning — a person now appears
  at most once per role per performance regardless of how many program lines or author fields
  name them. Verified: rebuilt `_site/`, confirmed his page dropped from ~22 `<li>` lines to the
  correct 2 (one per actual concert). The `lyudi/index.html` index page itself was already
  correct (it uses `perf_count()`, which dedupes by unique slug) — only the per-person detail
  page and `data/index.json`'s `"people"` field were affected.
- Wrote all 7 as profiles (none declined this round): 4 Mariinsky people HIGH-confidence from
  `mariinsky.ru`'s own roster pages, with photos downloaded and visually verified before writing
  (per `P-verify-photo-before-write`) — Елена Витман, Жанна Домбровская, Илья Банник (Иван
  Новосёлов also written from a primary source, but flagged MEDIUM-confidence: the only
  reachable page is his Академия молодых оперных певцов bio, whose most recent content is from
  2014–2015, with no confirmation of his current main-troupe status despite the archive's 2022/
  2025 credits). The 3 Bolshoi/Покровского people (Захар Ковалёв, Злата Рубинова, Ирина
  Алексеенко) were written cautiously from WebSearch snippets only — `bolshoi.ru` still
  unreachable, no primary page read for any of them, no photos found for any — each flagged
  accordingly in `Источник`/`History`, same convention as the previous session's Наношкина/
  Преображенская. Ирина Алексеенко's research also surfaced an unconfirmed possible link to
  Perm Opera's leadership — checked directly, the Perm page doesn't mention her at all, so the
  lead was treated as search-index noise and explicitly excluded rather than merged.
- Rebuilt `_site/` via `helpers/build_site.py` and confirmed all 7 new profiles resolve by
  exact-name match in `profiled_people`/`people[name]`.

## Changes Made

- `helpers/build_site.py` — fixed `Performance.people()` to deduplicate `(name, role)` pairs
  before returning, so a person credited via multiple `## Программа` lines (or via both the
  `Автор:` field and the program) in one performance no longer produces one duplicate `<li>` per
  line on their `lyudi/<slug>.html` page or one duplicate entry per line in
  `data/index.json`'s `"people"` field. Reported by the operator against the published Астор
  Пьяццолла page.
- `people/*.md` (7 new files) + `people/photos/*.jpg` (4 new thumbnails): Елена Витман, Жанна
  Домбровская, Иван Новосёлов, Илья Банник, Захар Ковалёв, Злата Рубинова, Ирина Алексеенко.

## Open Items

- [ ] ~24 more recurring people remain un-enriched (31 minus this batch's 7). Continue in a
      future session at whatever pace fits.
- [ ] Игорь Янулайтис, Александр Колесников, Александра Таликова, Елена Балаева — still
      declined, `bolshoi.ru` still unreachable as of this session's check; re-check its
      reachability at the start of the next enrichment session before re-attempting them.
- [ ] Захар Ковалёв, Злата Рубинова, Ирина Алексеенко — written from WebSearch snippets only,
      no primary source (`bolshoi.ru`) read; worth re-verifying once it's reachable again.
- [ ] Иван Новосёлов — written from a primary source, but a dated one (Academy bio, no content
      after ~2015); worth checking for a current main-troupe bio page if one ever surfaces.

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
      as `discovery_*` — not lost to summarization (none needed — the 2 research agents'
      findings are already condensed into the 7 new `people/*.md` files and the Steps &
      Findings above, same as prior enrichment batches)
- [x] Structure validated against `sessions/_template.md` (re-read it — do not trust memory;
      when the lint organ exists per GROWTH.md, run it instead)
- [x] `git commit` — stage all changed files; message: `<subject>: <topic>`. **Tick this box in
      the same edit that stages the commit** — its `[x]` state must be written *before*
      `git add`, because this commit freezes the file and the box can never be ticked afterward.

## Retrospective

- Lesson: `Performance.people()` was the single canonical source feeding both the person-index
  page (already correctly deduped there via `perf_count()`, which counts unique performance
  slugs) and the per-person detail page/`data/index.json` (which weren't deduped) — a reminder
  that when a codebase has a "the correct count/list already exists over here" pattern, check
  whether every consumer of the underlying data actually uses it before assuming the fix needs
  to happen at each call site individually. → fixed at the true source (`people()` itself) rather
  than patching each of its two affected consumers separately; no further artifact needed, the
  fix and its rationale are captured in the function's own docstring [project mind, applied
  directly per the operator's explicit bug-fix request — no separate approval needed for a
  direct instruction].
- Pain axis: no significant repeated operational toil this session — same established batch
  pattern (verify roles, group by theatre, parallel research agents, visually verify photos) ran
  cleanly with no new friction. → no countermeasure needed.
- No new principles surfaced this session — the photo-verification discipline applied here is
  already covered by `P-verify-photo-before-write` (ratified in the immediately preceding
  session), and the caution-on-snippet-sourcing / name-collision-exclusion patterns are already
  covered by existing convention and `P-name-collision-blocks-profile` respectively. → already
  covered by existing artifacts (no change).
