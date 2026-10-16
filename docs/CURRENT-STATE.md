# americawhat — current state

Single source of truth for what is live. Verified 2026-10-16 (after the
Cloudflare cutover). Update the tables in place when something changes.

## Production (Cloudflare Workers, live since 2026-10-16 04:02 UTC)

| Item | Value |
|---|---|
| Source | `main` @ **a6ef6b2** (GitHub `hakandndr/americawhat`) |
| Site | https://americawhat.com and https://www.americawhat.com → Worker `americawhat-web-production`, version `5fa975eb-873b-4340-bb67-ca8f780675dc` |
| Boss | https://boss.americawhat.com → Worker `americawhat-boss-production`, version `6b2782ab-3cf4-4981-9f0b-35850f8465bf`, behind Cloudflare Access (team `dndrnet`, `hakan@dndr.net` only; AUD `6b54c079…a224fe`) |
| Previous versions (rollback) | Web `de2f8985-e5d8-463c-b53e-804310b5e36f`, Boss `5aa28574-4b7f-4ad1-ba7c-7c8093d33c68` (release 81b99b3); before that Web `bc4b861b…`, Boss `7478bfd0…` (d7e252a) |
| Health | `/api/health`: status ok, environment production, release a6ef6b2, `app_db`, `analytics_db`, `reaction_secret`, `schema_app`, `schema_analytics` all ok |
| D1 | `americawhat-app-production` `3097933b-4feb-4e50-bb59-760fd06a640e`, `americawhat-analytics-production` `1012183d-96cd-4d7f-8e93-ca247ca43589` (WNAM, migration 0001 each) |
| Analytics | 1,083 legacy events (Hostinger log S1, imported idempotently; ledger 1,084 incl. 1 line without a page) + native page views since cutover (26 at the time of writing) |
| Reactions | S1 baseline **applied** through Boss: 1 import (`baseline`, 14 items, +19 votes); live votes are added on top (21 in total at the time of writing) |
| Content | 124 published stories; 125 approved OG images (frozen); the RSS fetch keeps adding candidates three times a day |
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
| 1 | Review and merge PR #5 (Boss red pending-count badge beside Weekly review; Analytics PAGE wraps, REFERRER wider; drafted rejections preselect Reject) and approve the production deploy; then merge PR #6 (editorial drafts in `pending.json`) | owner |
| 2 | Weekly review in Boss after #5/#6: 5 stories drafted for approval (Pelham driveway tickets, Spring Hill iguana, Grand Junction guinea pig, Uber One class action, Washington HOA fences — the last needs "allow aggregator link"); 117 candidates preselected Reject with reason and note; 24 left for judgement (incl. the Keys resort tab story — victim over 60 — and the Josh Allen DUI story — named public figure) | owner |
| — | S2 reconciliation: **waived** by the owner 2026-10-15; reminder task disabled; S1 stays the last legacy import | closed |
| — | Staging sync to the production code: deferred to a separate session (approval needed) | deferred |
| 3 | 30-day observation; then retire Hostinger web files, delete the FTP secrets, revoke the old Hostinger Boss credential (e-mail stays) | until 2026-11-15, then separate approval |
| 4 | Credential expiry: note and rotate the Boss GitHub PAT (≤90 days) and both Cloudflare CI tokens | track dates in the owner's vault |
| 5 | DNDR forwarding is off; `workers/web` `dndr-forward.mjs` needs a DNDR-side producer registration and a `DNDR_COLLECTOR` binding. Deferred to a separate DNDR session; native analytics work independently | deferred |
| 6 | Privacy page "~90 days" wording vs. manual-only retention; 3 real visitor rows / 2 votes in staging (delete or keep) | owner decision |

## Backups and rollback anchors

- Hostinger baseline backup: `D:\PrivateBackups\AmericaWhat\2026-10-15-baseline\` (hash manifest inside).
- Final pre-cutover snapshots S1: `D:\PrivateBackups\AmericaWhat\2026-10-16-S1\`
  (`aw_panel_log.txt` SHA-256 `EA4894DB…F6084C`, `aw_votes.json` `55F0C0E0…0955AE`).
- Git tag `hostinger-final` → `36e1c9b` (last Hostinger-deployed `main`).
- Branch `backup/cloudflare-staging-2026-10-15` (release branch history; CI-only pushes).
- Hostinger web hosting is untouched and can serve again ([POST-CUTOVER.md](POST-CUTOVER.md#rollback-to-hostinger)).
