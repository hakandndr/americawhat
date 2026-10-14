# americawhat — Current State

Snapshot. Update whenever something structural changes. Earlier snapshots are
in Git history; dated statements are historical once superseded.

**As of:** 2026-10-14

Status words: **Implemented** (code exists) · **Tested locally** (automated
tests and/or local workerd) · **Staging verified** (checked on the deployed
AmericaWhat staging resources) · **Production verified** · **Blocked** ·
**Awaiting owner approval**.

---

## Production (unchanged by the migration work)

- Hostinger web hosting; FTP deploy from `main`; PHP endpoints
  `/analytics/vote.php`, `get_votes.php`, server-only `log_df.php`; PHP Studio
  panel at `/boss/` (GitHub Contents API, password login).
- DNS at Hostinger (`dns-parking.com`); email on Hostinger (MX/SPF/DKIM/DMARC) —
  email stays there by owner decision.
- `origin/main` at `302549b` (fetch commit). **Content (verified on `main`,
  2026-10-14):** 124 published (highest id `aw-0135`), 130 pending (none
  drafted), 14 RSS sources, fetch three times a day, recent fetch runs green.
  Last panel approval and deploy: 2026-10-01.
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

Deployed source revision: **`636936f`** (later commits on the branch change
documentation only). `/api/health` on staging reports `"release":"636936f"`.

| Part | Status | Evidence |
|---|---|---|
| Static site on Workers Static Assets | **Staging verified** | `americawhat-web-staging` version `02c0da48-f3a2-47ad-99e0-8358b9244ac7`; smoke 23/23 |
| URL/SEO parity with production | **Staging verified** (build vs live) | `npm run parity:live`: 131/131 sitemap URLs, 40 sampled pages identical, `/about` → 301 |
| Static upload excludes PHP/config/logs/secrets | **Staging verified** | `verify:static` 0 failures; 9 forbidden paths answer 404 |
| Reactions API (atomic, guarded, POST-only, chunked reads) | **Staging verified** | 124-id read 200 (was 500 before the fix); repeat vote counted once; 40 parallel votes = 40 (local workerd) |
| Page-view collector, staging gate | **Staging verified** | anonymous beacon → 202, nothing stored; keyed smoke beacon stored once; no new real rows after the gate |
| DNDR forwarding | **Implemented, tested locally**; **Blocked** (needs a DNDR producer, DNDR-side approval) | mock binding tests |
| Legacy log importer (SQL statements, Boss and offline .sql) | **Tested locally**; offline path **staging verified** with a synthetic file (applied twice, second run added nothing) | no real log imported |
| Reaction snapshot importer | **Tested locally** (unit + workerd preview) | no real votes imported |
| Boss Worker | **Tested locally** (`npm run test:boss-preview` 18/18 in workerd); uploaded to staging as version `85119d25-bc70-4871-a5f2-f9dcb3dbf896` with **no route** (unreachable); Access-protected staging **Awaiting owner approval** (CLOUDFLARE-MIGRATION.md §3a) | |
| Boss auth, CSRF, atomic publishing, URL protection, analytics, retention, audit | **Tested locally** | `npm test` 100/100 |
| Production Workers, D1, Access, custom domains | **Awaiting owner approval** — none created | |
| CI (`ci.yml`, no deploy, no secrets) | green on `025e01c`; latest run: see the final report | |

### Staging data (verified 2026-10-14)

`americawhat-analytics-staging` holds 3 page views from **real** browser visits
(real IPs and user agents, before the gate), 4 smoke rows and 5 synthetic
legacy rows; `americawhat-app-staging` holds 3 votes (2 not from tests).
Nothing was deleted — **Awaiting owner approval** to delete or keep.

## Known gaps / backlog

1. **Production migration approvals** — the ordered list is in
   `CLOUDFLARE-MIGRATION.md` §7. Nothing beyond staging has been done.
1a. **Workers plan unknown** — on the Free plan (10 ms CPU) the Weekly review
   page may hit the CPU limit (measured ~11 ms warm, ~31 ms cold in Node).
2. **Hostinger inventory and backup** — not done yet (owner action,
   `CLOUDFLARE-MIGRATION.md` §1), including the pre-merge checks (server
   `log_df.php` reads POST; `ftp-diff` shows no PHP/`.htaccess` change).
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

- Local `main` points at `origin/main` (`302549b`); `origin/main` is merged into
  `dev/cloudflare-native` (merge `e36b707`), never the reverse. Recovery bundle
  and backup refs in `.git/aw-backups/20261014-sprint/`,
  `refs/aw-backup/pre-sprint/*` and `refs/aw-backup/pre-verify/dev` (`025e01c`).
- Local branch `docs/neutral-tooling-note` (2 commits, owner-authored) is merged
  into `dev/cloudflare-native`; the branch itself is kept.
- Remote branch `staging/dndr-analytics` untouched.
- Untracked `digest-2026-08-14.md` and `digest-2026-09-18.md` at the root are
  left as they were (owner's notes; copies in the recovery folder).
- Local git identity: `Hakan Dundar <hakan@dndr.net>`; hooks enabled with
  `core.hooksPath=.githooks`.
