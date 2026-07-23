# Session: telegram-bot-v2

**Date:** 2026-07-23
**Type:** planned
**Items:** (bot infrastructure — no individual items)

<!-- Type is exactly `planned` or `out-of-band` — no other values. Describe what kind of
     session this was in Goal/Discovery, not here. -->

---

## Goal / Discovery

Build the V2 Telegram ingestion bot on Cloudflare Workers per the operator's request:
(1) playbill ingestion from photo/scan, PDF, link, or free text with automatic Claude-API
parsing; (2) «current act» detection from shared location + time; (3) the cross-memory
feature — when proposing an act, tell the operator which of its staff/cast they have already
seen and where («Вы уже встречали: Михаил Петренко — „Аида“, „Гибель богов“»).

## Steps & Findings

- Loaded the claude-api skill before writing API code. Decisions: raw fetch (no SDK dep in the
  Worker); model `claude-opus-4-8` by default with a `MODEL` var as the cost lever
  (`claude-haiku-4-5` noted as the cheap option); vision via base64 image blocks; PDF via
  document blocks; **structured outputs** (`output_config.format`, strict JSON schema,
  `additionalProperties: false`) so parses are always machine-valid.
- Architecture keeps the repo as the only store: the bot's people-memory is
  `_site/data/index.json`, a machine index now emitted by `helpers/build_site.py` next to the
  HTML — always current after every deploy, no database. Pending parses live in Workers KV
  with a 24h TTL between preview and confirmation tap.
- Confirmation flow: every parse is shown as a preview with inline ✅/❌ buttons; only ✅
  commits (item file + sorted inventory row + optional scan in playbills/) via the GitHub git
  data API as one atomic `bot:` commit, which triggers the normal Pages rebuild.
- Location flow: nearest venue by coordinates (canonical table now in inventory/venues.md,
  approximate, mirrored as VENUES in the worker) → today's mariinsky.ru day page → Claude
  picks the event matching the scene and current time → full parse of the event page →
  preview with known-people lines.
- Access control: webhook secret-token header check + operator chat-ID allowlist.
- Tested locally: Node syntax + unit tests for slugify/venue-matching/item rendering/sorted
  inventory insertion/known-people matching — all green; site rebuild + check_links clean;
  index.json verified (12 perfs, 103 people; Петряник correctly shows 6 appearances).
- Surfaced and resolved at the gate: bot commits would violate the every-work-is-session-logged
  rule → AGENTS.md convention added (bot commits are data-only, operator-confirmed,
  `bot:`-prefixed, session-exempt; next human session retrospects them). The confirm-tap was
  ratified as constitutional: P-operator-confirms-automated-writes.

## Changes Made

- `bot/worker.js`, `bot/wrangler.toml`, `bot/package.json` — the Worker (operator-approved).
- `helpers/build_site.py` — emits `_site/data/index.json` machine index (operator-approved).
- `inventory/venues.md` — canonical venue coordinates added (approximate, to verify in field).
- `runbook/bot.md` — deploy & operate procedure; RUNBOOK.md row added (operator-approved).
- `AGENTS.md` — folder tree gained `bot/`; automated-commit convention added
  (operator-approved).
- `PRINCIPLES.md` — P-operator-confirms-automated-writes ratified.

## Open Items

- [ ] Operator: one-time deploy per runbook/bot.md (BotFather token, Cloudflare account,
      wrangler secrets, KV namespace, setWebhook) — the only steps requiring your credentials.
- [ ] Venue coordinates are approximate — verify on first real location use, then remove the
      «приблизительно» flags in inventory/venues.md and bot/worker.js.
- [ ] First real bot ingestions should be reviewed in the next human session's retrospective
      (per the new convention).

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
      as `discovery_*` — not lost to summarization (none — code lives in bot/, tests were
      throwaway)
- [x] Structure validated against `sessions/_template.md` (re-read it — do not trust memory;
      when the lint organ exists per GROWTH.md, run it instead)
- [x] `git commit` — stage all changed files; message: `bot: build Telegram ingestion worker`.
      **Tick this box in the same edit that stages the commit** — its `[x]` state must be
      written *before* `git add`, because this commit freezes the file and the box can never
      be ticked afterward.

## Retrospective

- Automated commits conflict with the session-logging rule → AGENTS.md automated-commit
  convention (added, operator-approved)  [project mind]
- Automated writers need a content-confirmation gate → PRINCIPLES.md
  P-operator-confirms-automated-writes (added, operator-ratified)
- Bot organ (worker, config, runbook, index.json generator, venue coords) → bot/,
  runbook/bot.md, helpers/build_site.py, inventory/venues.md (added/edited,
  operator-approved)  [project mind + data]
- Site doubles as the bot's data API (index.json) — single source of truth holds → already
  covered by the SSOT convention (no change)
- Pain axis: no repeated toil this session → declined
