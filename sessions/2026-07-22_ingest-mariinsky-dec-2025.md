# Session: ingest-mariinsky-dec-2025

**Date:** 2026-07-22
**Type:** planned
**Items:** Севильский цирюльник (2025-12-14), Турандот (2025-12-15)

<!-- Type is exactly `planned` or `out-of-band` — no other values. Describe what kind of
     session this was in Goal/Discovery, not here. -->

---

## Goal / Discovery

The operator supplied two Mariinsky playbill links from December 2025. Ingest both per
runbook/ingest-playbill.md.

## Steps & Findings

- kb URL-code note again predicted date/time/scene for both links (scene 2 = Мариинский-2,
  scene 3 = Концертный зал); pages confirmed.
- Fetched both pages; extractions saved verbatim as two `discovery_*` files.
- **Севильский цирюльник** — опера Джоаккино Россини, Мариинский-2, 2025-12-14 19:00;
  постановка Алена Маратры (премьера 2014-10-29); музыкальный руководитель Валерий Гергиев,
  дирижёр Заурбек Гугкаев; 6 исполнителей (Ольга Пудова — Розина).
- **Турандот** — опера Джакомо Пуччини, Концертный зал, 2025-12-15 19:00; постановка Шарля
  Рубо (премьера 2025-02-24); дирижёр Кристиан Кнапп; 7 исполнителей.
- Both venue scenes matched `inventory/venues.md`; no registry change.
- Site rebuilt: 8 спектаклей, 63 людей, 8 произведений; new cross-links confirmed
  (Ольга Пудова: Лакме + Севильский цирюльник; Андрей Спехов: обе декабрьские оперы;
  Кристиан Кнапп now threads three evenings).
- **Pain axis fired:** the same ad-hoc link-checker heredoc was retyped for the third session
  in a row → built `helpers/check_links.py` (operator-approved) and pointed
  runbook/ingest-playbill.md step 4 at it; used it for this session's verification.

## Changes Made

- `items/2025-12-14_mariinsky_sevilskii-tsiryulnik.md`, `items/2025-12-15_mariinsky_turandot.md`
  — created from the performance template.
- `inventory/performances.md` — two rows added.
- `helpers/check_links.py` — new helper (operator-approved).
- `runbook/ingest-playbill.md` — step 4 now invokes the link checker (operator-approved).
- Session artifact dir with two `discovery_*` files.

## Open Items

- [ ] Впечатления for both evenings are empty — operator may dictate later.

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
      as `discovery_*` — not lost to summarization
- [x] Structure validated against `sessions/_template.md` (re-read it — do not trust memory;
      when the lint organ exists per GROWTH.md, run it instead)
- [x] `git commit` — stage all changed files; message: `mariinsky: ingest December 2025
      playbills`. **Tick this box in the same edit that stages the commit** — its `[x]` state
      must be written *before* `git add`, because this commit freezes the file and the box can
      never be ticked afterward.

## Retrospective

- Repeated ad-hoc link-checking (3 sessions running) → helpers/check_links.py (added) +
  runbook/ingest-playbill.md step 4 (edited), both operator-approved  [project mind]
- Lessons axis: ingestion mechanics stable; kb URL note keeps paying off → already covered by
  kb/mariinsky-playbill-urls.md (no change)
- Principles axis: nothing constitution-level surfaced → declined
