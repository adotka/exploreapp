# Session: rename-yorik-narrow-scope

**Date:** 2026-07-26
**Type:** planned
**Items:** (project mind — no individual items)

<!-- Type is exactly `planned` or `out-of-band` — no other values. Describe what kind of
     session this was in Goal/Discovery, not here. -->

---

## Goal / Discovery

Operator request: rename the project from MindHorizon to «Йорик» with subtitle «Я знал его…»
(Hamlet's line — fits both the deliberate-forgetting/remembering theme and the Telegram bot's
existing cross-memory feature, already named `i-knew-him-bot`), and update the constitution
(PRINCIPLES.md) to narrow the project's scope to theatrical/concert events tracking and
discovery.

## Steps & Findings

- Located every editable "MindHorizon" occurrence: `AGENTS.md`, `PRINCIPLES.md`,
  `bot/worker.js`, `helpers/build_site.py`.
- `sessions/2026-07-22_project-genesis.md` and `sessions/2026-07-22_theatre-inventory-and-site.md`
  also mention MindHorizon — left untouched per session immutability; they correctly record
  what the project was called at the time.
- No infrastructure identifiers needed to change: GitHub repo name (`exploreapp`), Cloudflare
  Worker name (`i-knew-him-bot` — already matches the new branding), and `SITE_URL` all stay as
  they are; renaming any of those would break a live URL/deployment and wasn't asked for. The
  request was about the project's conceptual name and constitution, not infra identifiers.
- Checked `items/_template.md` and `items/_template_performance.md` for a broad multi-medium
  `Type` enum needing narrowing — found none. The item schema was already narrowed to
  `Type: performance` in practice; only the constitution's stated scope needed to catch up to
  what had actually been built (genesis's prose in `AGENTS.md` still said "music, films,
  theatrical acts, books, events, authors, actors, and other cultural items").
- Rebuilt the site (`python3 helpers/build_site.py`) and ran `helpers/check_links.py` — both
  clean; new title/brand/tagline render correctly (`<title>Спектакли — Йорик</title>`, header
  shows "Йорик" + "Я знал его…").

## Changes Made

- `AGENTS.md` — title renamed to «Йорик»; epigraph «Я знал его…» added; Project Purpose intro
  narrowed from the broad multi-medium scope to theatrical/concert performances and the people,
  works, and venues connected to them; folder-tree root label updated to `Йорик/`.
- `PRINCIPLES.md` — title renamed to «Йорик» Constitution; new principle
  **P-scope-theatre-and-concerts** ratified, narrowing the archive's scope to attended
  theatrical/concert events (see principle text for full rule/why/how-to-apply).
- `bot/worker.js` — user-facing bot text (`HELP`, health-check response) and file header
  comment renamed to «Йорик».
- `helpers/build_site.py` — module docstring, page `<title>`, header brand, and CLI description
  renamed to «Йорик»; added a `.tagline` header element showing «Я знал его…» on every page.

## Open Items

(none)

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
      as `discovery_*` — not lost to summarization (none — this was a targeted text rename, no
      bulky raw output produced)
- [x] Structure validated against `sessions/_template.md` (re-read it — do not trust memory;
      when the lint organ exists per GROWTH.md, run it instead)
- [x] `git commit` — stage all changed files; message: `yorik: rename project and narrow
      constitution to theatre/concert scope`. **Tick this box in the same edit that stages the
      commit** — its `[x]` state must be written *before* `git add`, because this commit
      freezes the file and the box can never be ticked afterward.

## Retrospective

- Lesson: real usage had already narrowed the project to theatrical/concert performances well
  before the constitution caught up — the broad genesis scope sat unchallenged in `AGENTS.md`
  prose for a month of active work that never touched it. → already covered by GROWTH.md
  meta-principle 1 ("structure earns its keep through use") — no new artifact needed, this
  session is that principle being applied, not a new lesson about it (no change)
- Pain axis: no repeated operational pain this session (single coherent rename+amend task, no
  toil) → declined
- Principle surfaced: the archive's scope should be constitutionally bound to attended
  theatrical/concert events, not the aspirational broader multi-medium scope from genesis →
  PRINCIPLES.md **P-scope-theatre-and-concerts** (added, operator-ratified — this was the
  operator's own explicit request, not a self-proposed principle)
