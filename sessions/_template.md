# Session: <topic>

**Date:** YYYY-MM-DD
**Type:** planned | out-of-band
**Items:** <subject1>, <subject2>

<!-- Type is exactly `planned` or `out-of-band` — no other values. Describe what kind of
     session this was in Goal/Discovery, not here. -->

---

## Goal / Discovery

<!-- Planned: what you set out to do.
     Out-of-band: what change was discovered and when. -->

## Steps & Findings

## Changes Made

## Open Items

- [ ] ...

---

## Closing Checklist

- [ ] "Changes Made" filled in
- [ ] Retrospective done **and fully resolved before this commit** (it is a gate, not a note):
      all three axes scanned (lessons · repeated operational pain · surfaced **principles**);
      each **routed into a durable artifact** — owning artifact amended and the edit applied
      (project-mind/PRINCIPLES.md edits got the operator's approval *and* were applied), a task
      opened, or explicitly declined — and logged as a one-line disposition in
      `## Retrospective` below. **No item may be left unconfirmed or carried forward.**
- [ ] Artifacts saved: bulky raw output worth reading twice is in `sessions/YYYY-MM-DD_topic/`
      as `discovery_*` — not lost to summarization
- [ ] Structure validated against `sessions/_template.md` (re-read it — do not trust memory;
      when the lint organ exists per GROWTH.md, run it instead)
- [ ] `git commit` — stage all changed files; message: `<subject>: <topic>`. **Tick this box in
      the same edit that stages the commit** — its `[x]` state must be written *before*
      `git add`, because this commit freezes the file and the box can never be ticked afterward.

## Retrospective

<!-- A retrospective's output is an EDIT TO A DURABLE ARTIFACT, not a journal entry. Route each
     item to the artifact that owns it, make the edit there, and record ONLY the disposition
     here — one line per item.

     Review THREE axes: (1) lessons (avoidable detours, useful human interventions, new facts);
     (2) significant REPEATED OPERATIONAL PAIN — toil/friction that recurred this session; for
     each, propose a viable COUNTERMEASURE and route it — build now if small, else open a task;
     (3) NON-TRIVIAL PRACTICAL PRINCIPLES — a durable "we should always/never do X, because Y"
     governing FUTURE decisions. Propose each for PRINCIPLES.md — add ONLY with explicit
     operator confirmation; never self-ratify. Retrospection is a GATE: confirmation AND
     application of approved changes (or an explicit decline) must complete BEFORE the commit.

       <item> → AGENTS.md / runbook/<x>.md / <template> / helper (edited or added)  [project mind]
       <item> → kb/<x>.md (edited)  [project data]
       <principle> → PRINCIPLES.md P-<slug> (added, operator-confirmed)
       <item> → task opened (too big for the close)
       <item> → already covered by <artifact> (no change)
       <item> → declined (<why no durable change is warranted>)

     If nothing durable came up: "No durable lessons this session." -->
