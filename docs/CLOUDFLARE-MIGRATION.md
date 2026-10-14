# americawhat — Cloudflare migration and release runbook

Goal: move the **web hosting** (static site, PHP endpoints, Studio panel, FTP
deploy) from Hostinger to Cloudflare. **Email stays on Hostinger** (owner
decision): MX, SPF, DKIM, DMARC, mailboxes and forwarding are not changed, and
no Hostinger subscription is cancelled while it provides email.

Every step below that touches production, DNS or real data needs its own owner
approval. Nothing in this document has been executed in production.

## 0. Status of the preparation (2026-10-14)

- Implementation on branch `dev/cloudflare-native` (never merged).
- Staging: `americawhat-web-staging` on
  `https://americawhat-web-staging.hakan-c89.workers.dev` (noindex, synthetic
  data), `americawhat-boss-staging` uploaded with **no route** (unreachable),
  D1 `americawhat-app-staging` (`a3c9ff1f-05c2-4ed6-bb9e-4ca41f4cc9e2`) and
  `americawhat-analytics-staging` (`306b9ee6-2529-4f95-b43c-c7cd9dbf0a3c`).
- Production resources: **none created.**

## 1. Hostinger inventory and backup (owner, read-only)

Download `public_html` (hPanel → File Manager → compress → download) and the
private relay configuration's *existence* to an encrypted folder outside the
repository and outside any synced folder. Never paste file contents, addresses
or secrets into a chat, issue or commit.

| Class | Item | Why |
|---|---|---|
| Source code (server-only) | `public_html/boss/` (all files), `analytics/log_df.php`, `analytics/dndr-relay.php`, `analytics/tracker.php` (if present), the relay backup directory DNDR mentions | Not in `main`; needed for comparison and rollback |
| Source code (deployed from Git) | `analytics/vote.php`, `analytics/get_votes.php`, `.htaccess`, `analytics/.htaccess` | Verify they equal the repository |
| Secrets | `boss/config.php`, `/domains/americawhat.com/dndr-relay.config.php` | Record existence and date only; revoke at retirement |
| Reaction counts | `analytics/aw_votes.json` | The only copy of the vote counts |
| Visitor history | `analytics/aw_panel_log.txt` and any rotated/older log | Legacy analytics; personal data |
| Deployment artifacts | everything else, `.ftp-deploy-sync-state.json` | Rebuildable from Git; hash manifest only |
| Hosting configuration | hPanel cron jobs, PHP version, redirects, SSL, **full DNS zone list**, email accounts and forwarders (names only), domain registrar and renewal dates | Needed for the DNS move and for keeping email |

Safe summaries (print counts, dates and hashes only; `<A>` is the unpacked archive):

```powershell
Get-ChildItem -Recurse -File <A> | Get-FileHash -Algorithm SHA256 | Export-Csv <A>\..\manifest.csv
```
```bash
npm run analytics:legacy -- inventory "<A>/analytics/aw_panel_log.txt"
```
```bash
node -e "const v=JSON.parse(require('fs').readFileSync(process.argv[1]));let t=0;for(const r of Object.values(v))for(const n of Object.values(r))t+=n;console.log({keys:Object.keys(v).length,total:t})" "<A>/analytics/aw_votes.json"
```
```bash
git hash-object "<A>/boss/index.php"
```

Compare the last with `git rev-parse origin/main:public/studio/index.php`, and the
log inventory's first 1,032 lines with DNDR's snapshot SHA `33fadc4f…89468`.

**Before merging anything to `main`** (the FTP deploy would ship the new
`tracking.js`): confirm the server's current `log_df.php` reads POST fields (the
reviewed copy does: `$_GET['path'] ?? $_POST['path']`). The new beacon uses POST.

## 2. DNS requirements (separate operation, later)

Worker custom domains need the zone on Cloudflare (full setup). Current public
records (read 2026-10-14):

| Record | Value | On Cloudflare |
|---|---|---|
| NS | `hermes.dns-parking.com`, `artemis.dns-parking.com` | replaced by the Cloudflare pair at the registrar |
| A `americawhat.com` | Hostinger CDN (two IPv4) | keep, **DNS only**, until the app cutover |
| AAAA `americawhat.com` | Hostinger CDN (two IPv6) | same |
| CNAME `www` | `www.americawhat.com.cdn.hstgr.net` | same |
| MX | `mx1.hostinger.com` (5), `mx2.hostinger.com` (10) | **identical, DNS only** |
| TXT SPF | `v=spf1 include:_spf.mail.hostinger.com ~all` | identical |
| CNAME DKIM | `hostingermail-a/b/c._domainkey` | identical, **DNS only** (never proxied) |
| TXT `_dmarc` | `v=DMARC1; p=none` | identical |
| anything else in the hPanel zone list | — | copy exactly; the public lookup above is not a complete list |

Order: (a) add the zone to the Cloudflare account and import the full hPanel
zone list; (b) compare record by record; (c) change nameservers at the
registrar; (d) verify mail delivery both ways and that the site is unchanged
(`server: hcdn`). Rollback: put the Hostinger nameservers back. The site does
not move in this step.

## 3. Production provisioning (owner-approved, before cutover)

1. Create D1 `americawhat-app-production` and `americawhat-analytics-production`;
   put their ids into `env.production` of both wrangler configs; apply
   `migrations/app` and `migrations/analytics` (`--remote --env production`),
   after recording a Time Travel bookmark.
2. Create the Access application for `boss.americawhat.com` (allow
   `hakan@dndr.net` only); put its AUD tag into `BOSS_ACCESS_AUD`.
3. Secrets: `GITHUB_TOKEN` (new fine-grained PAT, this repository only,
   Contents read/write, expiry noted), `BOSS_CSRF_SECRET`, `REACTION_GUARD_SECRET`.
4. Deploy `americawhat-boss --env production` (custom domain
   `boss.americawhat.com`); verify Access blocks other identities and Health is green.
5. CI: add a production deploy job behind a GitHub Environment `production` with
   required reviewer `hakandndr`, using a Cloudflare API token limited to Workers
   scripts and D1 for this account. Until then deploy by hand.

## 4. App cutover (owner-approved window)

Prerequisites: §1 done; DNS on Cloudflare (§2); §3 done; staging smoke and
`npm run parity:live` green on the exact commit; legacy-import decision taken
(ANALYTICS.md §6).

1. **Reaction baseline S1:** download `aw_votes.json`; Boss → Reactions →
   upload, check the plan, apply with the SHA prefix (baseline).
2. **Legacy log S1:** download `aw_panel_log.txt`; Boss → Analytics → Legacy
   log import; inventory, then apply. Check the reconciliation.
3. Deploy `americawhat-web --env production` (custom domains `americawhat.com`
   and `www.americawhat.com`). This replaces the Hostinger A/AAAA/CNAME answers.
4. Smoke: `npm run smoke -- https://americawhat.com` (read checks only),
   `npm run parity:live`, a manual reaction and page view from a browser, Boss
   Analytics shows the native row.
5. Keep the FTP deploy running during observation so Hostinger stays current.
6. After 72 h: download S2 of both files; import them (reactions: delta, refused
   if any count decreased; log: only new lines are inserted). Repeat at
   retirement.

## 5. Rollback

- **Site:** detach the custom domains from `americawhat-web-production` and
  restore the recorded Hostinger A/AAAA/CNAME records (DNS only). Hostinger is
  current because FTP deploys continued.
- **Reactions:** Boss → Reactions → *Export current counts as aw_votes.json*;
  upload over the Hostinger file (votes cast on Cloudflare are preserved).
- **Analytics:** native rows stay in D1; on rollback the PHP logger resumes.
  Nothing is double counted because each view reached only one origin.
- **Content:** unaffected (Git).
- **D1:** forward-fix preferred; Time Travel restore only as a last resort
  (rewinds ALL # numbering, see ANALYTICS.md).

## 6. Hostinger web retirement (later, separate approval)

- 30 days stable on Cloudflare; at least two weekly review cycles done in Boss.
- Final S3 imports of `aw_votes.json` and `aw_panel_log.txt`.
- Remove the FTP job and `FTP_*` secrets; revoke the Studio PAT; ask DNDR to
  retire `aw-prod-2026-10` / `prd_americawhat_relay`.
- Remove the web files from `public_html` (owner, after the archive is verified).
- **Do not cancel the Hostinger plan while it provides email for
  americawhat.com** (MX/SPF/DKIM point to Hostinger mail).

## 7. Approvals required, in order

1. Run the Hostinger inventory/backup (§1).
2. Merge `dev/cloudflare-native` into `main` (ships the POST beacon and the new
   slug function to Hostinger; no visible change).
3. DNS move (§2).
4. Production provisioning (§3), including the Access application.
5. Legacy-import scope decision and the real imports (§4.1–4.2).
6. App cutover (§4.3).
7. DNDR-side: gap import and native producer (separate project).
8. Privacy page update (ANALYTICS.md §6).
9. Hostinger web retirement (§6).
