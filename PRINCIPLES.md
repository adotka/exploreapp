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

## P-trust-fresh-source-over-hint

**Rule:** When a research/verification pass returns a finding that conflicts with a hint or
assumption supplied to it (voice type, credited role, identity), treat the fresh primary-source
finding as authoritative and re-verify directly against the project's own source data (e.g.
grep `items/*.md`) before writing anything — never silently pick a side or downgrade confidence
without resolving the conflict against a primary source.

**Why:** Across the recurring-people enrichment batches, hints supplied to research agents
(often carried over from an earlier verification pass, or across a context-compaction
boundary) turned out wrong more than once — a voice type, and in one batch six people's actual
professions/roles entirely. Each time, the research agent's fresh finding against a live
official source was correct and the stale hint was not. Guessing which one to trust, or
splitting the difference, risks writing a fabricated or mismatched fact into a source-of-truth
file.

**How to apply:** On any hint/finding conflict, re-run the grep against `items/*.md` (or the
equivalent primary source) before writing the profile — don't resolve it from memory or by
picking whichever seems more plausible. If the primary source itself is ambiguous, flag and
skip per the existing "never fabricate facts" convention rather than force a resolution.

**Known exceptions:** none.

*(Ratified 2026-07-27 by the operator, during the third recurring-people enrichment batch.)*

---

## P-shared-facts-own-entity

**Rule:** A fact that describes a *recurring* entity (a person, a composition/work, a venue) —
not a specific event — gets its own file, matched to event records by exact-string identity
(name/title), never duplicated inline into every event that references it. Only genuinely
per-event specifics (who conducted this particular showing, which cast sang it) stay inline on
the event record.

**Why:** This session needed a home for composition descriptions and librettos. Copying the
same opera's description into every `items/*.md` that stages it would drift (edits would need
to hit N files) and bloat the source-of-truth records with repeated content. `people/` already
solved this exact shape of problem (bio/photo matched by exact name); `works/` (this session)
is a second, independent instance of the same resolution — two occurrences is enough to call it
a pattern rather than a one-off.

**How to apply:** When a new fact type is proposed, first ask whether it is a property of the
event or of a shared underlying entity the event merely references. Model the latter as its own
file in a dedicated folder, matched by exact-string identity to how the entity is named in
`items/*.md` — the same discipline as `people/`: identical string, no aliasing, no matching by
filename slug.

**Known exceptions:** none yet observed. If a third recurring-entity fact type (e.g. venue-level
history) arises, apply the same resolution rather than re-deriving it.

*(Ratified 2026-07-27 by the operator, during the works/ (compositions) enrichment session.)*

---

## P-name-collision-blocks-profile

**Rule:** `people/`'s identity model matches by exact printed name string (per
P-shared-facts-own-entity). When a name is found to be shared by **two or more distinct real
people** — not the same person spelled two ways — no `people/<slug>.md` profile is written for
that name, by bot or by human, until the collision is disambiguated. A single shared-name file
would silently merge two real people's facts (bio, photo, roles) into one record with no way to
tell them apart later.

**Why:** This session's enrichment batch hit two real collisions: «Алексей Смирнов» resolved to
two different Bolshoi Theatre professionals (a singer and a stage director), and a Mariinsky
roster lists two different people both as «Виталий Янковский» (the site itself disambiguates
them internally; playbill credits don't). Neither is resolvable from the credited role text
alone. The bot now auto-drafts `people/` profiles for newly-recurring participants unattended
(this session's other change) and has no way to detect a collision — it will happily write one
merged profile under a shared name unless this is a standing rule, not just a one-off judgment
call made by whoever happens to notice.

**How to apply:** Before writing a profile (human research pass or automated draft), treat a
name match against ambiguous/conflicting biographical details (different roles, different
theatres/companies, inconsistent training history across sources) as a signal of a possible
collision, not a single messy bio — verify against a primary source before concluding it's one
person. If a collision is confirmed or can't be ruled out, leave the name unprofiled and record
the collision (e.g. in the session's Open Items) rather than guessing or merging. The bot itself
has no collision-detection today — this is a human-side safeguard until/unless the bot gains one
kb/inventory of known-ambiguous names to check against.

**Known exceptions:** none. `people/*.md` currently has no disambiguation mechanism (e.g. a
suffixed `Имя`) — if a collision needs to be resolved rather than just left unprofiled, that's a
deliberate future extension, not a silent workaround.

*(Ratified 2026-08-08 by the operator, during the recurring-people auto-enrichment session.)*

---

## P-viewer-prefs-are-client-side

**Rule:** A setting that changes only how existing facts are *displayed* to a particular viewer
(date format, filters, theme, language) is stored client-side (e.g. `localStorage`), scoped to
that browser — never written to the repo, never a build-time option, never data.

**Why:** This session added a date-format toggle (ГГГГ-ММ-ДД / ГГГГ-ДД-ММ). The underlying fact
(the date) is unchanged — only its presentation varies per viewer. Committing a chosen format to
the repo would conflate a viewing preference with the archive's actual facts, and would make the
canonical format ambiguous for other automated readers (e.g. the bot, which needs `YYYY-MM-DD`
unambiguously).

**How to apply:** When a display-only preference is proposed, render the canonical value once (in
the format the rest of the codebase already relies on — e.g. `data-iso="YYYY-MM-DD"`) and let
client-side JS reformat it for display from a `localStorage` setting. Never let a display
preference alter what's written to `items/*.md`, `data/index.json`, or any other durable file.

**Known exceptions:** none yet.

*(Ratified 2026-07-27 by the operator, during the date-format-toggle session.)*

---

*Amend deliberately: change a principle here (with rationale + date) rather than carving silent
exceptions. Add new principles with a descriptive `P-<slug>` ID (ad-hoc order — no numbering).*
