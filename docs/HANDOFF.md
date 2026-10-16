# americawhat — handoff

## The project

A curated feed of absurd, only-in-America news: real stories, hand-picked,
categorised and given a short dry editorial comment. The value is in what gets
rejected and in the comment ([EDITORIAL-GUIDE.md](EDITORIAL-GUIDE.md) is the
irreplaceable part).

## How it runs (since 2026-10-16)

```
fetch.yml (02:00/14:00/20:00 UTC) → src/data/pending.json on main
Boss (boss.americawhat.com, Cloudflare Access, owner only)
   → approve/reject/edit → ONE commit of published.json + pending.json to main
deploy-cloudflare.yml → eligibility → tests/build (Astro, pinned OG renderer)
   → verified Boss content: automatic Web-only version (after one-time setup)
   → other changes: owner approves production → Web + Boss versions
Web Worker: static site + reactions + first-party page views → D1
```

GitHub `hakandndr/americawhat` (`main`) is the content source of truth.
Cloudflare Workers + two D1 databases serve and store everything else.
Hostinger now only hosts **e-mail** (and the dormant old website, kept for
rollback until 2026-11-15). Current versions, data and open items:
[CURRENT-STATE.md](CURRENT-STATE.md).

## Repository map

| Path | Purpose |
|---|---|
| `src/` | Astro 7 site; `src/data/published.json` (live content), `pending.json`, `seen_ids.json`, `categories.js`, `sources.json`, `filters.json` |
| `workers/web/` | Public Worker: static assets, `/api/*`, legacy-compatible `/analytics/*.php` endpoints, health with D1 schema digests |
| `workers/boss/` | Boss Worker: weekly review, published editing, analytics, reactions, audit; Access JWT + CSRF + owner check |
| `workers/shared/` | Time (Pacific), classification, importers, schema digests |
| `migrations/` | D1 schemas (`app`, `analytics`) |
| `scripts/release/` | Release build, deploy gates (`cf-release.mjs`), reconciliation, DNS tools, packaging, secrets helper |
| `scripts/gen-og.py`, `public/og/` | Pinned OG renderer and the frozen approved images |
| `scripts/analytics/legacy-import.mjs` | Offline legacy log import |
| `.github/workflows/` | `ci`, `deploy-cloudflare`, `rollback-cloudflare`, `fetch`, retired `deploy` |
| `tests/` | `npm test` (≈205 tests incl. workflows, gates, Boss end-to-end) |
| `docs/` | This documentation ([index](README.md)); history in `docs/archive/` |

Item schema and status rules: `src/lib/items.js`, `src/lib/slug.js` (Boss pins
`slug` when a retitle would move a URL; never edit it by hand).

## Working rules

- Reports to the owner in Turkish; code and docs in English.
- Commits as `Hakan Dundar <hakan@dndr.net>`; no tool or assistant attribution
  (hooks in `.githooks/` enforce it).
- Never push code to `main` directly: branch → PR → CI → merge. Application
  production deploys wait for the owner's `production` Environment approval.
  The separate content path accepts only signed Boss transactions over the
  live reviewed code baseline; see [DEPLOYMENT.md](DEPLOYMENT.md) for setup.
- Never change DNS, Hostinger, D1 data or other projects without explicit
  approval. E-mail DNS records must stay as they are.
- Wrangler with the owner's OAuth (`CLOUDFLARE_API_TOKEN` unset). The CLI
  login cannot edit DNS records, zones or Access apps — those are dashboard
  steps for the owner.
- Test what browsers really send: two production bugs (Origin `null` from
  `no-referrer`, frozen Analytics URL) passed tests that set headers by hand.

## Where to start next session

1. `git fetch origin` and start a topic branch from `origin/main`
   (worktree `D:\IT\AmericaWhat\americawhat\tmp\security-boss` works; its
   branch `codex/staging-rc` is historical — do not reuse it for new work).
2. Read [CURRENT-STATE.md](CURRENT-STATE.md) → "Open items".
3. The redesigned Boss is live (8a9cf35). Automatic content deployment needs
   the one-time `production-content`/proof-key setup in DEPLOYMENT; until then
   news follows the existing reviewed deployment path.
4. The owner decides the weekly review in Boss (drafts are
   already in `pending.json`, see CURRENT-STATE → Open items). S2 is waived; staging sync
   is deferred; DNDR forwarding is live (2ef6a57); its cutover gap needs an
   owner-approved DNDR history import.
5. Editorial drafting: `scripts/editorial/apply-curation.mjs` — `keep` fills
   fields, `propose_reject` records `draft_reason`/`draft_note` that Boss
   preselects as Reject. Never remove candidates outside Boss.
