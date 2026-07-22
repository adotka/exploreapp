# PRINCIPLES — MindHorizon Constitution

Durable tenets that govern this project's design decisions. These are the standing rules;
work must conform to them. When a principle conflicts with convenience, the principle wins —
or the principle is explicitly amended here (with rationale), not quietly violated.

Each principle: the rule, why it exists, how it applies, and any known exceptions being
remediated. Principles have **descriptive `P-<slug>` IDs** (documented in ad-hoc order — slugs,
not numbers, so there is no implied priority). Reference them by slug from sessions.

Principles enter this file **only by explicit operator confirmation** — the agent proposes,
the operator ratifies. Never self-added.

---

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

---

*Amend deliberately: change a principle here (with rationale + date) rather than carving silent
exceptions. Add new principles with a descriptive `P-<slug>` ID (ad-hoc order — no numbering).*
