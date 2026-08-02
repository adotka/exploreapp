# Session: waituntil-fix

**Date:** 2026-08-02
**Type:** out-of-band
**Items:** bot/worker.js

---

## Goal / Discovery

Follow-up to `2026-08-02_bot-photo-timeout.md`: the operator deployed the 45s
`AbortController` timeout added there and retried a photo upload — same result, total
silence, no timeout error either. The operator directly and correctly questioned whether a
Cloudflare platform-level timeout can be reported from inside the same Worker execution that
gets killed by it.

## Steps & Findings

- Answer: no, it cannot. If Cloudflare terminates the isolate for exceeding an execution
  budget, that is not a JS exception delivered to running code — it is the runtime tearing
  down the whole execution context, including any pending `try`/`catch`/`finally`
  (`claude()`'s new `AbortController` timeout included). The previous session's fix rested on
  an unstated assumption — that the hang was a slow-but-eventually-resolving `fetch()` that a
  45s in-process timer would win a race against — which the retry disproved: since nothing
  surfaced even after 45s should have elapsed, whatever kills this happens faster than that,
  and outside anything application code can intercept.
- Re-examined `export default { async fetch(request, env, ctx) { ... } }`: the webhook handler
  returns `new Response("ok")` immediately and defers all real work to
  `ctx.waitUntil(handleUpdate(env, update))`. This is the actual mechanism at fault: Cloudflare
  gives `waitUntil`-scheduled background work (work continuing *after* the response has
  already been sent) a separate, more limited execution grace period than a normally-awaited
  request gets — and when that grace period elapses, the isolate is killed outright, with no
  opportunity for any in-flight code (including a timeout handler) to run.

## Changes Made

- `bot/worker.js` `fetch()` handler — replaced `ctx.waitUntil(handleUpdate(env, update))` +
  immediate response with `await handleUpdate(env, update)` before returning the response. A
  normally-awaited request should get the full request-lifecycle CPU/time budget rather than
  the constrained post-response `waitUntil` grace period, which should let the existing 45s
  `claude()` timeout (from the previous session) actually get a chance to fire and report a
  real error instead of dead silence. Trade-off: the webhook response to Telegram is no longer
  instantaneous — it now takes as long as the actual parse (up to the 45s ceiling) — which is
  within Telegram's own webhook response tolerance, but means Telegram could in principle retry
  the update if that response is slow enough to look like a timeout on Telegram's side,
  potentially double-processing a photo. Not mitigated in this change; flagged as an open item.

## Open Items

- [ ] **Unverified** — this is a plausible, well-motivated fix but not yet confirmed against
  real behavior. Needs one more deploy + retry + `wrangler tail` cycle with the operator.
- [ ] If this *still* doesn't produce a visible error, the next things to check are outside
  this repo's reach: the Cloudflare dashboard's real-time logs for this Worker (may show an
  explicit termination reason `wrangler tail` doesn't surface), and the account's actual
  Workers plan/CPU-limit configuration (`[limits] cpu_ms` isn't set in `wrangler.toml` at all,
  so whatever the platform default is for their plan applies).
- [ ] If Telegram-retry double-processing turns out to be a real problem after this change, the
  fix is either idempotency on `update.update_id`, or moving the slow work off the request path
  entirely (Cloudflare Queue consumer, which gets its own independent, much larger execution
  budget) — bigger change, not attempted here.
- [ ] Deploy still required (`cd bot && npx wrangler deploy`) — same manual-deploy gap noted in
  every bot-fix session today.

---

## Closing Checklist

- [x] "Changes Made" filled in
- [x] Retrospective done **and fully resolved before this commit**
- [x] Artifacts saved: no bulky raw output this session
- [x] Structure validated against `sessions/_template.md`
- [x] `git commit` — stage all changed files; message: `bot: await handleUpdate instead of waitUntil`

## Retrospective

- Lesson: I stated as settled fact, in the previous session's summary, that the new timeout
  "converts an invisible failure into a visible, diagnosable one" — without actually verifying
  that the in-process timeout could win a race against whatever was killing the isolate. That
  was an unverified assumption presented with more confidence than it had earned. The operator
  caught it correctly by asking a direct, specific technical question rather than just
  reporting "still broken." → no artifact edit needed beyond this log entry; noting it because
  it's a pattern worth remembering: a fix that "should" surface an error still needs to be
  confirmed to actually have surfaced one before calling the failure mode solved.
- Lesson: `ctx.waitUntil()` is not a free "run this in the background with the same guarantees
  as the main request" — it has its own, more constrained execution budget on Cloudflare
  Workers, and code running past that budget is killed unconditionally, not exceptioned. Any
  Worker that does non-trivial async work (especially calls to a possibly-slow external API)
  after returning its response should either keep that work well inside whatever the
  `waitUntil` budget actually is, or (as done here) await it before responding. → addressed
  directly in `bot/worker.js`; this is the only place in the codebase using
  `ctx.waitUntil()` for non-trivial work (checked: no other `waitUntil` calls in the file).
