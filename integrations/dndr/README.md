# DNDR Analytics — signed relay for the PHP logger

Nothing in this directory is deployed: `deploy.yml` uploads `dist/` (built from
`src/` and `public/`) only. These files are the reviewed integration for the
server-side logger, which itself lives only on the server
(`public_html/analytics/log_df.php`, not in this repository).

## What stays as it is

- `aw_panel_log.txt` on the server stays the source of truth for visitor
  analytics, and the Studio panel (`public/studio/`) keeps reading it. DNDR
  Analytics is an additional, central view; it never replaces Studio and
  nothing here depends on it.
- No public page, script or route changes. The browser keeps calling
  `/analytics/log_df.php` exactly as before.

## Why a signed relay

`americawhat.com` is served by Hostinger (its nameservers and CDN; no
Cloudflare proxy), so no Cloudflare route or Service Binding can see a visit.
The logger therefore signs each stored line and POSTs it server-to-server to
the DNDR collector (HMAC-SHA256, timestamped, keyed by a key id DNDR's
registry knows; the secret stays in a private file outside `public_html`).

## Files

| File | Purpose |
|---|---|
| `dndr-relay.php` | Neutral sender, identical to DNDR's `docs/reference/dndr-relay.php`. Answers 404 if requested directly. |
| `log_df.php` | The logger with the additive change, based on the owner's local copy of 2026-07-13. **Compare it with the server's current file before uploading anything.** |
| `dndr-relay.config.example.php` | Template for the private configuration (no secret). |

The change to the logger is additive:

1. every line gains a random `event_id` (Studio ignores unknown fields), so the
   line's DNDR id `panel_log:<sha256 of the line, 32 hex>.0` is unique and a
   retried delivery is a no-op; DNDR's history importer gives the same line
   the same id;
2. the geo lookup also asks for `countryCode` (the logged `country` is
   unchanged);
3. after the line is written and the visitor's response is finished, the line
   is sent to DNDR when both `dndr-relay.php` and the private configuration
   exist. Without the configuration nothing is sent.

## Staging rehearsal (2026-10-02)

Run against DNDR's staging collector from an isolated local PHP runtime
serving this repository's build with the patched logger and its own empty log
(no Hostinger change, no production data): see DNDR's
`docs/PRODUCTION-PROVISIONING.md` §12t for the result.

## Production (not done; needs the owner's approval)

1. Export the server's `public_html/analytics/aw_panel_log.txt` (Hostinger
   File Manager → download) for DNDR's history import; keep the download
   private.
2. DNDR enrols a production producer and gives a key id; its secret is created
   once and stored only in the DNDR collector and the private file below.
3. Upload `dndr-relay.php` to `public_html/analytics/`, create
   `dndr-relay.config.php` next to `public_html` from the template, and apply
   the logger change to the server's `log_df.php`.
4. Verify: a page view appears in Studio and in DNDR with the same count.
