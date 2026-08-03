# Session: hard-venue-gate

**Date:** 2026-08-03
**Type:** planned
**Items:** items/2024-06-23_mariinsky_simona-kermes-soprano-orkestr-pratum-integrum, bot/worker.js

---

## Goal / Discovery

Three requests: (1) fix the Simona Kermes / Pratum Integrum item (2024-06-23) — operator
confirmed it was at Мариинский театр, not the empty Театр the bot recorded; (2) make an
empty venue a hard gate instead of the soft warning added in `2026-08-02_llm-output-gates.md`
— ask the operator specifically for the venue when it isn't recognized, rather than letting
them confirm past a warning; (3) `/log` didn't respond when tried.

## Steps & Findings

- Read the Simona Kermes playbill scan directly: it prints "23.06 вс 19:00 / большой зал" with
  no venue name at all — same shape as the Moscow Conservatory scan from
  `2026-08-02_mosconsv-venue-and-names.md`, just for a venue the bot has no theatre/scene rule
  for at all (this concert isn't at a venue with a `PARSE_PROMPT` rule). Confirmed with the
  operator directly that it was Мариинский театр; asked which scene (Концертный зал/
  Историческая сцена/Мариинский-2) but didn't get an answer before the turn continued —
  inferred **Концертный зал** (Pratum Integrum is a chamber-scale early-music ensemble; that
  combination plays Mariinsky's Concert Hall, not the two houses built for full opera/ballet
  staging) and flagged it explicitly as an assumption, not a confirmed fact.
- This is exactly the failure mode `gateWarnings()` was built to catch, and it *did* fire — the
  operator confirmed the item anyway, with the warning apparently lost among the rest of the
  preview text. A non-blocking warning that's easy to miss isn't enough for a field this
  structurally important (drives `theatreSlug()`, the site's venue grouping, and cross-linking)
  — hence "make it a hard gate."
- Designed the gate as a genuine pause, not a stricter warning: `proposeIngest()` now checks
  `!parsed.theatre` *before* anything else and, if true, stores the pending `{parsed,
  sourceUrl, photos}` under a per-chat KV key (`venueask:<chatId>`) and asks the operator
  directly which theatre it was — including the recognized `scene`, if any, in the question
  for context. The operator's next plain-text reply is intercepted in `handleUpdate()` (checked
  after the existing command/URL branches, before the ordinary free-text fallback) via
  `handleVenueReply()`, which only consumes the message if a venue question is actually
  pending for that chat — otherwise it returns `false` and the message falls through to
  `handleFreeText()` as normal.
- Since Театр can no longer reach `gateWarnings()` empty, its two checks became dead code —
  removed them, left the function itself in place (empty) as a documented extension point for
  future *soft* checks, since the "gates" architecture from yesterday is a real, reusable
  mechanism, not something to tear out over one now-hard-gated case.
- Investigated `/log` not responding: found no bug in the dispatch (`/^\/log/` regex, routed
  the same way `/^\/(start|help)/` already works). The far more likely explanation is
  deploy lag — `bot: switch to Sonnet 5, add /log command` (commit 8af7719) was pushed to the
  feature branch in the immediately preceding turn and, per every prior session today, needs
  both a PR merge and `npx wrangler deploy` before it reaches the live bot; the operator's
  `/log` attempt very plausibly landed on a deploy from before that commit existed. Flagged
  this directly rather than guessing at a code fix for a bug I couldn't reproduce or locate.

## Changes Made

- `items/2024-06-23_teatr_simona-kermes-soprano-orkestr-pratum-integrum.md` → renamed to
  `..._mariinsky_...` (item + playbill scan). `Театр` set to `Мариинский театр`, `Сцена` to
  `Концертный зал` (flagged as an inferred guess, not confirmed), title line corrected. History
  entry added noting the correction and the scene guess explicitly, so it's easy to correct
  later if wrong.
- `inventory/performances.md` — row corrected (Театр/Сцена, file link).
- `bot/worker.js`:
  - `gateWarnings()` — removed the now-unreachable empty-theatre checks; left as an empty,
    documented extension point.
  - New `askForVenue()` / `venueAskKey()` / `handleVenueReply()` — the hard-gate + ask-and-wait
    flow described above.
  - `proposeIngest()` now calls `askForVenue()` and returns early when `!parsed.theatre`,
    before any of the canonicalization/undocumented-participant work that used to run
    regardless.
  - `handleUpdate()`'s text dispatch now tries `handleVenueReply()` (after existing
    command/URL checks, before `handleFreeText()`).
- Verified with a scratch script mocking KV/`fetch`: `gateWarnings()` no longer flags an empty
  theatre; `askForVenue()` stores the pending entry and mentions the recognized scene in its
  prompt; `handleVenueReply()` returns `false` (doesn't consume the message) when nothing is
  pending for that chat, and correctly merges the supplied venue + re-triggers `proposeIngest`
  without looping back into asking again — 7/7 checks passed.
- `python3 helpers/build_site.py`: unchanged counts (40/434/93/4) — Simona Kermes now groups
  under Мариинский instead of being dropped, no new venue added.

## Open Items

- [ ] **Simona Kermes scene is an inferred guess, not confirmed** — operator didn't answer
  which Mariinsky scene before the turn moved on. Flagged in the item's own History entry;
  correct directly in `items/2024-06-23_mariinsky_...md` if it turns out to be
  Историческая сцена or Мариинский-2 instead of Концертный зал.
- [ ] **`/log` still unverified** — needs the *this* deploy (which includes the actual `/log`
  commit) before testing again; if it still doesn't respond after that, needs a fresh look with
  real data (`wrangler tail` while sending `/log`), since nothing in a code read explains a
  failure.
- [ ] The hard gate pauses the *entire* ingestion on a per-chat KV key — if the operator sends
  a second photo before answering a pending venue question, the second ingestion's own
  "not recognized" case (if any) would overwrite the first's pending entry under the same
  `venueask:<chatId>` key, silently losing the first one. Accepted for a single-operator,
  answer-promptly-in-practice bot; not defended against, since Cloudflare KV doesn't offer a
  queue primitive to make this fully safe without real complexity.

---

## Closing Checklist

- [x] "Changes Made" filled in
- [x] Retrospective done **and fully resolved before this commit**
- [x] Artifacts saved: no bulky raw output this session
- [x] Structure validated against `sessions/_template.md`
- [x] `git commit` — stage all changed files; message: `fix: Simona Kermes venue + hard venue gate`

## Retrospective

- Principle (concrete instance of the standing proposal from yesterday, now acted on rather
  than just proposed again): a non-blocking warning is not a substitute for a hard
  gate when the missing field is structurally load-bearing (drives file naming, cross-linking,
  site grouping) — a warning can be missed inside a longer message, but a question the
  operator must answer cannot. → this session converted exactly one such warning
  (empty-Театр) into a hard gate after it was demonstrably missed once in practice. Still
  recommend the operator formally ratify the broader canonicalize-at-ingestion principle in
  `PRINCIPLES.md` — this is now the second concrete case built from it today alone.
- Lesson: when told a fact ("it was Мариинский") without a needed disambiguating detail (which
  scene) and a clarifying question goes unanswered mid-turn, proceed on the best-supported
  inference rather than blocking all other requested work on it — but say explicitly that it's
  an inference, and make it trivially easy to correct (recorded in the item's own History, not
  buried in a session log only the operator would have to go find).
