# Site — Build, Preview, Deploy

The site is a **generated view** of `items/` (per the single-source-of-truth convention:
never edit `_site/` or deployed pages — edit items and regenerate). Entirely in Russian,
including navigation. Generator: `helpers/build_site.py` (Python 3 stdlib, no dependencies).

## Local preview

```
python3 helpers/build_site.py        # items/ → _site/  (gitignored)
```

Open `_site/index.html` in a browser. Optional live server: `python3 -m http.server -d _site`.

## Automatic deploy

`.github/workflows/pages.yml` builds and deploys to GitHub Pages on every push to `main`
(and on manual dispatch). No generated HTML is committed.

## One-time setup (operator, once)

1. Create a GitHub repository and push this repo to it
   (`git remote add origin <url> && git push -u origin main`).
2. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push (or re-run the workflow); the site appears at
   `https://<user>.github.io/<repo>/`.

Note: on a free GitHub plan, Pages requires the repository to be **public** — everything
committed here (items, impressions, playbill scans) becomes world-readable. Keep the repo
private with paid Pages, or keep the site local-only, if that matters.
