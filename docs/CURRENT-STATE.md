# americawhat — current state

Single source of truth for what is live. Verified 2026-10-16 20:55 UTC
(release 2ef6a57). Update the tables in place when something changes.

## Production (Cloudflare Workers, live since 2026-10-16 04:02 UTC)

| Item | Value |
|---|---|
| Source | `main` @ **2ef6a57** (GitHub `hakandndr/americawhat`, merge of PR #13 over PR #12's 8a9cf35; deploy run 38965061169, owner-approved) |
| Site | https://americawhat.com and https://www.americawhat.com → Worker `americawhat-web-production`, version `2c785866-179f-4871-975b-18ce3cc1f8ae`; binding `DNDR_COLLECTOR` → `dndr-collector#ProducerApi` (`prd_americawhat_native`), cron `*/15 * * * *` (DNDR outbox recovery) |
| Boss | https://boss.americawhat.com → Worker `americawhat-boss-production`, version `ca9420f0-1896-4399-85b9-1de6a4b8be0a`, behind Cloudflare Access (team `dndrnet`, `hakan@dndr.net` only; AUD `6b54c079…a224fe`) |
| Previous versions (rollback) | Web `a1190c3c-bf76-45c4-ade3-ee67b9244158`, Boss `92a81be7-9187-4dcc-9844-53c9b09205e0` (release 8a9cf35); before that Web `55912dc3…`, Boss `187c1ab2…` (09c90da) |
| Health | `/api/health`: status ok, environment production, release 2ef6a57, `app_db`, `analytics_db`, `reaction_secret`, `schema_app`, `schema_analytics` all ok |
| D1 | `americawhat-app-production` `3097933b-4feb-4e50-bb59-760fd06a640e`, `americawhat-analytics-production` `1012183d-96cd-4d7f-8e93-ca247ca43589` (WNAM, migration 0001 each) |
| Analytics | 1,083 legacy events (Hostinger log S1, imported idempotently; ledger 1,084 incl. 1 line without a page) + native page views since cutover (30 at 20:50 UTC; collection re-verified after the release) |
| Reactions | S1 baseline **applied** through Boss: 1 import (`baseline`, 14 items, +19 votes); live votes are added on top (21 in total at the time of writing) |
| Content | 129 published stories (all 129 item pages and 156 sitemap URLs answer 200 after the release), 30 pending candidates (Boss shows the live count beside Published); 125 approved OG images (frozen archive, 124 stories + default); stories approved later (aw-0136 onward) get their image from the pinned renderer at release (`gen-og.py --missing`); the RSS fetch keeps adding candidates three times a day |
| HTTPS | Cloudflare certificates on all three hostnames; `http://` → 301 `https://` |

Fixed after cutover (both live): Boss form POSTs were refused as
cross-origin because Boss sent `Referrer-Policy: no-referrer` (now
`same-origin`, PR #2); Boss Analytics froze at `/analytics?snapshot=N&p=1`
(now a live `/analytics` with Refresh; only paging pins a snapshot; IP VISITS
counts up to the shown ALL #; PR #3).

## DNS and e-mail

Zone `americawhat.com` on Cloudflare (nameservers `courtney` / `porter`
`.ns.cloudflare.com`). Apex, `www` and `boss` are Worker custom domains.
E-mail stays on **Hostinger**: MX `mx1/mx2.hostinger.com`, SPF, DMARC, three
`hostingermail-*._domainkey` CNAMEs, `autoconfig`/`autodiscover`, plus the Google
verification CNAME and `ftp` — all DNS-only and unchanged (checked with
`scripts/release/dns-compare.mjs`). Details: [DNS-READINESS.md](DNS-READINESS.md).

## CI/CD

Live since release 8a9cf35 (PR #12): the compact Boss workspace (grouped
fixed sidebar with counts and quick links; viewport-fitted Weekly review with a
batch bar, dense queue and one-screen editor, keys A/R/S and J/K; Published
story column with live URLs; Reactions search/sort; full Analytics).

| Feature | State |
|---|---|
| Boss redesign (PR #12) | **Live** — 8a9cf35 |
| Automatic Web-only deploy of signed Boss content (`production-content`) | **Deployed, not enabled** — awaiting owner setup: Environment, Web-only token, Ed25519 key, `CF_CONTENT_DEPLOY_ENABLED` ([DEPLOYMENT.md](DEPLOYMENT.md#automatic-boss-content-eligibility-and-one-time-setup)). Until then every release, news included, waits for `production` approval |
| DNDR forwarding (`prd_americawhat_native`) | **Live** since 2ef6a57 (2026-10-16 20:52 UTC). DNDR registry rows applied and read back (owner-approved); two-sided check: one visit, same `event_uid` and path in both systems, counted once, no other site changed. Outbox recovery cron `*/15`. Cutover gap: Open items 4 |

- `ci.yml`: tests and builds every push except `main` and every PR; no secrets.
- `deploy-cloudflare.yml`: on push to `main` (site/Worker paths) or manual;
  `CF_PRODUCTION_DEPLOY_ENABLED=true`; deploy job runs in the `production`
  Environment (required reviewer `hakandndr`, branch `main`, admin bypass off)
  with a per-Worker Editor token; schema gate before upload; smoke test and
  automatic rollback after activation. Proven by three owner-approved runs.
- `rollback-cloudflare.yml`: manual, one Worker back to a version UUID.
- `fetch.yml`: RSS candidates at 02:00, 14:00, 20:00 UTC.
- `deploy.yml`: the retired Hostinger FTP deploy (refuses to run).
Details: [DEPLOYMENT.md](DEPLOYMENT.md).

## Staging

`americawhat-web-staging` (`754be640…`) and `americawhat-boss-staging`
(`17aa89e2…`) run release **ae09988** — older than production: they lack the
Boss POST and Analytics fixes. Staging D1 `a3c9ff1f…` / `306b9ee6…`, staging
Access app, staging content repository `hakandndr/americawhat-staging-content`.

## Open items (owner unless noted)

| Priority | Item | When |
|---|---|---|
| 1 | Weekly review in Boss (live since 09c90da: red pending count and neutral published count in the navigation, records vs story cards, Expand/Collapse all, "Select prepared drafts" with a visible "N drafts selected ✓", live Approve/Reject/Skip counts, confirmation preview before the one-commit apply). 4 prepared drafts were published (aw-0136…aw-0139); 26 candidates remain, 1 with a drafted comment (Washington HOA fences — needs "allow aggregator link") | owner |
| — | S2 reconciliation: **waived** by the owner 2026-10-15; reminder task disabled; S1 stays the last legacy import | closed |
| — | Staging sync to the production code: deferred to a separate session (approval needed) | deferred |
| 2 | 30-day observation; then retire Hostinger web files, delete the FTP secrets, revoke the old Hostinger Boss credential (e-mail stays) | until 2026-11-15, then separate approval |
| 3 | Credential expiry: note and rotate the Boss GitHub PAT (≤90 days) and both Cloudflare CI tokens | track dates in the owner's vault |
| 4 | DNDR cutover gap: native rows stored 2026-10-16 04:03–20:46 UTC (30; forwarding live since 20:52) are not in DNDR. Fill only through an owner-approved DNDR history import keyed on `event_uid` (DNDR dates `recordPage` events on receipt, so no replay) | owner decision |
| 5 | Privacy page "~90 days" wording vs. manual-only retention; 3 real visitor rows / 2 votes in staging (delete or keep) | owner decision |

## Backups and rollback anchors

- Hostinger baseline backup: `D:\PrivateBackups\AmericaWhat\2026-10-15-baseline\` (hash manifest inside).
- Final pre-cutover snapshots S1: `D:\PrivateBackups\AmericaWhat\2026-10-16-S1\`
  (`aw_panel_log.txt` SHA-256 `EA4894DB…F6084C`, `aw_votes.json` `55F0C0E0…0955AE`).
- Git tag `hostinger-final` → `36e1c9b` (last Hostinger-deployed `main`).
- Branch `backup/cloudflare-staging-2026-10-15` (release branch history; CI-only pushes).
- Hostinger web hosting is untouched and can serve again ([POST-CUTOVER.md](POST-CUTOVER.md#rollback-to-hostinger)).
