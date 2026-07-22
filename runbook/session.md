# Session Procedure

## Starting

1. Create `sessions/YYYY-MM-DD_topic.md` by **copying** `sessions/_template.md` — never write
   the structure from memory. **Read the template first.**
2. Check `kb/` for notes relevant to the subject at hand.
3. State the goal clearly at the top.
4. Record all steps, findings, and changes as you go.
5. If the session produces artifacts (plans, scripts, raw output), create
   `sessions/YYYY-MM-DD_topic/` and place files there:
   `plan_<what>.md` · `discovery_<subject>_<what>.txt` · `script_<what>.<ext>`
6. **Save raw output, don't just summarize it.** Any bulky output worth reading twice goes into
   the artifact dir as `discovery_*` at the moment it is produced — the session body gets the
   summary, the artifact keeps the evidence.

> **Resuming after a context compaction / summary hand-off:** the summary does not carry the
> template structure. Re-read `sessions/_template.md` before creating *or closing* any file.
> Rebuilding structure from memory is what produces malformed headers and missing sections.

## Closing

1. Fill in "Changes Made" in the session file.
2. Follow the Closing Checklist in the session template.
3. **Retrospective — this is a gate: it must complete in full — scan, propose, obtain
   the operator's confirmation, and *apply* every approved change (or record an explicit
   decline) — before the mechanical close (steps 4–5) begins.** Review three axes:
   - **Lessons** worth keeping — avoidable detours, useful human interventions, newly-learned
     facts.
   - **Significant repeated operational pain** — recurring friction or toil. For each, propose
     a viable countermeasure, not just a note of the annoyance.
   - **Non-trivial practical principles** — a durable "always/never X, because Y" governing
     future decisions. Propose for PRINCIPLES.md; the operator ratifies, never self-add.
   For **each** item, do exactly one of: amend the owning artifact (project-mind edits need
   the operator's approval first; project data updates freely) · add a ratified principle · open
   a task (once task tracking exists — GROWTH.md) · decline. **No unresolved items may cross
   into the commit.** Record each as a one-line disposition in `## Retrospective`.
4. **Validate:** re-read `sessions/_template.md` and verify the session file's structure
   matches (header fields, enum values, required sections, checklist state). When the lint
   organ exists (GROWTH.md), run it in enforce mode instead.
5. **Commit:** stage all changed files, then **confirm the staging matches intent with
   `git status` / `git diff --cached --stat` before committing** — especially after a `git mv`
   followed by content edits. Message: `<subject>: <topic>`.
