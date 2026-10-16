# americawhat — DNS and e-mail

Zone `americawhat.com` is on Cloudflare (nameservers `courtney.ns.cloudflare.com`,
`porter.ns.cloudflare.com`) since 2026-10-16. The web runs on Cloudflare
Workers; **e-mail stays on Hostinger**. The migration analysis (Hostinger CDN,
option comparison, pending-zone procedure) is archived in
[archive/migration/DNS-READINESS-2026-10-16.md](archive/migration/DNS-READINESS-2026-10-16.md).

## Records

| Name | Type | Value | Purpose |
|---|---|---|---|
| `@`, `www` | Worker custom domains | `americawhat-web-production` | web (proxied by Cloudflare by design) |
| `boss` | Worker custom domain | `americawhat-boss-production` | Boss, behind Access |
| `@` | MX | `5 mx1.hostinger.com`, `10 mx2.hostinger.com` (TTL 14400) | **e-mail** |
| `@` | TXT | `v=spf1 include:_spf.mail.hostinger.com ~all` | **SPF** (only one SPF record) |
| `_dmarc` | TXT | `v=DMARC1; p=none` | **DMARC** |
| `hostingermail-a/b/c._domainkey` | CNAME | `hostingermail-a/b/c.dkim.mail.hostinger.com` | **DKIM** (keep as CNAMEs, never flatten) |
| `autoconfig`, `autodiscover` | CNAME | `autoconfig/autodiscover.mail.hostinger.com` | mail clients |
| `zzwor4l5qvov` | CNAME | `gv-5bsl4swe37pvva.dv.googlehosted.com` (TTL 14400) | Google domain verification |
| `ftp` | A | `45.89.205.38` | Hostinger FTP (remove at retirement) |

All non-web records are DNS-only (grey cloud). Do not enable Cloudflare Email
Routing (it replaces MX) or proxy the mail, verification or ftp records.
`http://` answers 301 to `https://` (verified 2026-10-16).
No DNSSEC is configured.

## Tools

- `node scripts/release/dns-compare.mjs --servers courtney.ns.cloudflare.com,porter.ns.cloudflare.com`
  — asks the nameservers directly and compares every record in
  `scripts/release/dns-records.json`. Since the cutover the apex, `www` and
  `boss` rows are expected to differ (they are Worker domains now); every mail,
  verification and ftp row must stay `OK`.
- `node scripts/release/dns-zone.mjs reconcile|spec|cloudflare <BIND file>` —
  parses a zone export, compares it with the inventory, or writes a
  Cloudflare-safe import file (qualified names, no SOA/NS, all DNS-only).
- [dns/](dns/) — the Hostinger exports before and after disabling Hostinger CDN
  and the generated Cloudflare import file. `scripts/release/dns-records.json`
  describes the pre-cutover (Hostinger origin) zone, which is also the
  Hostinger rollback target.

## Rollback

Restoring the Hostinger web records is described in
[POST-CUTOVER.md](POST-CUTOVER.md#rollback-to-hostinger). Hostinger CDN cannot
be used while Cloudflare is authoritative (it requires Hostinger nameservers).
