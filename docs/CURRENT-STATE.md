# americawhat — Current State

Snapshot. Update whenever something structural changes. Earlier snapshots are
in Git history; dated statements are historical once superseded.

**As of:** 2026-10-14

Status words: **production** (serving americawhat.com), **staging** (deployed to
an isolated AmericaWhat staging resource), **tested locally** (automated tests
and/or local workerd), **implemented** (code exists), **planned**.

---

## Production (unchanged by the migration work)

- Hostinger web hosting; FTP deploy from `main`; PHP endpoints
  `/analytics/vote.php`, `get_votes.php`, server-only `log_df.php`; PHP Studio
  panel at `/boss/` (GitHub Contents API, password login).
- DNS at Hostinger (`dns-parking.com`); email on Hostinger (MX/SPF/DKIM/DMARC) —
  email stays there by owner decision.
- `main` head at the start of this work: `276b94d` (fetch commit, 2026-10-14).
- **Content (verified on `main`, 2026-10-14):** 124 published (highest id
  `aw-0135`), 125 pending (none drafted), 14 RSS sources, fetch three times a
  day, all recent fetch runs green. Last panel approval and deploy: 2026-10-01.
- **Reactions (verified via the live read endpoint):** 13 votes on 9 items.
- **Visitor history:** Hostinger log since 2026-07-07; DNDR holds 1,031
  imported + 29 relayed rows for `site_americawhat` (read-only aggregate query);
  see `ANALYTICS.md` §1.

### Category distribution (published, 124)

| category | items |
|---|---|
| florida-man | 42 |
| hoa-housing | 26 |
| crime-weird | 25 |
| bureaucracy | 11 |
| only-in-america | 10 |
| fine-print | 5 |
| food-crime | 5 |

`city` present on 62 of 124, `state` on 73.

## Cloudflare-native replacement — branch `dev/cloudflare-native`

| Part | Status | Evidence |
|---|---|---|
| Static site on Workers Static Assets (`americawhat-web`) | **staging** | `https://americawhat-web-staging.hakan-c89.workers.dev`, version `3bdcc891-c07a-4163-9ac8-823d13a40ace`; smoke 23/23 |
| URL/SEO parity with production | **tested locally** | `npm run parity:live`: 131/131 sitemap URLs, 40 sampled pages identical in canonical, title, og:image, JSON-LD; `/about` → 301 |
| Static upload excludes PHP/config/logs/secrets | **staging** | `verify:static` 0 failures; smoke: 9 forbidden paths answer 404 |
| Reactions API (atomic, guarded, POST-only) | **staging** | real D1: repeat vote counted once; local workerd: 40 parallel votes = 40 |
| First-party page-view collector | **staging** | real D1: retried beacon stored once; GET stores nothing |
| DNDR forwarding (source-first, outbox) | **implemented, tested locally** with a mock binding; **not configured** (needs a DNDR producer — blocked, separate approval) |
| Legacy log importer (DNDR identity, DST, ledger, idempotent) | **tested locally** (unit + workerd); no real log imported anywhere |
| Reaction snapshot importer (baseline/delta, refuses decreases) | **tested locally**; no real votes imported |
| Boss Worker (`americawhat-boss`) | **tested locally** in workerd (`npm run test:boss-preview` 11/11); uploaded to staging as version `9a8d649d-1ed2-4b17-b17d-7f2bafc47fa1` with **no route** (Cloudflare answers 1042) |
| Boss: Access JWT verification, CSRF/Origin | **tested locally** (forged, expired, wrong audience/issuer/email, missing config) |
| Boss: weekly review, one-commit approvals, URL protection | **tested locally** against an in-memory GitHub, including a concurrent fetch commit |
| Boss Analytics, exports, manual Delete Before Date, audit | **tested locally** |
| D1 `americawhat-app-staging` / `americawhat-analytics-staging` | **staging** (`a3c9ff1f-…`, `306b9ee6-…`), migrations 0001 applied, synthetic rows only |
| Production Workers, D1, Access application, custom domains | **planned** — not created |
| CI (`ci.yml`, no deploy, no secrets) | GitHub run on `dev/cloudflare-native`: success |

Test suite: `npm test` — 92 tests, all passing (2026-10-14).

## Known gaps / backlog

1. **Production migration approvals** — the ordered list is in
   `CLOUDFLARE-MIGRATION.md` §7. Nothing beyond staging has been done.
2. **Hostinger inventory and backup** — not done yet (owner action,
   `CLOUDFLARE-MIGRATION.md` §1). The server's current `log_df.php` must be
   confirmed to read POST before `dev/cloudflare-native` is merged.
3. **Privacy promise already exceeded** — the page says ~90 days; the log is
   older and nothing deletes it (`ANALYTICS.md` §6). Owner decision needed.
4. **Original source URLs** — 108 of 124 published items and almost all pending
   candidates carry Google News links instead of the outlet's article URL.
   Boss now requires an original URL for new `REAL` stories; backfilling the
   published ones is a separate editorial task.
5. **DNDR side** — the 13 h 30 min coverage gap of 2026-10-03 and a native
   producer for AmericaWhat need DNDR-side approval.
6. **Fetch cadence** — recommendation (daily) in `EDITORIAL-GUIDE.md` §10; not changed.
7. **Foreign noise** — geography flags now mark it in review; a domain
   blocklist in `filters.json` would cut it at fetch time.
8. **Category imbalance** — `fine-print` and `food-crime` need dedicated sources.
9. **Published items missing `city` (62 of 124 lack it) or `state` (51 lack it)** — cosmetic, unchanged.
10. **Contact form** — posts to Formspree; delivery not re-verified.

## Repository

- Local workspace `D:\IT\AmericaWhat\americawhat` fast-forwarded to `276b94d`
  (it was 57 commits behind; no local work lost). Recovery bundle and backup refs
  in `.git/aw-backups/20261014-sprint/` and `refs/aw-backup/pre-sprint/*`.
- Local branch `docs/neutral-tooling-note` (2 commits, owner-authored) is merged
  into `dev/cloudflare-native`; the branch itself is kept.
- Remote branch `staging/dndr-analytics` untouched.
- Untracked `digest-2026-08-14.md` and `digest-2026-09-18.md` at the root are
  left as they were (owner's notes; copies in the recovery folder).
- Local git identity: `Hakan Dundar <hakan@dndr.net>`; hooks enabled with
  `core.hooksPath=.githooks`.
