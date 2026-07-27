# Session: date-format-toggle

**Date:** 2026-07-27
**Type:** planned
**Items:** helpers/build_site.py, PRINCIPLES.md

<!-- Type is exactly `planned` or `out-of-band` — no other values. Describe what kind of
     session this was in Goal/Discovery, not here. -->

---

## Goal / Discovery

Operator asked for a client-side setting plus the style/JS to display all dates on the site two
ways: `YYYY-MM-DD` or `YYYY-DD-MM`.

## Steps & Findings

- Found all four places a performance date is rendered on the generated site
  (`helpers/build_site.py`): the performances table row, the performance-page fact list, the
  performance-page meta line, and a person's per-role history line. All read from the single
  `Performance.date` field, already stored as `YYYY-MM-DD` per this project's date convention.
- Added a `date_span()` helper wrapping each rendered date in
  `<span data-iso="YYYY-MM-DD">YYYY-MM-DD</span>` — the canonical ISO value stays in the
  attribute; only the visible text changes with the viewer's chosen format. Replaced all four
  `esc(p.date)` call sites with it.
- Added a toggle button (`#date-fmt-toggle`) to the header, rendered on every page via the shared
  `page()` shell, plus a small site-wide `<script>` (also in `page()`, so it runs on every page)
  that reads/writes the choice to `localStorage["dateFormat"]` (`ymd`/`ydm`) and rewrites every
  `[data-iso]` element's text accordingly on load and on click. No page reload needed; the choice
  persists across pages and future visits in that browser.
- Verified the emitted JS both syntactically (`node --check` on the extracted `<script>` body)
  and behaviourally: a small ad-hoc harness faked `document`/`localStorage` and drove the actual
  click handler, confirming `2025-12-15` → `2025-15-12` on toggle and back, and that the button's
  own label updates in step — not just a syntax check, following the smoke-test practice from the
  bot sessions.
- Rebuilt the site and ran `helpers/check_links.py` — both clean.
- Scanned the retrospective's principle axis: this is the first *persisted* viewer-facing display
  setting on the site (the existing "only recurring" checkbox filter on Участники is not
  persisted). Proposed a principle to the operator covering where such settings should live going
  forward; confirmed and ratified (see Retrospective).

## Changes Made

- `helpers/build_site.py`: new `date_span()` helper; all four performance-date render sites now
  emit `<span data-iso="...">`; header gained a `#date-fmt-toggle` button; `page()` shell gained a
  site-wide `<script>` implementing the localStorage-backed format toggle; CSS for
  `.date-fmt-btn`.
- `PRINCIPLES.md`: added `P-viewer-prefs-are-client-side` (operator-ratified).

## Open Items

- [ ] None.

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
      as `discovery_*` — not lost to summarization (none — the code diff is itself the durable
      distillation)
- [x] Structure validated against `sessions/_template.md` (re-read it — do not trust memory;
      when the lint organ exists per GROWTH.md, run it instead)
- [x] `git commit` — stage all changed files; message: `site: add client-side date-format toggle
      (YYYY-MM-DD / YYYY-DD-MM)`. **Tick this box in the same edit that stages the commit** — its
      `[x]` state must be written *before* `git add`, because this commit freezes the file and the
      box can never be ticked afterward.

## Retrospective

- Lesson: smoke-testing generated inline JS with a fake DOM (not just `node --check`) again
  caught the actual toggle behaviour end-to-end, same discipline established in the
  participants-venues session for bot code, now applied to `build_site.py`'s emitted JS →
  reinforces existing practice, no artifact change.
- Pain axis: no repeated operational pain — single small, self-contained feature.
- Principle: a display-only, per-viewer setting (date format) had no prior home in this project's
  conventions — proposed and the operator ratified `P-viewer-prefs-are-client-side` in
  `PRINCIPLES.md` (client-side/localStorage only, never repo data, canonical format stays
  `YYYY-MM-DD` for other readers like the bot).
