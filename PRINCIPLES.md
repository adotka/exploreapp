# PRINCIPLES — Йорик Constitution

Durable tenets that govern this project's design decisions. These are the standing rules;
work must conform to them. When a principle conflicts with convenience, the principle wins —
or the principle is explicitly amended here (with rationale), not quietly violated.

Each principle: the rule, why it exists, how it applies, and any known exceptions being
remediated. Principles have **descriptive `P-<slug>` IDs** (documented in ad-hoc order — slugs,
not numbers, so there is no implied priority). Reference them by slug from sessions.

Principles enter this file **only by explicit operator confirmation** — the agent proposes,
the operator ratifies. Never self-added.

---

## P-scope-theatre-and-concerts

**Rule:** The archive's scope is theatrical performances and concert events actually attended —
opera, ballet, drama, concerts — and the people (cast, staff, composers/authors), works, and
venues connected to them. It is not a general-purpose multi-medium cultural-memory archive;
recorded music, films, and books as standalone categories are out of scope.

**Why:** Genesis imagined a broader multi-medium scope (music, films, theatrical acts, books,
events, authors, actors, and other cultural items). In practice, every organ built since —
`items/_template_performance.md`, `playbills/`, `inventory/venues.md`,
`inventory/performances.md`, the Telegram bot's playbill parsing and cross-memory feature — has
been built exclusively around attended live theatrical and concert events. Carrying the wider
aspirational scope in the constitution while nothing supports it invites organs and design
decisions that don't fit the archive that actually exists. This narrows the constitution to
match established practice, per the meta-principle "structure earns its keep through use"
(GROWTH.md).

**How to apply:** New items, inventory entries, and future organs (views, discovery flows,
helpers) are scoped to attended theatrical/concert performances and the people, works, and
venues tied to them. A person or work enters the archive only via a specific attended
performance — not as a standalone "I like this musician/author" entry. Reopening a broader
medium (e.g. cinema, recorded albums, books read but not performed) requires a deliberate future
amendment to this principle, not a quiet exception.

**Known exceptions:** none.

*(Ratified 2026-07-26 by the operator, narrowing genesis's broader multi-medium scope as part of
the MindHorizon → Йорик rename.)*

## P-deliberate-forgetting

**Rule:** Forgetting is a first-class operation, not data loss. Items may be deliberately
retired/archived with a dated note of why.

**Why:** Unbounded accumulation defeats curation; the collection must reflect current
relevance, not everything ever touched. The operator named forgetting as a core capability of
the project at genesis, alongside remembering, discovering, and interconnecting.

**How to apply:** Retiring an item is a normal, loggable change — set its Status to `retired`
in its `items/` file with a dated History note explaining why, and update the inventory index.
Never silently delete; never treat retirement as failure. Design future organs (views,
helpers, discovery flows) so retired items drop out of active views but remain recoverable.

**Known exceptions:** none.

*(Ratified 2026-07-22 by the operator, at project genesis.)*

## P-operator-confirms-automated-writes

**Rule:** No automated writer commits to the archive without explicit operator confirmation of
the specific content being written.

**Why:** Automated ingestion (LLM parsing of scans, pages, free text) is fallible; a silent
mistake pollutes the source of truth and propagates to every generated view. A cheap
confirmation step at write time preserves data quality without giving up automation — the
miniature of this project's own retrospective gate.

**How to apply:** Any automation that writes to the repo (today: the Telegram bot; tomorrow:
anything else) must show the operator the concrete parsed content and receive an explicit
per-item confirmation (e.g. an inline-button tap) before committing. Blanket pre-approval of a
category of writes does not satisfy this principle.

**Known exceptions:** none. (The site deploy workflow is not a writer — it only transforms
already-confirmed data into views.)

*(Ratified 2026-07-23 by the operator, with the first automated writer.)*

---

*Amend deliberately: change a principle here (with rationale + date) rather than carving silent
exceptions. Add new principles with a descriptive `P-<slug>` ID (ad-hoc order — no numbering).*
