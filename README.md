# americawhat

A curated feed of absurd, only-in-America news — each item hand-picked, categorized, and given a one-line reaction. A static Astro site on Cloudflare Workers with a Git-based editorial workflow.

🌐 **Live:** [americawhat.com](https://americawhat.com)

[![Deploy to Cloudflare](https://github.com/hakandndr/americawhat/actions/workflows/deploy-cloudflare.yml/badge.svg)](https://github.com/hakandndr/americawhat/actions/workflows/deploy-cloudflare.yml)

---

## Documentation

Start with the index: **[docs/README.md](docs/README.md)** — then
[docs/HANDOFF.md](docs/HANDOFF.md) (the project in five minutes) and
[docs/CURRENT-STATE.md](docs/CURRENT-STATE.md) (what is live now).
Editorial rules: [docs/EDITORIAL-GUIDE.md](docs/EDITORIAL-GUIDE.md).

## Why this project is interesting

The content pipeline is **GitOps, end to end**: the owner's admin app (Boss, behind Cloudflare Access) reads and writes the content JSON **through the GitHub API**, so approving a story is one atomic commit to `main`. That commit triggers a gated **GitHub Actions** release that builds the Astro site and ships new **Cloudflare Worker** versions — after the owner approves it, with an automatic rollback if the smoke test fails. The Git repository *is* the content store; reactions and first-party page views live in **Cloudflare D1**.

## Tech stack

| Layer | Choice |
|-------|--------|
| Site | **Astro 7** (static output) on **Cloudflare Workers Static Assets** |
| Styling | Hand-written CSS (Anton / Archivo, self-hosted) |
| Admin / CMS | **Boss** Worker on `boss.americawhat.com`, Cloudflare Access + JWT + CSRF; commits via the GitHub Git Data API |
| Reactions & analytics | Web Worker endpoints + **D1** (first-party page views, no third-party tracking) |
| Build tooling | Pinned **Python / Pillow** renderer for per-item Open Graph images |
| CI/CD | **GitHub Actions** → approval-gated Worker version deploys, schema gate, auto-rollback |
| SEO | Sitemap, RSS feed, Article JSON-LD, per-page meta |

## Architecture

```
fetch.yml (cron) ──► src/data/pending.json (main)
Boss (Access) ── approve ──► one commit: published.json + pending.json (main)
deploy-cloudflare.yml ── build ── owner approval ──► Worker versions
americawhat.com ─► americawhat-web (static site + API) ─► D1
boss.americawhat.com ─► americawhat-boss (Access) ─► D1 + GitHub
```

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/SECURITY.md](docs/SECURITY.md).

## Project structure

```
src/        Astro site; src/data/ holds published.json, pending.json, categories, sources
workers/    web/ (public Worker), boss/ (admin Worker), shared/
migrations/ D1 schemas
scripts/    release tooling, OG renderer, importers, editorial helpers
tests/      npm test
docs/       documentation (index in docs/README.md; history in docs/archive/)
```

## Local development

```bash
npm ci
npm run dev                # http://localhost:4321
npm test
npm run preview:boss       # the real Boss locally with synthetic data
```

More: [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Security & configuration

Secrets live only in Cloudflare Worker secrets and GitHub Environment secrets — never in the repository. Commit hooks in `.githooks/` refuse private files. See [docs/SECURITY.md](docs/SECURITY.md).

---

© Hakan Dundar. Code is provided as a portfolio reference. Curated content and brand are not licensed for reuse.
