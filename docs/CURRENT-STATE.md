# americawhat — current state

Single source of truth for what is live. Verified 2026-10-16 (content release 03e6c1b, then the final owner-approved
docs baseline: `/api/health` → `release` must equal `origin/main`). Update the tables in place when something changes.

## Production (Cloudflare Workers, live since 2026-10-16 04:02 UTC)

| Item | Value |
|---|---|
| Source | `main` @ the merge commit of the documentation PR that follows 03e6c1b (code = 2ef6a57), deployed as the **final owner-approved baseline** (manual `production` run; version ids in its Actions summary). Before it: signed Boss content 03e6c1b (aw-0141) deployed automatically to Web by run 38969184397 (`production-content`, no approval) over baseline 224a1ae (run 38968358107) |
| Site | https://americawhat.com and https://www.americawhat.com → Worker `americawhat-web-production`, version from the baseline run (`npx wrangler deployments status --env production --config workers/web/wrangler.jsonc`); binding `DNDR_COLLECTOR` → `dndr-collector#ProducerApi` (`prd_americawhat_native`), cron `*/15 * * * *` (DNDR outbox recovery) |
| Boss | https://boss.americawhat.com → Worker `americawhat-boss-production`, version from the baseline run (secrets inherited, incl. `BOSS_CONTENT_SIGNING_KEY`), behind Cloudflare Access (team `dndrnet`, `hakan@dndr.net` only; AUD `6b54c079…a224fe`) |
| Previous versions (rollback) | Web `f7b6d7be-7c53-43c5-9607-71cf4d45ef96` (content 03e6c1b), Boss `9b5217b0-7a13-4afe-96f7-53d9d286d355` (224a1ae, signing key); before that Web `d2d22121…` (224a1ae), Boss `8007211d…` (2ef6a57 + signing key); before that Web `2c785866…`, Boss `ca9420f0…` (2ef6a57); Web `a1190c3c-bf76-45c4-ade3-ee67b9244158`, Boss `92a81be7-9187-4dcc-9844-53c9b09205e0` (release 8a9cf35); before that Web `55912dc3…`, Boss `187c1ab2…` (09c90da) |
| Health | `/api/health`: status ok, environment production, release 03e6c1b, `app_db`, `analytics_db`, `reaction_secret`, `schema_app`, `schema_analytics` all ok |
| D1 | `americawhat-app-production` `3097933b-4feb-4e50-bb59-760fd06a640e`, `americawhat-analytics-production` `1012183d-96cd-4d7f-8e93-ca247ca43589` (WNAM, migration 0001 each) |
| Analytics | 1,083 legacy events (Hostinger log S1, imported idempotently; ledger 1,084 incl. 1 line without a page) + native page views since cutover (30 at 20:50 UTC; collection re-verified after the release) |
| Reactions | S1 baseline **applied** through Boss: 1 import (`baseline`, 14 items, +19 votes); live votes are added on top (21 in total at the time of writing) |
| Content | 130 published stories (aw-0141 live with its OG image after the automatic content deploy), 29 pending candidates (Boss shows the live count beside Published); 125 approved OG images (frozen archive, 124 stories + default); stories approved later (aw-0136 onward) get their image from the pinned renderer at release (`gen-og.py --missing`); the RSS fetch keeps adding candidates three times a day |
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
| Automatic Web-only deploy of signed Boss content (`production-content`) | **Live** since 2026-10-16 21:26 UTC: Environment `production-content` (branch `main` only, no reviewer, admin bypass off) with its own Web-only token (owner-created, expiring); Ed25519 proof key in production Boss only, `BOSS_CONTENT_PUBLIC_KEY` and `CF_CONTENT_DEPLOY_ENABLED=true` set. Accepted live with aw-0141 (run 38969184397: `content_deploy` ok, `deploy` skipped, 0 approvals). Ready again after the final docs baseline. Any non-content commit since the live release (docs included) sends the next news to `production` review until a new baseline ([DEPLOYMENT.md](DEPLOYMENT.md#operating-automatic-content)) |
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
| 3 | Credential expiry: note and rotate the Boss GitHub PAT (≤90 days) and the three Cloudflare CI tokens (`production`, `production-content`, `staging`); keep the encrypted backup of `BOSS_CONTENT_SIGNING_KEY` ([PRODUCTION-PROVISIONING.md](PRODUCTION-PROVISIONING.md#rotation)) | track dates in the owner's vault |
| 4 | DNDR cutover gap: native rows stored 2026-10-16 04:03–20:46 UTC (30; forwarding live since 20:52) are not in DNDR. Fill only through an owner-approved DNDR history import keyed on `event_uid` (DNDR dates `recordPage` events on receipt, so no replay) | owner decision |
| 5 | Privacy page "~90 days" wording vs. manual-only retention; 3 real visitor rows / 2 votes in staging (delete or keep) | owner decision |

## Backups and rollback anchors

- Content signing key: the only copies are the production Boss secret and the owner's encrypted vault (no plaintext file kept).
- Hostinger baseline backup: `D:\PrivateBackups\AmericaWhat\2026-10-15-baseline\` (hash manifest inside).
- Final pre-cutover snapshots S1: `D:\PrivateBackups\AmericaWhat\2026-10-16-S1\`
  (`aw_panel_log.txt` SHA-256 `EA4894DB…F6084C`, `aw_votes.json` `55F0C0E0…0955AE`).
- Git tag `hostinger-final` → `36e1c9b` (last Hostinger-deployed `main`).
- Branch `backup/cloudflare-staging-2026-10-15` (release branch history; CI-only pushes).
- Hostinger web hosting is untouched and can serve again ([POST-CUTOVER.md](POST-CUTOVER.md#rollback-to-hostinger)).
