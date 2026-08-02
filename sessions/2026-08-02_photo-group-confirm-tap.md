# Session: photo-group-confirm-tap

**Date:** 2026-08-02
**Type:** out-of-band
**Items:** bot/worker.js

---

## Goal / Discovery

Operator reported a 3-page programka upload hung silently — exactly the residual risk flagged
as an open item in `2026-08-02_photo-group-regression.md`: `finishPhotoGroup()`'s heavy
`claude()` call for the group's last page runs under `ctx.waitUntil()`, the same
execution-budget-limited background context that caused the earlier single-photo silent
timeout. That session's fix (awaiting `handleUpdate()` instead of backgrounding it) couldn't be
applied to the album-collation path, because the 2-second debounce wait that detects "no more
pages coming" can't live inside the response Telegram is waiting on without breaking
collation — a genuine tension flagged at the time as unresolved, not fixed. It has now
recurred in practice, so it needs an actual fix rather than staying a documented limitation.

## Steps & Findings

- Considered a Durable Object alarm (the textbook-correct Cloudflare primitive for "run
  something N seconds later, independent of any request") and Cloudflare Queues (a delayed
  producer/consumer, lighter-weight than Durable Objects) — both solve this cleanly but need
  new infrastructure: a wrangler.toml binding, a new export handler, and a one-time
  `wrangler queues create`/DO migration the operator would have to run before deploy, on top
  of unknowns about plan support. Bigger than warranted for a same-day fix when a simpler
  option exists using only what's already deployed.
- Realized the reliable, fully-awaited execution context the single-photo fix already relies
  on — a Telegram `callback_query` — is available for free. `handleUpdate()`'s `cb` branch runs
  inside `fetch()`'s full `await`, giving it the complete request budget, not the constrained
  `waitUntil` grace period. `confirmIngest`/`confirmPick` already do exactly this kind of
  "wait for the operator to tap a button before doing more work" pattern.
- So: keep collation (KV write, 2s debounce, "am I last" check, and the *download* of the
  album's images) in the background as before — downloading a few images over HTTP is a much
  smaller, faster operation than an opus vision+extended-reasoning call, and hasn't been
  observed to time out — but stop short of calling `claude()` there. Instead, store the
  downloaded image blocks in `PENDING` and show a "🔍 Разобрать" button. The heavy `claude()`
  call now only runs once the operator taps it, inside a callback_query handler that
  `handleUpdate()` fully awaits — the same reliable context single-photo uploads already use.

## Changes Made

- `bot/worker.js`:
  - `finishPhotoGroup()` no longer calls `claude()`/`proposeIngest()` directly. It downloads
    the album's images (`tgFile` + base64), stores `{blocks, caption}` in `PENDING` under a
    fresh key (15-minute TTL), and sends a message with two buttons: "🔍 Разобрать"
    (`g:<key>`) and "❌ Отмена" (`x:<key>`, reusing the existing generic cancel handler).
  - New `parsePhotoGroup(env, cb)` — handles the "🔍 Разобрать" tap: loads the stored blocks,
    does the actual `claude()` call and `proposeIngest()`, exactly where the single-photo path
    already does it reliably (inside `handleUpdate`'s awaited `cb` branch, with `claude()`'s
    existing 45s timeout able to actually fire and report an error if needed).
  - Wired `g:` into `handleUpdate`'s callback dispatch alongside the existing `c:`/`p:`/`x:`
    prefixes.
- UX change, called out explicitly: multi-page uploads now need one extra tap ("🔍 Разобрать")
  after all pages are received, before the actual parse starts — trading a small bit of
  friction for the same reliability single-photo uploads now have.
- Verified `python3 helpers/build_site.py` output unchanged (36/387/74/3) — bot-code-only
  change, no data-layer impact.

## Open Items

- [ ] **Unverified against the live bot** — needs a deploy + a real 3-page album test.
- [ ] The "am I last page" collation logic itself (2-second debounce racing across concurrent
  `waitUntil` invocations) is unchanged and still timing-sensitive in principle — not touched
  in this session since it wasn't implicated in the reported hang (the ack message + button
  did/would arrive; it was everything *after* that hung). If page-count detection itself ever
  misfires, that's a separate bug from this one.

---

## Closing Checklist

- [x] "Changes Made" filled in
- [x] Retrospective done **and fully resolved before this commit**
- [x] Artifacts saved: no bulky raw output this session
- [x] Structure validated against `sessions/_template.md`
- [x] `git commit` — stage all changed files; message: `bot: confirm-tap for multi-page parse`

## Retrospective

- Lesson: the prior session (`2026-08-02_photo-group-regression.md`) correctly identified this
  exact risk and explicitly chose not to fix it, reasoning it was a pre-existing (not
  newly-introduced) limitation. That was true, but "pre-existing" isn't the same as
  "acceptable" — the risk was real and materialized within the same day. When a fix session
  flags a known-remaining gap as an open item instead of closing it, that item needs enough
  detail (as this one had) to actually get fixed promptly once it bites, rather than
  re-diagnosed from scratch — which is what happened here: the open item's description was
  exactly the root cause, and the only new work this session was the design/implementation of
  the fix itself. No artifact edit needed beyond this note.
- Principle candidate: any Cloudflare Worker code path that must both (a) respond quickly to
  keep an external system's delivery flowing (Telegram's webhook-sequencing behavior here) and
  (b) eventually do slow/unreliable work (an LLM call) should split those into two separate,
  independently-triggered steps — never try to do both by racing a background timer against
  the platform's own execution-budget limits. A human-facing confirmation tap is a reliable,
  zero-infrastructure way to get a fully-budgeted execution context on Cloudflare Workers.
  → this generalizes the specific fix applied here; not proposed as a formal PRINCIPLES.md
  entry on its own (narrower/more implementation-specific than the ingestion-canonicalization
  principle already proposed multiple times today), but worth remembering if a similar
  "background timer racing an execution budget" pattern shows up elsewhere in `bot/worker.js`.
