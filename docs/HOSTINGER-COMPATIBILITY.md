# americawhat — Hostinger compatibility review (2026-10-15)

Read-only review of the owner's baseline backup
(`D:\PrivateBackups\AmericaWhat\2026-10-15-baseline`, outside the repository).
Nothing was copied into the repository, nothing was sent anywhere, no live
Hostinger file was touched and no request was made to the live site. Only
structure and aggregate counts are recorded here: no addresses, user agents,
paths, credentials or configuration values.

## 1. `analytics/log_df.php` — GET and POST

- Reads `path` and `referrer` from the query string **or** `$_POST`, with
  `HTTP_REFERER` as a last fallback; there is no method check. So it accepts
  both the current `main` client (`GET ?path=…&referrer=…`) and this branch's
  beacon (`POST`, `application/x-www-form-urlencoded`, fields `path`,
  `referrer`, `evt`). `evt` is ignored by PHP (it creates its own `event_id`).
- A JSON or `text/plain` body would arrive empty in `$_POST` (logged as path
  `-`); the beacon deliberately uses form encoding, so this does not occur.
- CORS allows only `https://americawhat.com` and `https://www.americawhat.com`,
  the same origins as the Worker's `PUBLIC_ORIGINS`.
- Conclusion: the POST beacon is compatible with Hostinger. No local fix needed.

## 2. Legacy analytics import (existing idempotent importer)

`npm run analytics:legacy -- inventory|rehearse` on the baseline log
(in memory only):

| Check | Result |
|---|---|
| Lines | 1,065 — 1,064 importable, 1 without a page (`missing_page`), 0 DST-ambiguous, 0 malformed |
| Range | 2026-07-07T09:32Z → 2026-10-15T20:03Z |
| Full import, then again | 1,064 events, second run adds 0 |
| Earlier snapshot (first 900 lines), then the full log | 900 + 164 new, 900 `already_present`, total 1,064 — no double count |
| Classification | 1,038 human, 26 automated |

A line's identity is the hash of the line plus its occurrence number, so
append-only snapshots (S1 at cutover, S2 after DNS settles) import safely.
**Do not edit or truncate the Hostinger log between snapshots**: a rewritten
line gets a new identity.

## 3. Reactions (votes)

- Baseline `aw_votes.json`: 14 story ids, 19 votes; parses cleanly.
- Rehearsal: baseline import adds 19; importing the same file again is refused
  (`already_imported`, by SHA-256). Later snapshots import only the positive
  per-key difference; a decrease is refused. Votes cast on Cloudflare are
  never overwritten (imports only add).
- The repository seed `public/analytics/aw_votes.json` is `{}`; it is excluded
  from the FTP upload (`**/aw_votes.json`) and from Cloudflare assets
  (`.assetsignore`), so neither deploy can overwrite live counts.

## 4. Server-side behaviour and what replaces it

| Hostinger behaviour | After cutover |
|---|---|
| `log_df.php` writes `aw_panel_log.txt` | Web Worker stores native rows in D1 (`/analytics/log_df.php` POST) |
| `log_df.php` geo lookup via a third-party IP API over plain HTTP | Cloudflare request metadata; legacy and native rows format country/city differently (expected) |
| `log_df.php` signed copy to DNDR Analytics (private config outside `public_html`) | **Gap.** Worker forwarding exists (`DNDR_COLLECTOR`) but needs a DNDR-side producer approval. Without it DNDR stops receiving AmericaWhat page views at cutover. |
| `vote.php`, `get_votes.php` | Worker implements both paths (POST-only writes, origin check, per-address/day guard) |
| `tracker.php` (blocked by `.htaccess`), `get_views.php`, `log_share.php`, `aw_shares.json` | Not referenced by the current site on either branch; not migrated (dead) |
| Old Boss `boss/index.php` + `boss/config.php` (GitHub contents API with a stored credential) | Replaced by the Cloudflare Boss. The old one stays reachable on Hostinger while web files exist: do not use it after cutover; revoke its credential when the rollback window ends |
| `.htaccess` security headers, branded 404, HTML no-cache | `public/_headers`, `not_found_handling: 404-page`, platform default revalidation |
| `analytics/.htaccess` denies `.txt/.log/.json` | Those files are never uploaded to Cloudflare; Worker returns 404 under `/analytics/` |
| Email (MX `mx1/mx2.hostinger.com`) | Stays on Hostinger; DNS records must be copied exactly (DNS-only) |

Nothing on the Cloudflare side calls Hostinger PHP. Clients that still resolve
to Hostinger after the DNS change keep writing to the PHP log and vote file;
the S2 snapshot import collects them.

Cached old HTML that still sends the GET tracking call gets a 204 from the
Worker and is not counted (GET never writes). Expected loss: page views from
browsers holding pre-cutover HTML for at most one revalidation.

## 5. Keep intact for a rollback to Hostinger

- `public_html` as it is, including all PHP, `.htaccess`, `aw_votes.json`,
  `aw_panel_log.txt`, `og/`, `boss/` and its config.
- The private DNDR relay config outside `public_html`.
- The GitHub repository secrets `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`
  and the tag `hostinger-final` (created by the owner before the merge).
- The DNS inventory (A/AAAA/CNAME/MX/TXT) taken before the nameserver change.
- For votes cast on Cloudflare: Boss → Reactions → export `aw_votes.json`
  (`exportVotesJson`) and upload it to Hostinger during a rollback.
- Native analytics rows stay in D1; the PHP log continues on its own, so a
  rollback causes no double count.

Current DNS (public lookup, 2026-10-15): nameservers are Hostinger's
(`*.dns-parking.com`); the zone is not active on Cloudflare yet.
