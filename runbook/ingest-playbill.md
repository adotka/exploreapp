# Ingest a Playbill

The recurring procedure for feeding a theatrical experience (a link or a scanned playbill)
into the archive. Runs inside a normal session (runbook/session.md).

1. **Evidence first.** If it is a scan, save it as
   `playbills/YYYY-MM-DD_<theatre>_<title>.pdf` (or `.jpg`) — Latin-transliterated slug,
   date = performance date. Scans are never edited. If it is a link, it goes straight into
   the item's `Источник`/`Программка` field.
2. **Create the item** by **copying** `items/_template_performance.md` to
   `items/YYYY-MM-DD_<theatre>_<title>.md`. Fill from the playbill:
   - Names and titles exactly **as printed**, one consistent full form per person across the
     whole archive (exact string match is what interlinks the site).
   - `Театр`/`Сцена` must match `inventory/venues.md` verbatim; add a new theatre/scene to
     that registry first if missing.
   - Remove unused placeholder lines; the generator ignores anything still wrapped in `<>`.
3. **Update registries:** add a row to `inventory/performances.md`; update
   `inventory/venues.md` only for a new theatre or scene.
4. **Verify locally:** `python3 helpers/build_site.py`, then `python3 helpers/check_links.py`
   (fails on any broken internal link); spot-check the new pages in `_site/`.
5. **Close the session normally** — commit message `<theatre-or-subject>: <topic>`. The push
   to `main` rebuilds and redeploys the site automatically (see runbook/site.md).
