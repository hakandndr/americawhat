# americawhat — post-cutover duties

The site moved from Hostinger to Cloudflare on 2026-10-16 04:02 UTC. This file
holds everything still needed from the migration: the
30-day observation, the Hostinger rollback and Hostinger web retirement. The
full migration history is in [archive/migration/](archive/migration/).

## S2 reconciliation — waived by the owner (2026-10-15)

No further Hostinger snapshots are imported; S1 (2026-10-16) is the last
legacy import and the reminder task is disabled. The procedure below stays
for reference only, should the owner ever reverse that decision.

1. Owner: hPanel → File Manager → `public_html/analytics/` → download
   `aw_panel_log.txt` and `aw_votes.json` into
   `D:\PrivateBackups\AmericaWhat\<date>-S2\`. Never edit or truncate the
   Hostinger log (line identity = line hash + occurrence).
2. Record SHA-256 of both files.
3. Analytics (offline SQL, owner OAuth for wrangler, `CLOUDFLARE_API_TOKEN` unset):

```bash
npm run analytics:legacy -- rehearse <S2 log> D:/PrivateBackups/AmericaWhat/2026-10-16-S1/aw_panel_log.txt
```

```bash
npm run analytics:legacy -- sql <S2 log> --out private/s2.sql
```

```bash
npx wrangler d1 execute americawhat-analytics-production --remote --env production --config workers/web/wrangler.jsonc --file private/s2.sql
```

   Run the execute twice: the second run must add 0 events. Delete
   `private/s2.sql` (it contains visitor data). Expected: S1's 1,084 lines are
   `already_present`; only newer lines are imported.
4. Votes: Boss → Reactions → upload the S2 `aw_votes.json`, review the preview,
   confirm with the SHA-256 prefix. It is applied as a **delta** (only increases
   are added; a decrease is refused; the same file twice is refused).
5. Repeat once more later only if Hostinger still receives visits.

## 30-day observation (until 2026-11-15)

- Watch Workers/D1 metrics (errors, CPU, 1102) and Boss Analytics.
- Keep **everything** needed for a rollback: Hostinger web files (including PHP,
  `.htaccess`, `analytics/aw_votes.json`, `analytics/aw_panel_log.txt`, `boss/`
  and its config), the private DNDR relay config outside `public_html`, the
  GitHub secrets `FTP_SERVER` / `FTP_USERNAME` / `FTP_PASSWORD`, the tag
  `hostinger-final`, and the backups listed in [CURRENT-STATE.md](CURRENT-STATE.md).
- Do not use the old Hostinger Boss (`/boss/` on Hostinger): it would write to
  `main` beside the Cloudflare Boss.

## Rollback

**Code only** (seconds): GitHub → Actions → "Roll back Cloudflare Worker"
(target `production`, worker, previous version UUID from
[CURRENT-STATE.md](CURRENT-STATE.md), confirm `production/web` or
`production/boss`). D1 data, secrets and domains are untouched.

### Rollback to Hostinger

1. Cloudflare → Workers → `americawhat-web-production` → Domains & Routes:
   remove `americawhat.com` and `www.americawhat.com`.
2. Cloudflare DNS (zone americawhat.com): add, DNS-only,
   `@ A 45.89.205.38` (TTL 1800), `@ AAAA 2a02:4780:1:2242:0:145e:6975:6`
   (TTL 1800), `www CNAME americawhat.com` (TTL 300) — the lines of
   [dns/cloudflare-import-2026-10-16.txt](dns/cloudflare-import-2026-10-16.txt).
   Hostinger CDN stays off (it needs Hostinger nameservers).
3. Votes cast on Cloudflare: Boss → Reactions → export `aw_votes.json`, upload to
   Hostinger `public_html/analytics/`.
4. Stories published on Cloudflare: republish Hostinger with the retired
   workflow's original version — run "Deploy to Hostinger" on a branch made from
   tag `hostinger-final` plus the current `src/data/*.json`.
5. Native analytics stay in D1; the PHP log continues; nothing is double-counted.
6. The Hostinger origin certificate (Let's Encrypt) renews by HTTP-01 while the
   origin records point at it; it was valid until 2026-12-04 at cutover.

## Hostinger web retirement (after 2026-11-15, separate approval)

Delete Hostinger web files, the three `FTP_*` GitHub secrets and the `ftp`
DNS record; revoke the old Hostinger Boss GitHub credential. **Keep the
Hostinger plan and all e-mail DNS records** (MX, SPF, DMARC, DKIM,
autoconfig/autodiscover).

## DNDR

Hostinger's `log_df.php` copied page views to DNDR; that stopped at cutover.
Forwarding as `prd_americawhat_native` is implemented (ANALYTICS.md §5) and
waits for the DNDR-side producer registration and an owner-approved release.
Until then AmericaWhat's native analytics are complete on their own; DNDR has a
gap from 2026-10-16 (native rows only).
