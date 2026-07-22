# AI Assistant Instructions — MindHorizon

You are an AI assistant helping a solo curator with a personal cultural-memory project: remembering, discovering, interconnecting, and — when appropriate — deliberately forgetting music, films, theatrical acts, books, events, authors, actors, and other cultural items.

---

## Project Purpose

Ordered, session-logged work. Every working session is recorded in `sessions/`; knowledge is
routed into durable artifacts; the process improves itself through a gated retrospective at
every session close.

**Design decisions must conform to [PRINCIPLES.md](PRINCIPLES.md)** — the project's standing
tenets (the constitution). Reference principles by slug (e.g. "per P-<slug>") in sessions and
reviews; amend a principle deliberately in that file rather than carving silent exceptions.

---

## Folder Structure

```
MindHorizon/
├── AGENTS.md               # This file (imported by CLAUDE.md)
├── PRINCIPLES.md           # Ratified tenets (constitution) — designs must conform
├── GROWTH.md               # Growth triggers, organ blueprints, paid-for dead ends
├── RUNBOOK.md              # Workflow index → runbook/
├── runbook/                # One file per workflow scenario
│   └── session.md          # Session open/close procedure (the gate lives here)
├── sessions/               # All work logs (immutable once committed)
│   ├── _template.md
│   ├── YYYY-MM-DD_topic.md          # session log (always flat)
│   └── YYYY-MM-DD_topic/            # artifact dir — created only when artifacts exist
│       ├── plan_<what>.md
│       ├── discovery_<subject>_<what>.txt   # raw output worth keeping
│       └── script_<what>.<ext>
├── kb/                     # Distilled durable facts (env-specific notes, one topic per file)
├── inventory/              # Source of truth for the external estate (registry, address plans, topology)
├── items/                  # Per-Items files (one .md each)
│   ├── _template.md
│   └── _template_performance.md     # schema for theatrical acts
├── playbills/              # Source scans of playbills (evidence layer; referenced from items/)
└── helpers/                # Scripts and tools (added when the growth trigger fires)
                            # build_site.py generates the site (_site/, gitignored) from items/
```

This structure is **deliberately minimal**. New organs (task tracking, lint gate, view folders,
reference corpus, SOPs) are added only when their trigger fires — see [GROWTH.md](GROWTH.md).
Never build structure ahead of the pain that justifies it.

---

## Key Conventions

- Dates always in `YYYY-MM-DD` format.
- **Template fidelity and context recovery.** Create every session file (and every templated
  file this project later grows) by **copying** its `_template.md` — never reconstruct the
  structure from memory. After a context compaction or summary hand-off, re-read the relevant
  `_template.md` before creating *or closing* such a file: the summary does not carry the
  template, and rebuilding it from memory is what produces malformed headers, missing sections,
  and invalid enum values.
- **Session immutability.** Session files are immutable records once closed (git commit made).
  Never edit a past session — not to fix errors, not to add missing information. Record
  corrections in a new session.
- **Scope of document edits.** Limit changes to what the new information directly requires.
  Logical consequences are fine; editorial changes — rephrasing, restructuring, adding
  unrequested examples — are not, even if the existing text seems improvable.
- **Single source of truth; edit the canonical file.** When a document exists in more than one
  place (a view, a copy, a mirror), edit only the canonical location and regenerate the rest.
  Never edit a view and copy back.
- **Verify staging before commit.** After staging, confirm the staged set matches intent with
  `git status` / `git diff --cached --stat` — especially after a `git mv` followed by content
  edits, where the rename stages but the later edits are silently left behind.
- Do not store secrets or credentials in this repository. Where a credential is
  operationally relevant, note its existence and where it can be retrieved using the pattern
  "credential — do not expose"; never the value itself. Raw exports that may embed secrets are
  gitignored; only sanitized copies are tracked.
- **Unit file is source of truth.** `items/<NAME>.md` holds all facts about a unit;
  `inventory/` files are summary indexes — update them only for add, retire, or role change.
- **Provisional/unidentified assets.** Assets not yet identified, or not warranting a full unit
  file, get a plain-text row in the inventory describing what's known. Promote to a full unit
  file once identified or once it needs its own record.
- Raw exports from external systems are never edited; sanitized copies are safe for sharing.

---

## Project Mind vs Project Data

The repo has two durable layers. The **project mind** is the *how-we-work* meta layer:
`AGENTS.md` (conventions), `PRINCIPLES.md` (tenets), `GROWTH.md`, the `_template.md` files,
`runbook/` (workflows), and high-level cross-cutting helpers. The **project data** is the
*what-we-know / what-we-did* layer: `sessions/`, `kb/`, and everything the project grows to
hold its facts. **Project-mind changes reshape the process for every future session and need
the operator's approval; project data is updated continuously as work proceeds.**

---

## Retrospection — the gate

**Retrospection routes lessons into durable artifacts.** A session's retrospective is **not a
journal** — its output is an *edit to a durable artifact*. Route every lesson to the artifact
that owns it: a process / convention / workflow / tooling lesson → the **project mind** (with
the operator's approval); a technical or procedural fact → the **project data** (`kb/`, or
wherever the project holds such facts). If the change is too big for the close, open a task
(once task tracking exists — GROWTH.md); if there is no durable lesson, decline it.

Retrospection has a **second input besides lessons: significant repeated operational pain** —
friction or toil that recurred this session (the same fiddly multi-step command driven by hand
many times, an error-prone manual dance). You **must** scan for it and **propose a viable
countermeasure** — a helper/automation, a checklist, or a config/convention change — then route
it like any lesson: build it now if small, else open a task to build it.

Retrospection has a **third input: non-trivial practical principles** — a durable
architectural / security / design tenet that surfaced this session (a "we should always/never
do X, because Y" that would govern *future* decisions, not just resolve this one). You **must**
scan for these and **propose each for the constitution (`PRINCIPLES.md`) for explicit
operator confirmation** — principles are ratified, never self-added.

Retrospection is a **gate on the close, not an afterthought**: the scan, the confirmation, and
the *application* of every approved principle / project-mind edit (or an explicit decline) must
all complete **before the session is committed**. There is no "proposed, carry forward" state —
an item that cannot be confirmed now either holds the close until it is, or becomes a task;
nothing unconfirmed is committed. The session's `## Retrospective` records only a one-line
disposition per item (`lesson/pain/principle → where it landed`), so knowledge lives where it
is read, not buried in an immutable log. Procedure: `runbook/session.md`.

---

## Working Discipline

- Prefer understanding over trial-and-error: establish the model before making
  changes, and change one thing at a time when diagnosing.
- Check `kb/` for relevant notes at the start of any session touching a known subject.
