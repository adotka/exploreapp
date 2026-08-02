# Session: bot-photo-timeout

**Date:** 2026-08-02
**Type:** out-of-band
**Items:** bot/worker.js

---

## Goal / Discovery

After deploying the earlier `MODEL` revert (haiku → opus-4-8), the operator reported that
uploading a playbill photo produced no response at all — not even the confirmation prompt or
an error — while `/start` and `/help` still worked fine.

## Steps & Findings

- `/start`/`/help` are static replies with no Claude/Telegram-file round trip, so their success
  only rules out webhook/auth/`ALLOWED_CHAT_IDS` issues, not the photo pipeline.
- `handleUpdate`'s message branch wraps everything in try/catch and reports any thrown JS error
  back to the chat (`⚠️ Ошибка: ...`) — so a normal exception should have been visible. True
  silence pointed at execution never reaching that catch at all.
- Added an immediate "📷 Получил, разбираю…" ack to `handlePhoto` (previously only
  `handlePhotoGroup` had one) to (a) give the operator instant feedback regardless of parse
  time, and (b) as a diagnostic — if even the ack doesn't arrive, the update isn't reaching
  `handleUpdate` at all; if it arrives and nothing follows, the hang is downstream.
- Operator ran `npx wrangler tail` and repeated the photo upload: the ack **did** arrive, then
  nothing — confirming the hang is inside/after the `claude()` API call. The tail session
  itself logged "Tail connection lost: the Worker did not respond to a keep-alive ping within
  10000ms," consistent with the Worker isolate becoming unresponsive (platform-level
  termination) rather than a normal JS throw.
- Root cause: `claude()`'s `fetch()` to `api.anthropic.com` had no timeout at all. Combined
  with `effort: "medium"` (now active for any non-Haiku model, including the just-restored
  opus-4-8) on a vision + complex-JSON-schema request, a slow response can run long enough to
  hit the Workers platform's execution limit. When that happens the runtime kills the isolate
  outright — no exception is thrown, so the try/catch in `handleUpdate` never fires and the
  operator sees nothing.

## Changes Made

- `bot/worker.js` `claude()` — added an `AbortController`-based 45s timeout around the Claude
  API fetch. A timeout now surfaces as a normal thrown `Error` ("Claude API не ответил за 45с
  ...") that the existing try/catch reports to the chat, instead of the platform silently
  killing the isolate. This doesn't by itself fix any underlying latency cause — it converts an
  invisible failure into a visible, diagnosable one.

## Open Items

- [ ] If the 45s timeout itself now fires on retry, that confirms latency (not a hard crash) is
  the root cause — next step would be reconsidering `effort: "medium"` for image-heavy calls,
  or raising Workers CPU/duration limits (`[limits]` in `wrangler.toml`, plan-dependent).
  Needs one more `wrangler tail` + retry cycle with the operator to know which.
- [ ] Needs `cd bot && npx wrangler deploy` for this fix to take effect (same manual-deploy gap
  noted in `2026-08-02_okho-rerecognition.md` — still no CI automation for the bot Worker).

---

## Closing Checklist

- [x] "Changes Made" filled in
- [x] Retrospective done **and fully resolved before this commit**
- [x] Artifacts saved: no bulky raw output; the `wrangler tail` excerpt is short enough to keep
      inline in "Steps & Findings"
- [x] Structure validated against `sessions/_template.md`
- [x] `git commit` — stage all changed files; message: `bot: add Claude API timeout`

## Retrospective

- **Significant repeated operational pain, now a fourth occurrence today**: every one of
  today's four merged PRs merged out from under the working branch before the next fix could be
  added, forcing a branch-restart-and-cherry-pick/rebase cycle each time. → same countermeasure
  already proposed in `2026-08-02_okho-rerecognition.md` (CI auto-deploy / at minimum a
  documented restart drill); not duplicating the proposal here, just logging the recurrence.
- Lesson: any `fetch()` to an external API from inside a Cloudflare Worker background task
  (`ctx.waitUntil`) should have an explicit timeout — without one, a slow upstream response
  doesn't degrade gracefully, it gets killed by the platform with zero diagnostic signal. This
  is a general robustness gap, not specific to this one bug. → addressed directly in
  `bot/worker.js` (the only place this repo calls an external API from the bot); no other
  unbounded external `fetch()` calls found in the ingestion path on inspection.
