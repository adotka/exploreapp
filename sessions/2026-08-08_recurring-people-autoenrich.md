# Session: recurring-people-autoenrich

**Date:** 2026-08-08
**Type:** planned
**Items:** (project mind + project data — bot behavior change, plus a backfill batch of
people/*.md profiles; no single performance)

---

## Goal / Discovery

Operator request (after adding many new performances, which pushed many participants past the
"recurring" threshold for the first time): (1) research and write `people/<slug>.md` profiles
for the newly-recurring people, same as prior enrichment batches; (2) change the bot so it stops
merely *flagging* newly-recurring ordinary participants ("👤 Впервые повторно: ... — стоит
собрать био/фото") and instead drafts+commits a profile immediately, the same way it already
does for authors/collectives/venues.

## Steps & Findings

- Rebuilt `_site/data/index.json` via `helpers/build_site.py` to get current recurring-people
  counts.
- Found and fixed a data-quality bug before treating anyone as "new": `items/2024-06-10_..._
  simon-bokkanegra.md` and `items/2025-03-26_..._tristan-i-izolda.md` credited "Юрий Воробьев"
  (no ё) while the existing profile and every other item use "Юрий Воробьёв" — exact-string
  identity (per `people/_template.md`) means the missing ё silently orphaned two credits from
  his existing profile. Normalized both to "Юрий Воробьёв".
- Scoped the recurring-but-unprofiled list: 98 people (count ≥ 2, placeholders/collectives
  excluded). Separately found 4 people credited only via `## Программа`'s author field
  (`role: автор`/`текст`) who should have been profiled on *first* sighting per policy but
  weren't — Яннис Ксенакис, Хосейн Нуршарг, Азадэ Амири, Михаил Король. (Cross-checking:
  Ксенакис/Нуршарг/Амири's works were added by the bot but Claude apparently wasn't confident
  enough about these to draft a description at ingest time — dropped silently, which is the
  designed behavior for "don't fabricate", not a bug. Also found several other single-occurrence
  bare-surname author credits from an organ recital programme (Бре, Бройтигам, Рефельдт, etc.,
  `items/2022-06-07_..._lada-labzina.md`) — left out of scope this session: too obscure/
  fragmentary to source reliably, and not "recurring" (only the *recurring* subset was in the
  operator's ask); flagged as an Open Item rather than researched blind.
- Continuing the batch-size precedent from `sessions/2026-07-27_people-enrichment*.md` (~19-20
  per pass, not all ~90-98 at once — same reasoning: reliability drops and this is optional,
  incrementally-improvable data, not a completeness requirement), picked a batch of 20: the 4
  missed authors above (always-profile policy) + the top 16 recurring ordinary participants by
  frequency. Verified each name's actual credited role directly against `items/*.md` before
  researching (per the batch-2 lesson in `sessions/2026-07-27_people-enrichment-batch2.md`).
- Ran 4 parallel research-only agents (no file writes) — 3 covering the 16 Bolshoi Theatre
  ensemble participants (mostly small/supporting roles in «Нос», «Ростовское действо»,
  «Катерина Измайлова», «Свадьба Фигаро», «Богема»), 1 covering the 4 composers/authors.
- **Environment finding, discovered independently by all 4 agents:** this interactive session's
  outbound network goes through an org egress proxy that blocks arbitrary external domains
  (bolshoi.ru, wikipedia.org/wikimedia.org, mosconsv.ru, belcanto.ru, even example.com — all
  403 "policy denial", confirmed against `$HTTPS_PROXY/__agentproxy/status`) — `WebFetch`/`curl`
  to a source page or an image file simply doesn't work here, only `WebSearch` (snippets) does.
  Photo download/crop/resize (the pattern from `sessions/2026-07-27_people-enrichment.md`) is
  therefore not possible from this session at all — not a per-person "not found," an
  environment-wide capability gap. Documented in `kb/interactive-session-network-egress.md` so
  future sessions/agent prompts don't re-discover and re-diagnose this 4 separate times.
- 13 of 16 ordinary participants + 3 of 4 authors got solid identifications (official
  `bolshoi.ru/persons/...` pages or equivalent, cross-checked against the actual credited role
  in `items/*.md`); one (Азадэ Амири) is "reasonably confident, not fully primary-source
  verified" per the researching agent — included with only the well-corroborated facts, flagged
  in her `Источник` field. Also corrected a working hypothesis along the way: most of the Bolshoi
  ensemble names turned out to be soloists of the **Камерная сцена имени Б. А. Покровского**
  (the former Pokrovsky Chamber Musical Theatre, absorbed into the Bolshoi in 2018), not the
  Young Artists Opera Program as I'd guessed when briefing the research agents.
- Three names could not be safely profiled and were skipped rather than guessed:
  **Игорь Янулайтис** (most frequent — 7 appearances — but no bio details found anywhere, no
  located official page); **Алексей Смирнов** and **Виталий Янковский** — both turned out to be
  **name collisions**: «Алексей Смирнов» resolves to two different Bolshoi professionals (a
  singer with a `bolshoi.ru` profile and a separate stage director), and «Виталий Янковский» to
  two different people on the Mariinsky roster (the site itself disambiguates them internally;
  the playbill credit doesn't say which). Writing one profile under either shared name would
  have silently merged two real people's facts.
- Wrote 16 `people/<slug>.md` profiles (text bio/short bio + sourced `Источник`, `Фото:` left
  empty per the network finding above) and rebuilt the site index to confirm all 16 link
  correctly by exact-name match (`profiled_people` + non-zero `people[name]` entries).
- Raised the name-collision finding with the operator as a possible new constitutional principle
  — confirmed: ratified as `P-name-collision-blocks-profile` in `PRINCIPLES.md` (the bot's new
  auto-drafting has no way to detect a collision itself, so this is a standing rule, not a
  one-off judgment call).

- **Bot change** (`bot/worker.js`): added `newlyRecurringParticipants(index, parsed,
  excludeNames)` — mirrors `undocumentedParticipants`, but for ordinary (non-author/collective)
  people whose pre-commit index shows exactly one prior appearance (this showing is their
  second). Wired into `proposeIngest`'s existing `entries`/`draftParticipantNotes` pipeline
  (kind `"участник"`, new prompt bullet in `PARTICIPANT_NOTES_PROMPT`) — same drafting,
  same-message confirmation, and same commit-time write (`renderParticipant`, `Фото:` left
  empty — the bot has no photo-sourcing capability) as authors/collectives already had. Removed
  the old post-commit-only flag-and-notify logic in `confirmIngest` (the `newlyRecurring`/
  `recurringNote` block) — the drafted profile now shows up in the same `👤 Новые участники`
  preview section instead of a separate "стоит собрать" note. Verified with `node --check` and a
  standalone logic smoke-test (peopleOf/authorsOf/collectivesOf/newlyRecurringParticipants
  interaction, incl. the already-profiled and author/collective-exclusion cases).
- Updated `runbook/bot.md` (both the mechanism bullet list and the Operating Notes entry) and
  `people/_template.md` (the "when to create a file" guidance) to describe the new behavior;
  updated `AGENTS.md`'s bot-commits paragraph to mention ordinary participants alongside
  authors/collectives.

## Changes Made

- `items/2024-06-10_zaryadye_simon-bokkanegra.md`, `items/2025-03-26_zaryadye_tristan-i-izolda.md`
  — "Юрий Воробьев" → "Юрий Воробьёв" (exact-string identity fix, orphaned credits reattached).
- `people/*.md` (16 new files): Яннис Ксенакис, Хосейн Нуршарг, Азадэ Амири, Михаил Король,
  Марианна Асвойнова, Азамат Цалити, Александр Критский, Алексей Морозов, Анатолий Захаров,
  Анна Озерская, Анна Сальникова, Виктор Боровков, Виталий Родин, Герман Юкавский, Алексей
  Сулимов, Кирилл Филин — text bio/short bio + sourced `Источник`, `Фото:` empty (see network
  finding above).
- `kb/interactive-session-network-egress.md` — new note documenting this session's egress
  restriction, so future sessions/agents don't rediscover it from scratch.
- `bot/worker.js` — added `newlyRecurringParticipants()`; wired ordinary newly-recurring
  participants into the same draft-and-commit-on-confirm pipeline as authors/collectives/venues
  (kind `"участник"` in `PARTICIPANT_NOTES_PROMPT`/`draftParticipantNotes`/`renderParticipant`);
  removed the old post-commit-only flag-and-notify (`newlyRecurring`/`recurringNote` in
  `confirmIngest`); updated the top-of-file doc comment.
- `runbook/bot.md` — documented the new mechanism (new bullet + rewritten Operating Notes entry).
- `people/_template.md` — updated "when to create a file" guidance for ordinary recurring people.
- `AGENTS.md` — bot-commits paragraph now mentions ordinary participants alongside
  authors/collectives.
- `PRINCIPLES.md` — added `P-name-collision-blocks-profile` (operator-ratified).

## Open Items

- [ ] ~78 more recurring people remain un-enriched after this batch (98 minus this batch's 16
      ordinary + 4 authors) — continue in a future session at whatever pace fits, same as the
      2026-07-27 batches; going forward the bot auto-drafts a *text* profile for each as they
      cross the recurring threshold, so this is now about adding/improving photos and text, not
      getting a first profile written at all.
- [ ] Фото for all 16 profiles written this session is empty — this interactive session cannot
      fetch images (see `kb/interactive-session-network-egress.md`); each profile's `Источник`
      has the official page URL to pull a photo from once someone has broader web access.
- [ ] Игорь Янулайтис — most-frequent unprofiled recurring person (7 appearances) but no
      findable bio/official page this pass; left unprofiled rather than guessing.
- [ ] Алексей Смирнов, Виталий Янковский — confirmed name collisions (two distinct real people
      share the printed name in each case); left unprofiled per the new
      `P-name-collision-blocks-profile`. No disambiguation mechanism exists yet in `people/*.md`
      — a future session could add one (e.g. a role-suffixed `Имя`) if these need resolving
      rather than staying unprofiled.
- [ ] Бре, Бройтигам, Брубек–Лабзина, Жан-Люк Перселл, Рефельдт, «Лабзина» (bare surname,
      `items/2022-06-07_zaryadye_lada-labzina.md`) — single-occurrence author credits missed by
      the always-profile-authors policy, too fragmentary/obscure to research blind this session.
      "Лабзина" (bare surname) may just be organist Лада Лабзина crediting her own arrangement —
      worth a human look at the actual playbill scan before deciding whether to normalize the
      name or treat as a separate credit.
- [ ] Ирина Яцемирская — still no public bio/photo after two prior search attempts
      (2026-07-27 batches 1 and 2); not re-attempted a third time this session.

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
      as `discovery_*` — not lost to summarization (none — the 4 research agents' findings are
      already condensed into the 16 `people/*.md` files themselves, the durable artifact here,
      same as the 2026-07-27 batches)
- [x] Structure validated against `sessions/_template.md` (re-read it — do not trust memory;
      when the lint organ exists per GROWTH.md, run it instead)
- [x] `git commit` — stage all changed files; message: `<subject>: <topic>`. **Tick this box in
      the same edit that stages the commit** — its `[x]` state must be written *before*
      `git add`, because this commit freezes the file and the box can never be ticked afterward.

## Retrospective

- Lesson: exact-string identity (per `people/_template.md`/P-shared-facts-own-entity) is
  silently broken by a single-character spelling variant (ё vs е) — "Юрий Воробьев" orphaned two
  credits from his existing profile for who knows how long before this session's scan surfaced
  it. → declined a new artifact this time (single occurrence, cheap to catch by hand via the
  normalized-name diff run this session); if a second instance turns up in a future enrichment
  pass, that's the trigger for a small `helpers/` near-duplicate checker per GROWTH.md's
  pain-axis convention, not before.
- Pain axis: all 4 parallel research agents independently spent tool-calls discovering and
  re-diagnosing the same network-egress block (bolshoi.ru/wikipedia.org/mosconsv.ru unreachable
  from this session) — real repeated toil this session. → countermeasure built now:
  `kb/interactive-session-network-egress.md`, so future sessions brief research agents up front
  instead of letting each one re-discover it.
- Principle surfaced: a name shared by two distinct real people (not the same person spelled two
  ways) must never get a merged `people/` profile — the bot's new auto-drafting (this session's
  other change) has no way to detect this itself, so it needed to be a standing rule rather than
  a one-off judgment call. → added `P-name-collision-blocks-profile` to `PRINCIPLES.md`,
  operator-confirmed.
- No other durable lessons this session (the batch-size precedent, role-pre-verification
  discipline, and "leave blank rather than invent" convention are all already covered by
  `sessions/2026-07-27_people-enrichment*.md` and existing principles — reapplied, not
  rediscovered).
