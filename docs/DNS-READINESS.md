# americawhat — DNS migration readiness and email preservation

Read-only inspection, 2026-10-15 (public DNS over HTTPS and one read-only Cloudflare API zone lookup).
**No nameserver, record, email routing or registrar setting was changed.**
The `americawhat.com` zone does **not** exist in the Cloudflare account yet
(API check: "not present").

## Current authoritative DNS (Hostinger)

- Nameservers: `hermes.dns-parking.com`, `artemis.dns-parking.com` (SOA
  `dns.hostinger.com`, serial 2026101501). No DNSSEC (no DS / DNSKEY), so no
  DS record has to be removed before the nameserver change.
- The site is served by **Hostinger CDN** (response headers `server: hcdn`,
  `platform: hostinger`). The apex A/AAAA answers rotate on every lookup (TTL
  60 s, several Hostinger addresses) — they are a flattened alias of
  `americawhat.com.cdn.hstgr.net`, not fixed IPs.

Public lookups cannot list every record (no zone transfer). **Before adding the
zone to Cloudflare, export the full zone from hPanel (DNS / Nameservers → export
or screenshot every record) and compare it line by line with this table.**

## Record checklist (copy exactly; all DNS-only / grey cloud)

| Name | Type | Value seen | TTL | In Cloudflare |
|---|---|---|---|---|
| `americawhat.com` | MX 5 | `mx1.hostinger.com` | 14400 | MX 5, DNS-only — **email** |
| `americawhat.com` | MX 10 | `mx2.hostinger.com` | 14400 | MX 10, DNS-only — **email** |
| `americawhat.com` | TXT (SPF) | `v=spf1 include:_spf.mail.hostinger.com ~all` | 3600 | identical TXT — **email**. Only one SPF record may exist |
| `_dmarc` | TXT | `v=DMARC1; p=none` | 3600 | identical TXT — **email** |
| `hostingermail-a._domainkey` | CNAME | `hostingermail-a.dkim.mail.hostinger.com` | 300 | CNAME, DNS-only (not a copied TXT: Hostinger rotates the key behind it) — **email** |
| `hostingermail-b._domainkey` | CNAME | `hostingermail-b.dkim.mail.hostinger.com` | 300 | CNAME, DNS-only — **email** |
| `hostingermail-c._domainkey` | CNAME | `hostingermail-c.dkim.mail.hostinger.com` | 300 | CNAME, DNS-only — **email** |
| `autodiscover` | CNAME | `autodiscover.mail.hostinger.com` | 300 | CNAME, DNS-only — mail clients |
| `autoconfig` | CNAME | `autoconfig.mail.hostinger.com` | 300 | CNAME, DNS-only — mail clients |
| `ftp` | A | `45.89.205.38` | 1800 | A, DNS-only (Hostinger FTP; keep until web retirement) |
| `americawhat.com` (apex) | flattened alias | → `americawhat.com.cdn.hstgr.net` | 60 | **Before cutover:** CNAME (flattened) `americawhat.com.cdn.hstgr.net`, DNS-only. **At cutover:** replaced by the Worker custom domain |
| `www` | CNAME | `www.americawhat.com.cdn.hstgr.net` | 300 | **Before cutover:** CNAME, DNS-only. **At cutover:** replaced by the Worker custom domain |
| `boss` | — | does not exist | — | created by the Boss Worker custom domain at cutover, after Access |
| CAA, SRV, `_mta-sts`, `_smtp._tls`, `mail`, `webmail`, `_domainconnect` | — | none found | — | verify against the hPanel export |

Rules:

1. Every record DNS-only (grey cloud). Proxying Hostinger CDN or mail hosts
   through Cloudflare can break TLS and mail.
2. Do not let the Cloudflare zone scan's guesses stand: it may import the
   rotating apex A/AAAA addresses as fixed records or mark records proxied.
   Replace the apex with the flattened CNAME above and delete scanned extras.
3. Lower nothing on Hostinger before the switch; after Cloudflare shows the
   zone "pending", compare `dig @<cloudflare-ns>` answers with the hPanel
   export for every name in the table, especially MX, SPF, DKIM and DMARC.
4. Change nameservers at the registrar only after that comparison; then the
   site keeps running on Hostinger (same targets), only the DNS host moves.
5. Mail checks after the switch: MX lookup, send/receive a test mail, a
   DKIM-signed message shows `dkim=pass` and `spf=pass` in its headers.

## Hostinger rollback consequence

Because the apex is a CDN alias, a rollback of the website does **not**
restore fixed IP addresses: delete the Worker custom domains and recreate
`americawhat.com` as CNAME (flattened) `americawhat.com.cdn.hstgr.net` and
`www` as CNAME `www.americawhat.com.cdn.hstgr.net`, DNS-only. (Supersedes the
"restore A/AAAA records" wording elsewhere.)

## Boss Access dependency

The production Access application for `boss.americawhat.com` cannot be created
yet: a self-hosted Access application needs the hostname's zone in the
Cloudflare account (it is not present), and the CLI login has no Access
permission. Order: zone active → owner creates the Access app in the dashboard
(team `dndrnet.cloudflareaccess.com`, policy Allow, Include emails
`hakan@dndr.net` only, session ≤ 24 h) → copy the AUD →
`node scripts/release/set-production-config.mjs --app-db 3097933b-4feb-4e50-bb59-760fd06a640e --analytics-db 1012183d-96cd-4d7f-8e93-ca247ca43589 --access-aud <AUD>`
→ upload a Boss version → only then attach `boss.americawhat.com`.
Until then the production Boss has an empty AUD and answers 503 to every
request, and it has no route, workers.dev or preview URL.
