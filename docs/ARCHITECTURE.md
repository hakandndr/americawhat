# americawhat — Architecture

Production architecture (live since 2026-10-16): Cloudflare Workers Static
Assets with two AmericaWhat-owned Workers and two AmericaWhat-owned D1
databases. GitHub stays the publication source of truth. Versions and open
items: [CURRENT-STATE.md](CURRENT-STATE.md).

## 1. Components

| Component | Where | Purpose |
|---|---|---|
| Static site | Astro 7.3.8 (`src/`), built to `dist/` | Every public page, RSS, sitemap, OG images. No change to URLs, markup or SEO metadata. |
| `americawhat-web` Worker | `workers/web/` | Serves `dist/` as Static Assets and the public API. |
| `americawhat-boss` Worker | `workers/boss/` | The owner's administration app on `boss.americawhat.com`, behind Cloudflare Access. |
| `APP_DB` (D1) | `migrations/app/` | Reactions, reaction imports, abuse guards, editorial decisions, Boss audit. |
| `ANALYTICS_DB` (D1) | `migrations/analytics/` | Legacy and native page views, import ledger, retention aggregates, DNDR outbox, operator log. |
| Fetch workflow | `.github/workflows/fetch.yml`, `scripts/fetch-sources.mjs` | Unchanged role: RSS → `pending.json`, three times a day. |
| CI | `.github/workflows/ci.yml` | Tests, OG attestation, release build, static verification, Worker bundling (staging and production configs). No deploy, no secrets. |
| Deploy | `.github/workflows/deploy-cloudflare.yml`, `rollback-cloudflare.yml` | Gated version upload/deploy to Cloudflare with automatic rollback ([DEPLOYMENT.md](DEPLOYMENT.md)). |
| Retired deploy | `.github/workflows/deploy.yml` | Former FTP deploy to Hostinger; now manual-only and refuses to run. Hostinger rollback uses the `hostinger-final` tag. |

Resource names: `americawhat-web-{staging,production}`,
`americawhat-boss-{staging,production}`, `americawhat-app-{staging,production}`,
`americawhat-analytics-{staging,production}`. Nothing is shared with another
project; DNDR is reached only through an explicit, optional binding (§5).

## 2. Request routing

```
americawhat.com, www.americawhat.com  →  americawhat-web
   /api/health                         GET
   /api/reactions                      GET counts · POST {id, reaction}
   /api/pv                             POST {evt, path, referrer}
   /analytics/get_votes.php            GET   (compatibility: same as /api/reactions)
   /analytics/vote.php                 POST  (compatibility)
   /analytics/log_df.php               POST  (compatibility: page view) · GET → 204, stores nothing
   /analytics/* anything else          404 (no PHP, log or JSON can be served)
   everything else                     Static Assets (dist/ minus .assetsignore)

boss.americawhat.com                   →  Cloudflare Access (hakan@dndr.net only) → americawhat-boss
```

The pages keep calling the `/analytics/*.php` URLs, which exist on both hosts,
so one build works on Hostinger and on Cloudflare during the migration. The
page-view beacon is a POST (`src/scripts/tracking.js`); the PHP logger already
reads POST fields.

Outside production the collector stores a page view only when the request
carries the staging test key (`COLLECT_VISITS=test-only`, the default for every
non-production environment), so a public staging hostname never keeps real
visitor data.

The web Worker runs before assets (`run_worker_first: true`) so that the
platform's trailing-slash redirect is answered with 301, as Apache does today,
and so staging can add `X-Robots-Tag: noindex`.

## 3. Publishing (GitHub remains the source of truth)

```
fetch.yml ──► pending.json (main)
                 │
Boss weekly review: owner chooses approve / reject(reason) / skip per story
                 │
Git Data API: read main → compute published.json + pending.json → ONE commit → fast-forward ref
   (if main moved meanwhile, recompute on the new head; nothing partial is ever written)
                 │
deploy-cloudflare.yml (main only, owner approval, schema gate, auto-rollback)
```

Invariants enforced in `workers/boss/src/editorial.mjs` and tested:
- one approval batch is one commit (published and pending change together);
- a story is never published twice (`seen_id` and source URL checks);
- candidates added by a concurrent fetch are kept;
- existing article URLs never change (`assignSlugs` in `src/lib/slug.js`,
  shared by the site and Boss; pinned `slug` on retitle or deletion);
- the comment must be two sentences and the source an original article URL,
  unless the owner explicitly overrides per item.

The fetch workflow never rebases over a Boss commit: if `main` moved, it resets
to the new head and re-runs the fetch (up to three times).

## 4. Data ownership

| Data | Store | Owner of writes |
|---|---|---|
| Published stories, pending candidates, fetch status | Git (`src/data/*.json`) | fetch workflow, Boss commits |
| Reaction counts | `APP_DB.reaction_counts` | web Worker (increments), Boss (snapshot imports) |
| Editorial decisions, Boss audit | `APP_DB` | Boss |
| Page views (legacy + native) | `ANALYTICS_DB.visitor_events` | web Worker (native), Boss import (legacy) |
| Retention aggregates, operator log | `ANALYTICS_DB` | Boss Delete Before Date |

## 5. DNDR integration (optional, explicit)

`workers/web/src/dndr-forward.mjs` mirrors the existing DNDR producer contract
(`env.DNDR_COLLECTOR.recordPage(event)` over a Service Binding whose props carry
the producer id). It runs only after the source row is stored and only for a
newly stored native row; the event id is the row's `event_uid`, so retries are
idempotent on the DNDR side. A failure is recorded in `dndr_outbox` and never
affects the visitor or the source row.

The binding is **not configured** in any environment: enabling it requires a
new DNDR producer registration, which is a change to the DNDR platform and needs
separate approval. Legacy (imported) rows are never forwarded; DNDR already holds
that history (see `ANALYTICS.md` §6).

## 6. Security boundaries

See `SECURITY.md`. In short: Access at the edge plus independent RS256 JWT
verification in the Boss Worker (fail closed); CSRF token and Origin check on
every Boss POST; the GitHub token exists only as a Boss Worker secret; the public
Worker has no privileged endpoint; no GET changes state.

## 7. Compared with the owner's other projects

- **OC-CA:** same shape (static Worker + separate Boss Worker on its own
  hostname, Access team `dndrnet.cloudflareaccess.com`, APP_DB/ANALYTICS_DB
  split, Git as editorial authority). AmericaWhat's Boss auth is a port of the
  same fail-closed pattern, written for this repository.
- **TürkiyeCennet:** the analytics model (one table for legacy and native rows,
  durable ALL #, TODAY #, IP VISITS, manual Delete Before Date with preview,
  typed confirmation and audit). AmericaWhat differs in that legacy history is
  imported from a file with the DNDR line identity, and that deleted raw rows
  leave non-identifying aggregates behind.
- **DNDR:** the line identity `panel_log:<sha>.<n>`, the import ledger idea and
  the producer binding contract are reused; nothing in DNDR is changed.
