# americawhat — Handoff

Master onboarding document. If you are an AI or developer picking this project up
cold, read this file first, then `EDITORIAL-GUIDE.md` (the part that actually
matters), then `OPERATIONS.md`.

**Live site:** https://americawhat.com
**Repo:** https://github.com/hakandndr/americawhat
**Admin panel:** https://americawhat.com/boss/ (password-protected)
**Owner:** Hakan Dundar
**Last updated:** 2026-09-30

---

## What this project is

A curated feed of absurd, only-in-America news. Each item is a real news story,
hand-picked, assigned a category, and given a short dry editorial comment in the
site's own voice. It is a comedy/curation product, not a news aggregator — the
value is in what gets rejected and in the two-sentence comment.

## Architecture in one paragraph

Static Astro 4 site. **There is no database.** Content lives as JSON in the git
repo (`src/data/`). A GitHub Action fetches RSS candidates into `pending.json`
three times a day. A lightweight PHP admin panel reads and writes those JSON
files **through the GitHub Contents API**, so approving an item is literally a
git commit. That commit triggers a second Action that builds the Astro site,
generates per-item Open Graph images with Python/Pillow, and deploys `dist/` over
FTP to Hostinger. The git repository *is* the CMS.

```
fetch.yml (cron 02:00/14:00/20:00 UTC)
   └─ scripts/fetch-sources.mjs → src/data/pending.json  (+ seen_ids, fetch-status)
         └─ admin panel /boss/ → approve → published.json  (GitHub API commit)
               └─ deploy.yml → npm ci → gen-og.py → astro build → FTP → live
```

## Repo map

| Path | Purpose |
|---|---|
| `src/data/published.json` | Live content. `{ "items": [...] }` |
| `src/data/pending.json` | Fetched candidates awaiting curation. Flat array |
| `src/data/categories.js` | The 7 categories + the 4 reactions |
| `src/data/sources.json` | RSS source list (Google News queries) |
| `src/data/filters.json` | Scoring keywords, `minScore`, `recencyDays`, `maxPerSource` |
| `src/data/seen_ids.json` | Dedup ledger so the fetcher doesn't re-add items |
| `src/data/fetch-status.json` | Last-run telemetry for the fetcher |
| `src/components/Card.astro` | Feed card; derives status badge + source line |
| `src/lib/items.js` | Slug generation + status derivation. Read this before touching schema |
| `src/pages/item/[slug].astro` | Item detail page; renders `city, state` as a place line |
| `public/studio/index.php` | The admin panel (served at `/boss/`) |
| `public/analytics/` | `vote.php`, `get_votes.php` — reaction + view endpoints |
| `scripts/fetch-sources.mjs` | The RSS fetcher/scorer |
| `scripts/gen-og.py` | Per-item OG image generator (Pillow), runs at build |
| `.github/workflows/fetch.yml` | Candidate fetch cron |
| `.github/workflows/deploy.yml` | Build + FTP deploy on push to `main` |
| `docs/` | This documentation set |

`public/studio/config.php` holds the GitHub token and panel password. It is
**git-ignored** and exists only on the server. `config.sample.php` is the template.

## Item schema

```json
{
  "id": "aw-0125",
  "title": "Headline as published by the source",
  "comment": "Our two-sentence editorial voice. This is the product.",
  "category": "florida-man",
  "source_url": "https://news.google.com/rss/articles/...",
  "source_name": "FOX 13 Tampa Bay",
  "source_domain": "fox13news.com",
  "date": "2026-09-14",
  "status": "REAL",
  "city": "Lakeland",
  "state": "Florida",
  "seen_id": "src-xxxxxxxxxxxx"
}
```

Optional: `body`, `whyAmericaWhat`. Both are normally left empty — the comment
carries the whole piece. Pending items additionally carry `excerpt`,
`external_url`, `score`, `fetched_at`; these are working fields, not published.

### status
Three values, defined in `src/lib/items.js` and rendered in `Card.astro`:

- **REAL** — real story with a working source link. No badge, normal appearance. *This is what we use.*
- **SUBMITTED** — reader submission. Renders a SUBMITTED badge.
- **UNVERIFIED** — no usable source link. Renders an UNVERIFIED warning badge.

If `status` is omitted the site derives it: source link present ⇒ REAL, absent ⇒
UNVERIFIED. Set it explicitly to REAL anyway.

## Where to go next

- **`EDITORIAL-GUIDE.md`** — the concept, the 7 categories, the voice, and the
  rejection rules. This is the irreplaceable part; the code can be rebuilt, the
  editorial judgment cannot.
- **`CURRENT-STATE.md`** — what is live right now, counts, known gaps, backlog.
- **`OPERATIONS.md`** — the curate → push → approve → deploy loop and every
  gotcha that has actually bitten us.
- **`../integrations/dndr/README.md`** — the DNDR Analytics signed relay for the
  server-side logger (staging-rehearsed, not deployed; Studio stays the
  analytics view).
