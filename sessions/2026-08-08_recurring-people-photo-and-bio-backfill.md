# Session: recurring-people-photo-and-bio-backfill

**Date:** 2026-08-08
**Type:** planned
**Items:** (project data — continuing batch of `people/*.md` profiles; no single performance)

---

## Goal / Discovery

Operator request: backfill missing photos and bios on recurring participants. Continues the
two Open Items left by `sessions/2026-08-08_recurring-people-autoenrich.md`: (1) ~78 (now fewer,
see below — bot auto-drafting has been reducing this since) recurring people still without a
`people/*.md` profile at all; (2) the 16 profiles written that session have an empty **Фото**
field because that session's interactive network egress was blocked to arbitrary external
domains (see `kb/interactive-session-network-egress.md`).

## Steps & Findings

- Re-tested the network egress claim from `kb/interactive-session-network-egress.md` before
  trusting it: it's now stale — `ru.wikipedia.org`, `upload.wikimedia.org`, `mosconsv.ru`,
  `belcanto.ru`, `mariinsky.ru`, `zaryadyehall.ru`, `stanmuz.ru`, `daily.afisha.ru`,
  `permopera.ru`, `pravpenie.ru` all reachable via `curl`/`WebFetch` now. One reproducible
  exception: `bolshoi.ru`/`www.bolshoi.ru` — HTTPS CONNECT through the proxy times out or
  `502`s consistently across repeated attempts; `WebFetch` to the same URLs returns "Socket is
  closed". Updated `kb/interactive-session-network-egress.md` to describe this domain-specific
  state instead of the earlier blanket "everything blocked" finding, and to tell future sessions
  to re-check rather than trust the note blindly (egress changed twice in one day).
- Went through all 16 `people/*.md` profiles written by the prior autoenrich session (empty
  **Фото**) and re-attempted photo sourcing now that egress is broader:
  - **5 photos added**: Хосейн Нуршарг (mosconsv.ru), Михаил Король (Wikipedia infobox — the
    article turned out to have a photo after all, contradicting the earlier "not found" note —
    corrected), Яннис Ксенакис (the Wikimedia Commons file already named in the prior
    `Источник`), Азамат Цалити (permopera.ru — cross-checked its career chronology word-for-word
    against the already-documented bio before trusting the photo belongs to the same person, per
    `P-name-collision-blocks-profile`'s spirit), Герман Юкавский (Wikipedia infobox).
  - **1 candidate photo found and rejected**: Анна Озерская's afisha.ru profile image turned
    out, on visual inspection, to be a performance still (two dancers on rocks) unrelated to her
    — not a portrait; discarded rather than used just because a URL existed. (Lesson: always
    view a sourced photo before writing it into a profile, not just trust that an image URL
    found near a name is *of* that name.)
  - **10 more remain without a photo** (11 total unresolved with Озерская above): Алексей
    Морозов, Алексей Сулимов, Анатолий Захаров, Кирилл Филин, Виталий Родин, Марианна Асвойнова,
    Александр Критский, Виктор Боровков (all still sourced only to `bolshoi.ru`, still
    unreachable, and no working alternative source found despite trying secondary sources —
    `chamberopera.ru` 522s, `opera-pokrovsky.ru` redirects to a WordPress login honeypot,
    `meloman.ru`/`operabase.com` unreachable), Анна Сальникова (`chamberopera.ru` unreachable;
    its `gnesin-academy.ru` alternate now 404s — page moved/removed) and Азадэ Амири (bio text
    re-verified word-for-word against `mosconsv.ru`'s now-reachable concert page — confirmed
    accurate, caveat removed — but no photo exists on any checked page). Documented each with
    what was tried this round, so a future session doesn't repeat the same dead ends.
- Scoped the remaining un-enriched recurring-people backlog: 51 people (count ≥ 2, collectives
  excluded), down from the ~78 the prior session projected — the bot's new auto-drafting
  (shipped that same session) has been chipping away at it since. Excluded the 2 already-known
  name collisions (Алексей Смирнов, Виталий Янковский, per `P-name-collision-blocks-profile`).
  Picked the top 20 by frequency, continuing the established batch-size precedent, and verified
  each name's actual credited role(s) directly against `items/*.md` (one `grep` per name) before
  researching — same discipline as the 2026-07-27 batches.
- Grouped the 20 by theatre (10 Bolshoi/Камерная сцена Покровского across two sub-groups sharing
  productions, 5 Mariinsky/Зарядье+Novaya Opera, 5 Novaya Opera+МАМТ) and ran 4 parallel
  general-purpose research agents (5 people each, research-only, no file writes), briefed with
  the confirmed roles and the current network-egress status so none of them wasted calls
  rediscovering the `bolshoi.ru` block.
- Results were sharply bimodal by theatre, as expected: the Mariinsky/Novaya Opera/МАМТ group
  (10 people, reachable official sites) came back mostly HIGH-confidence with primary-source
  bios and photo URLs; the Bolshoi/Покровского group (10 people, `bolshoi.ru` unreachable) came
  back mostly LOW/MEDIUM confidence, snippet-sourced, or empty.
- Wrote 16 of the 20 as profiles, declined 4:
  - **10 HIGH-confidence, primary-sourced, with photo** (downloaded, visually verified before
    writing — same "always look at the photo" discipline from the Озерская rejection above):
    Владимир Комович, Дамир Исмагилов, Александр Морозов, Анжелика Минасова, Артём Гарнов,
    Валерия Пфистер, Александр Титель, Екатерина Лукаш.
  - **2 more HIGH-confidence, primary-sourced, no photo found** (page exists, images are
    JS-loaded and didn't surface in a static fetch): Александр Попов, Дмитрий Пьянов.
  - **1 name-collision check that resolved as the same person, not two**: Александр Морозов —
    the archive's Mariinsky bass and an older-generation bass by the same name turned out, on
    checking career facts across `mariinsky.ru`/Wikipedia, to be one still-active person, not a
    collision — written normally, with the check noted in `History`.
  - **1 unresolved possible namesake explicitly NOT merged**: Артём Гарнов has an unverified
    same-name entry on the (unreachable) `bolshoi.ru` — wrote his profile from the solid
    Novaya Opera facts only, flagged the unconfirmed Bolshoi lead in `History` rather than
    merging it in.
  - **4 written cautiously from WebSearch snippets only** (no primary page reachable —
    `bolshoi.ru`): Демьян Онуфрак, Екатерина Большакова, Александра Наношкина, Виктория
    Преображенская — each flagged in its own `Источник`/`History` as snippet-sourced, not
    primary-verified, same convention the prior session used for Азадэ Амири.
  - **1 confirmed namesake explicitly excluded**: Екатерина Большакова shares her name with an
    unrelated drama actress (b. 1962, Воркутинский драматический театр) — noted in `History` so
    a future editor doesn't accidentally merge that actress's facts in.
  - **2 minimal profiles**: Александр Пономарев and Алексей Нестеренко have no public bio
    beyond their confirmed role on an official roster page (`mariinsky.ru`/`stanmus.ru`) — wrote
    a short profile recording just that, since it's still a primary-source-backed fact worth
    having (unlike a from-scratch guess).
  - **4 declined outright** (no findable bio, or too much identity risk to write anything):
    Игорь Янулайтис (still nothing findable after a second research pass across two sessions;
    the agent also caught and explicitly rejected a fabricated-looking bio — an unrelated
    Lithuanian tenor's facts that a WebSearch synthesis had merged in), Александр Колесников
    (very common name, couldn't confidently disambiguate), Александра Таликова and Елена Балаева
    (Bolshoi stage managers, nothing found beyond the role the archive already had — same
    treatment as Ирина Яцемирская in earlier batches).
- Rebuilt `_site/` via `helpers/build_site.py` and confirmed all 16 new profiles resolve by
  exact-name match in `profiled_people`/`people[name]`.

## Changes Made

- `kb/interactive-session-network-egress.md` — rewritten: the earlier "all external domains
  blocked" finding was stale (confirmed by re-testing); documented the current domain-specific
  state (`bolshoi.ru` unreachable, everything else checked so far reachable) and told future
  sessions to re-check rather than trust the note blindly.
- `people/*.md` (16 files updated, all from the prior autoenrich session's photo-empty batch):
  added photos to Хосейн Нуршарг, Михаил Король, Яннис Ксенакис, Азамат Цалити, Герман Юкавский;
  rejected one bad photo candidate for Анна Озерская after visual inspection; re-verified
  Азадэ Амири's bio word-for-word against a now-reachable `mosconsv.ru` primary source (removed
  the "unconfirmed" caveat); corrected/updated the network-status notes in the remaining 9
  profiles that still have no photo (Алексей Морозов, Алексей Сулимов, Анатолий Захаров, Кирилл
  Филин, Виталий Родин, Марианна Асвойнова, Александр Критский, Виктор Боровков, Анна
  Сальникова) so each records exactly what was tried this session, not just the old blanket
  "network blocked" reason.
- `people/*.md` (16 new files) + `people/photos/*.jpg` (13 new thumbnails — 8 of the 16 new
  profiles got a photo): Владимир Комович, Дамир Исмагилов, Александр Морозов, Анжелика
  Минасова, Александр Попов, Дмитрий Пьянов, Артём Гарнов, Валерия Пфистер, Александр Титель,
  Екатерина Лукаш, Демьян Онуфрак, Екатерина Большакова, Александра Наношкина, Виктория
  Преображенская, Александр Пономарев, Алексей Нестеренко.

## Open Items

- [ ] ~31 more recurring people remain un-enriched (51 minus this batch's 20, minus the 2
      already-known name collisions Алексей Смирнов/Виталий Янковский). Continue in a future
      session at whatever pace fits.
- [ ] Игорь Янулайтис (4 appearances, most-frequent unprofiled person in the whole archive) —
      still no findable bio after a second research pass; one WebSearch synthesis produced a
      fabricated-looking bio (an unrelated Lithuanian tenor's facts) that was correctly rejected
      by the research agent rather than used — worth remembering as a concrete example of why
      WebSearch snippets need scrutiny before being trusted as fact.
- [ ] Александр Колесников — could not confidently disambiguate from other people sharing this
      common name; one unverified snippet ties him to Камерная сцена Покровского but nothing
      solid enough to write. Left unprofiled rather than guess.
- [ ] Александра Таликова, Елена Балаева — both Bolshoi opera stage managers ("режиссёры,
      ведущие спектакль"); no findable bio beyond the role already known from the archive's own
      credits. Left unprofiled — same treatment as Ирина Яцемирская in earlier batches.
- [ ] 9 profiles from the prior autoenrich batch still have no photo (see Changes Made above) —
      all either still blocked on `bolshoi.ru` specifically, or on secondary sources that turned
      out to be broken/unreachable for other reasons (`chamberopera.ru` 522s,
      `opera-pokrovsky.ru` redirects to a WordPress login page, `meloman.ru`/`operabase.com`
      unreachable). Re-check `bolshoi.ru` reachability at the start of any future enrichment
      session before assuming it's still down.
- [ ] 4 of this batch's new profiles (Демьян Онуфрак, Екатерина Большакова, Александра
      Наношкина, Виктория Преображенская) are sourced only to WebSearch snippets, not a directly
      read primary page (bolshoi.ru unreachable) — flagged in each profile's `Источник`/History;
      worth re-verifying against bolshoi.ru directly once it's reachable again.
- [ ] Александр Пономарев, Алексей Нестеренко — minimal profiles (role confirmed via an official
      roster page, no further bio exists publicly for either). Not expected to grow unless a
      primary source publishes more about them later.

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
      as `discovery_*` — not lost to summarization (none needed — the 4 research agents'
      findings are already condensed into the 16 new `people/*.md` files themselves and into
      the Steps & Findings above, same as prior enrichment batches)
- [x] Structure validated against `sessions/_template.md` (re-read it — do not trust memory;
      when the lint organ exists per GROWTH.md, run it instead)
- [x] `git commit` — stage all changed files; message: `<subject>: <topic>`. **Tick this box in
      the same edit that stages the commit** — its `[x]` state must be written *before*
      `git add`, because this commit freezes the file and the box can never be ticked afterward.

## Retrospective

- Lesson: interactive-session network egress is not a stable, one-time-determined fact — it
  changed twice within the same day (from "all external domains blocked" to "broad access except
  `bolshoi.ru`"), and blindly trusting the prior session's `kb/` note would have wasted this
  entire session's photo-backfill effort. → `kb/interactive-session-network-egress.md` rewritten
  to describe the current domain-specific state and explicitly tell future sessions to re-check
  rather than trust it blindly [project data].
- Lesson: a downloaded image found near a person's name is not proof it depicts them — caught
  once this session (Анна Озерская's afisha.ru "profile photo" was actually an unrelated
  performance still) only because the image was actually viewed before writing it into her
  profile. → proposed to the operator as a constitutional principle (see below), not just a
  one-off catch, since the risk (misattributing a photo to a real person) recurs by nature every
  time this workflow runs, and a future automated photo-sourcing step wouldn't have caught it.
- Pain axis: no significant repeated operational toil this session — the photo download/crop/
  resize step is already a one-line `helpers/fetch_person_photo.py` call (built by a prior
  session's own pain-axis countermeasure), and the various domain-reachability checks were each
  one-off diagnostics, not a multi-step manual dance repeated many times in the same shape. → no
  new countermeasure needed.
- Principle surfaced: a sourced photo must be visually inspected before being written into a
  `people/` profile — a URL/filename found near a name is not evidence it depicts that person,
  and this is a standing risk (misrepresenting a real person's likeness), not a one-off mistake.
  → added `P-verify-photo-before-write` to `PRINCIPLES.md`, operator-confirmed.

