# Session: people-enrichment-batch3

**Date:** 2026-07-27
**Type:** planned
**Items:** (project data — third batch of the recurring-people enrichment initiative)

<!-- Type is exactly `planned` or `out-of-band` — no other values. Describe what kind of
     session this was in Goal/Discovery, not here. -->

---

## Goal / Discovery

Continuation of `sessions/2026-07-27_people-enrichment.md` and
`sessions/2026-07-27_people-enrichment-batch2.md`: operator asked to "do the rest" — finish
enriching every remaining recurring person (attended in ≥2 distinct performances) who didn't
yet have a `people/*.md` profile. Reused the established organ, sourcing convention, and
parallel-research pattern; also closed out batch 2's flagged toil item and fixed two
pre-existing data-correctness bugs discovered while re-scoping.

## Steps & Findings

- Fixed a genuine recurring-count bug in `helpers/build_site.py`: the emphasis/tooltip feature
  counted (role, performance) tuples via `len(entries)`, not distinct performances, so 5 people
  with 2 credited roles in *one* performance (Анна Матисон, Владимир Фирер, Яннис Коккос,
  Александр Маскалин, Петр Бобровский) were miscounted as "recurring". Added
  `perf_count(entries)` (`len({p.slug for _role, p in entries})`) and replaced all 4
  `len(...)` call sites that gated the recurring badge/tooltip. Verified via rebuild that these
  5 now correctly show count=1.
- Fixed a data bug flagged back in the very first enrichment session but never actioned:
  "Петра Чайковского" (genitive) in two item files corrected to "Пётр Чайковский" (nominative)
  so his profile links correctly.
- Re-scoped "the rest" against the corrected count, giving 50 people; excluded Ирина
  Яцемирская (unenrichable after two prior failed searches across batches 1 and 2) up front
  rather than re-searching a third time, leaving 49.
- Built `helpers/fetch_person_photo.py` (Pillow-based: download → center-crop square →
  180×180 → save), closing the toil item batch 2's retrospective flagged for whoever ran batch
  3.
- Ran 7 parallel/sequential general-purpose research agents (7 people each), same
  research-only brief as prior batches, with roles pre-verified against `items/*.md` before
  writing hints.
- **Caught a real near-miss**: for one group of 7, the role hints I supplied (assumed "ballet
  dancer" for 5 names, one lighting-designer name swapped) didn't match what the research
  agents found on the corresponding mariinsky.ru pages at all. Rather than accept the
  agents' "not found / likely collision" verdict at face value, re-grepped `items/*.md`
  directly for each name and confirmed the agents were right: the actual credited roles were
  video designer, conductor-trainee, mezzo-soprano, baritone, lighting designer, and French
  language coach — none of them ballet dancers. The bad hints were mine, introduced this
  session, not a pre-existing data problem. Wrote all 6 profiles with the roles actually
  confirmed against source data.
- Similarly resolved a role mismatch for Дженнифер Шривер (hinted as movement director; she
  and Максин Брэм's actual mariinsky.ru/`items/*.md` roles are lighting designer and
  assistant-director/choreographer respectively) and a voice-type note for Андрей Спехов
  (mariinsky.ru says баритон, not бас) and Екатерина Латышева (mariinsky.ru says сопрано, not
  меццо-сопрано) — used the official source's classification in both cases rather than the
  hint.
- David Downie (aerial acrobatics stager, «Сон в летнюю ночь») has a real bio but no photo on
  his own mariinsky.ru page (empty `src`); per the template's explicit support for an empty
  Фото field, wrote his profile without fabricating or substituting a photo.
- After a context-compaction boundary mid-session, the two earliest research groups' full
  bio/photo/source text had been summarized away (only names survived). Recovered the exact
  agent output verbatim from the raw session transcript JSONL rather than re-dispatching
  research or reconstructing from memory, preserving sourcing fidelity.
- Downloaded and resized all 48 confirmed photos via `helpers/fetch_person_photo.py`; 4 of the
  Group-F URLs I initially supplied were self-guessed (not agent-verified) and 404'd —
  corrected by fetching the real `mariinsky.ru` bio pages directly and extracting the actual
  `<img src>` before retrying.
- Wrote all 49 `people/<slug>.md` files, rebuilt the site (32 performances, 356 people, 51
  works), and ran `helpers/check_links.py` clean.

## Changes Made

- `helpers/build_site.py`: added `perf_count()`, fixed 4 call sites conflating role-credits
  with distinct-performance count.
- `items/2024-10-11_mariinsky_charodeika.md`, `items/2023-05-17_mariinsky_orleanskaya-deva.md`:
  "Петра Чайковского" → "Пётр Чайковский".
- `helpers/fetch_person_photo.py` (new): photo download/crop/resize helper.
- `people/*.md` (49 new files) + `people/photos/*.jpg` (48 new thumbnails; David Downie has
  none): Алексей Степанюк, Гектор Берлиоз, Александр Михайлов, Анна Шишкина, Алла Бростерман,
  Ахмед Агади, Андрей Спехов, Александр Тимченко, Олег Балашов, Джоаккино Россини, Заурбек
  Гугкаев, Юстус Франтц, Екатерина Малая, Эмиль Фаски, Юрий Кокко, Екатерина Латышева, Егор
  Карташов, Глеб Перязев, Пётр Чайковский, Сергей Скороходов, Владислав Сулимский, Станислав
  Трофимов, Мирослав Молчанов, Анна Денисова, Мария Никитина, Денис Закиров, Магеррам
  Гусейнов, Клаудиа Шолти, Изабелла Байвотер, Дженнифер Шривер, Нина Данн, Максин Брэм, Дэвид
  Доуни, Надежда Сердюк, Оксана Шилова, Виктория Злотникова, Гурген Петросян, Зинаида Царенко,
  Владислав Куприянов, Александр Сиваев, Ксения Клименко, Николай Римский-Корсаков, Екатерина
  Семенчук, Наталья Павлова, Алексей Марков, Сергей Прокофьев, Екатерина Сергеева, Сергей
  Семишкур, Клод Дебюсси.
- `PRINCIPLES.md`: added `P-trust-fresh-source-over-hint` (operator-ratified).

## Open Items

- [ ] Ирина Яцемирская — still no public bio/photo after two prior search attempts across
      batches 1–2; not re-searched this round. Unlikely to resolve without a primary source
      (e.g. a playbill programme) surfacing her.
- [ ] This batch is expected to complete "the rest" of the recurring-people backlog (49 of 49
      non-Яцемирская names enriched). Future sessions only need to enrich newly-recurring
      people as new items are added.

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
      as `discovery_*` — not lost to summarization (none — the `people/*.md` files are
      themselves the durable distillation, consistent with batches 1–2)
- [x] Structure validated against `sessions/_template.md` (re-read it — do not trust memory;
      when the lint organ exists per GROWTH.md, run it instead)
- [x] `git commit` — stage all changed files; message: `people: third enrichment batch (49
      more recurring people) + perf_count bug fix`. **Tick this box in the same edit that
      stages the commit** — its `[x]` state must be written *before* `git add`, because this
      commit freezes the file and the box can never be ticked afterward.

## Retrospective

- Lesson: a genuine recurring-count bug (`len(entries)` conflating role-credits with distinct
  performances) predated this session by several commits and had already produced 5 false
  positives; caught only while re-scoping "the rest" against a fresh count. → fixed in
  `helpers/build_site.py` (`perf_count()`), verified via rebuild [project mind/code].
- Lesson: mid-session context compaction summarized away two research groups' full bio text,
  keeping only names. Recovering the exact text from the raw transcript JSONL (rather than
  re-dispatching research or reconstructing from memory) preserved sourcing fidelity at zero
  extra research cost. → no artifact change needed; noting the technique here since it's not
  yet written down anywhere durable, but doesn't rise to a new organ or convention on its own
  (declined as a standalone artifact edit — the existing "never fabricate facts" / "verify
  before delegating" conventions already cover the underlying discipline this technique
  serves).
- Pain axis: no new repeated operational pain this session — the photo pipeline toil flagged in
  batch 2 was already closed by building `helpers/fetch_person_photo.py` before this batch
  started, and it worked cleanly across all 48 downloads (the 4 retries were a data-accuracy
  issue, not tool friction).
- Principle: hint/finding conflicts (voice type, credited role, and — this session — a
  6-person role misattribution) have now recurred across all three batches, always resolved
  correctly by trusting the fresh primary-source finding and re-verifying against
  `items/*.md`. → proposed to operator and ratified as `P-trust-fresh-source-over-hint` in
  `PRINCIPLES.md` [project mind].
