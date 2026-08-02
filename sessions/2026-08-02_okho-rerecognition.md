# Session: okho-rerecognition

**Date:** 2026-08-02
**Type:** out-of-band
**Items:** 2024-12-08_zaryadye_okho-fizicheskaya-drama

---

## Goal / Discovery

Requested recheck of the latest bot addition ("okno – физическая драма", commit 2a5ffe2,
confirmed via Telegram same day). Reported symptoms: duplicated Зарядье venue again, the
performing ensemble "musicAeterna dance" missing entirely, and misread performer names
(Аркадий Бузаев instead of Айгуля Бузаева; Ансалу Миргафарохан instead of Айсылу Мирхафизхан).
Also asked to re-run recognition, assess whether the current model reliably reads rare names,
and switch to a more capable model if not.

## Steps & Findings

### Venue duplicated again

`inventory/venues.md` had regrown a `## Зал Зарядье` section, identical in shape to the bug
fixed in session `2026-08-02_zaryadye-venue-fix.md`. Root cause: that fix (and the follow-up
`bot/worker.js` PARSE_PROMPT hardening) landed in `main` via PR #1/#2, but the **deployed**
Cloudflare Worker is a separate artifact — `runbook/bot.md` confirms deploys are manual
(`npx wrangler deploy`, "Bot code changes are project mind — session + operator approval, then
`npx wrangler deploy`"). No CI workflow deploys the bot (only `.github/workflows/pages.yml`
exists, for the static site). The merged code fix never reached the running bot, so the same
bug fired again on this ingestion.

### Read the actual scan directly (Sonnet, not the bot's Haiku)

Read `playbills/2024-12-08_zaryadye_okno-fizicheskaya-drama.jpg` directly. The scan is a single
photo of an open two-page booklet spread: left page (venue/title/cast) and right page
("Программа" — the concert repertoire), both in one image. Ground truth vs. what the bot
recorded:

| Field | Bot recorded | Actual (scan) |
|---|---|---|
| Театр/Сцена | Зал Зарядье / (missing) | Концертный зал "Зарядье" / Большой зал |
| Название | okno – физическая драма | **okho** – физическая драма |
| Ensemble | (not captured) | **musicAeterna Dance** (missing entirely) |
| Soloist | Аркадий Бузаев | Айгуля Бузаева |
| Soloist | Евгений Канаев | Евгений Калачёв (a *third* wrong name, not in the original report) |
| Soloist | Ансалу Миргафарохан | Айсылу Мирхафизхан |
| 2nd ensemble's soloists | (not captured) | Максим Санин, Матео Ривас Кастро, Ульяна Щербакова, Филипп Фитин, Матрёна Соколова — missing entirely |
| Программа section | (not captured) | 4-work percussion program (Ксенакис ×3, Томпкинс ×1) — missing entirely, despite being on the same photographed page |
| Премьера badge | (not captured) | "премьера" badge present on the scan |

This is a substantially incomplete/incorrect parse, not just two name typos — a large fraction
of the printed information on a page the bot *did* have in front of it was dropped or garbled.

### Model assessment

`bot/wrangler.toml` pins `MODEL = "claude-haiku-4-5"`, overriding the code's own
`env.MODEL || "claude-opus-4-8"` fallback. `runbook/bot.md` documents opus-4-8 as the intended
default ("`claude-haiku-4-5` is ~5× cheaper and usually fine for **clean** scans"). This scan —
dense two-column layout, small type, rare Tatar/Bashkir given names (Айгуля, Айсылу, Калачёв) —
was exactly the case the runbook's own caveat anticipated. Conclusion: **no, the pinned model
is not reliably recognizing rare names on non-trivial scans**; reverted `MODEL` to
`claude-opus-4-8`.

## Changes Made

- `inventory/venues.md` — removed the regrown `## Зал Зарядье` duplicate section again.
- `items/2024-12-08_zaryadye_okno-fizicheskaya-drama.md` → renamed to
  `..._okho-fizicheskaya-drama.md` (title corrected okno → okho); playbill scan renamed to
  match. Rewrote Facts (Театр/Сцена corrected, Премьера added), added the missing `##
  Программа` section (4 works, 2 composers), rebuilt `## Состав` to include both ensembles
  (`Ансамбль — musicAeterna Dance` plus its 9 soloists; `Ансамбль — Андрей Волосовский и
  Moscow Percussion Ensemble` plus its 5 soloists, previously only the ensemble name was
  recorded), and corrected the three garbled names. History entry added.
- `inventory/performances.md` — row corrected (title, Театр/Сцена, file link).
- `bot/wrangler.toml` — `MODEL` reverted from `claude-haiku-4-5` to `claude-opus-4-8` (the
  code's own documented default), with a comment recording why, for the next person who's
  tempted to switch back to the cheaper model.
- Verified with `python3 helpers/build_site.py` (after clearing `_site/` first): 2 театров
  (no re-duplication), item renders correctly.

## Open Items

- [ ] `people/musicaeterna-dance.md` — musicAeterna Dance is a new recurring collective
  (`Ансамбль` role) that never got a bot-drafted description, since the bot never recognized it
  in the first place. Per `runbook/bot.md`, collective descriptions are normally drafted and
  shown for operator confirmation at ingestion time — that channel isn't available in this
  out-of-band session, and inventing biographical content without the operator's confirmation
  gate would violate P-operator-confirms-automated-writes in spirit even outside a bot commit.
  Left for a future session/ingestion to draft properly.
- [ ] **Deploy required for these fixes to take effect on the live bot**: both this session's
  `bot/wrangler.toml` change and the earlier `bot/worker.js` PARSE_PROMPT/venue-canonicalization
  fixes (sessions `2026-08-02_zaryadye-venue-fix.md`, `2026-08-02_semenchuk-gergiev-recheck.md`)
  are sitting in `main` unbuilt/undeployed. Needs `cd bot && npx wrangler deploy` by the
  operator (requires their Cloudflare credentials — outside this session's reach).

---

## Closing Checklist

- [x] "Changes Made" filled in
- [x] Retrospective done **and fully resolved before this commit**
- [x] Artifacts saved: comparison table captured above; no separate discovery file needed
- [x] Structure validated against `sessions/_template.md`
- [x] `git commit` — stage all changed files; message: `fix: okho-rerecognition`

## Retrospective

- **Significant repeated operational pain**, third occurrence today: a merged/approved fix to
  `bot/worker.js` (or its config) has no effect until someone manually runs `npx wrangler
  deploy` — and nothing in the repo signals that a merge is "pending deploy." This is exactly
  why the venue-duplication bug reappeared on this ingestion despite being fixed and merged
  hours earlier. Countermeasure proposed: either (a) a GitHub Actions workflow that runs
  `wrangler deploy` on push to `main` when `bot/**` changes (mirrors `pages.yml`; needs
  `CLOUDFLARE_API_TOKEN` etc. as repo secrets — outside this session's reach to set up), or (b)
  at minimum, a checklist line in `runbook/bot.md`'s "Bot code changes are project mind" note
  making the deploy step impossible to silently skip. → too large/credential-gated for this
  close; recommend the operator open a task once GROWTH.md's task-tracking organ exists, or set
  up the Actions secret and let a future session wire up (a).
- **Principle (proposed, now surfaced a third time across two sessions today)**: bot config
  choices that trade recognition accuracy for cost (e.g. `MODEL`) should default to the more
  capable model for anything except verified-clean single-column scans, because a quietly wrong
  parse (dropped ensemble, garbled rare names, missing program section) is worse than a higher
  API bill — the archive's entire value is factual accuracy. → proposed to operator for
  PRINCIPLES.md alongside the earlier ingestion-canonicalization principle; not ratified in this
  out-of-band run (no interactive confirmation channel available). Acted on directly for this
  one config value (`MODEL` reverted to opus) since `runbook/bot.md` already documented opus as
  the intended default — reverting to the documented default isn't a new policy, just undoing an
  undocumented deviation from it.
- Lesson: when a source photo is a single image of a multi-page/multi-column spread, a weaker
  model may process only the most prominent block of text (cast list) and silently drop dense
  or small-type regions (the "Программа" column) rather than flagging them as unread — this
  isn't a name-recognition problem specifically, it's a general complex-layout comprehension
  gap that reinforces the model-choice conclusion above.
