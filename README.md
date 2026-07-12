# americawhat

A curated feed of absurd, only-in-America news — each item hand-picked, categorized, and given a one-line reaction. Built as a fast, static Jamstack site with a lightweight Git-based content workflow.

🌐 **Live:** [americawhat.com](https://americawhat.com)

[![Deploy to Hostinger](https://github.com/hakandndr/americawhat/actions/workflows/deploy.yml/badge.svg)](https://github.com/hakandndr/americawhat/actions/workflows/deploy.yml)

---

## Why this project is interesting

The content pipeline is **GitOps, end to end**: a small PHP admin panel reads and writes the content JSON **through the GitHub API**. When an item is approved, the panel commits it to `published.json` on the `main` branch — which triggers a **GitHub Actions** workflow that builds the Astro site and deploys it over FTP. No database, no server-side rendering, no CMS service: the Git repository *is* the content store, and every content change is a versioned commit with an automatic deploy.

## Tech stack

| Layer | Choice |
|-------|--------|
| Site | **Astro 4** (static output), Jamstack |
| Styling | Hand-written CSS (Anton / Archivo type system) |
| Admin / CMS | Lightweight **PHP** panel that commits content via the GitHub Contents API |
| Reactions & analytics | PHP endpoints (`vote.php`, `get_votes.php`) + JSON storage |
| Build tooling | **Python** (Pillow) generates per-item Open Graph images at build time |
| CI/CD | **GitHub Actions** → build → FTP deploy (Hostinger) |
| SEO | Sitemap, RSS feed, Article JSON-LD, per-page meta |

## Architecture

```
                 approve item
  Admin panel  ──────────────►  GitHub API commit to published.json
  (PHP, /studio)                        │
                                        ▼
                              GitHub Actions (deploy.yml)
                                 │  npm ci
                                 │  python scripts/gen-og.py   (OG images)
                                 │  astro build  → dist/
                                 ▼
                            FTP deploy → americawhat.com
```

Content lives in `src/data/` as JSON (`published.json`, `pending.json`, `categories.js`). The reaction system (WAT / LOL / SAME / DEAD) and page-view beacon post to the PHP endpoints under `/analytics/`.

## Features

- ⚡ Static, CDN-friendly site — no runtime backend for the public pages
- 🗂️ Client-side category filtering (Florida Man, Bureaucracy, HOA & Housing, …)
- 🖼️ Auto-generated Open Graph image per item (Python/Pillow at build)
- 📰 RSS feed + XML sitemap + JSON-LD for SEO
- 🔁 Reaction system with lightweight PHP + JSON storage
- 🔒 Admin panel behind a server-side password (constant-time check); secrets never touch the repo

## Project structure

```
src/
  components/   Astro components (Card, Subscribe)
  data/         Content + config (published.json, categories.js, sources.json)
  layouts/      Base layout
  pages/        Home, item/[slug], about, contact, legal pages, rss.xml
  lib/          Helpers (items, slug)
public/
  studio/       PHP admin panel (config.php is server-only, git-ignored)
  analytics/    PHP reaction + view endpoints
scripts/        Python OG-image generator
.github/        GitHub Actions deploy workflow
```

## Local development

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # generates dist/
```

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the site and deploys `dist/` over FTP. FTP credentials are stored as **GitHub Secrets** — never in the repo.

## Security & configuration

The admin panel and analytics endpoints read secrets (GitHub token, panel credentials) from a `config.php` that is **git-ignored** and uploaded only to the server. Copy `public/studio/config.sample.php` to `config.php`, fill in the values, and keep it off the repo. If you reuse this project, rename the `public/studio/` folder to a path of your own.

---

© Hakan Dundar. Code is provided as a portfolio reference. Curated content and brand are not licensed for reuse.
