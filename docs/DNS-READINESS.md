# americawhat — DNS zone move readiness and email continuity

Authoritative for the DNS part of the migration (verified 2026-10-15/16).
**Read-only so far:** no nameserver, Hostinger DNS record, email setting,
registrar setting or Cloudflare zone was changed or created.

## Verified facts

| Fact | How verified |
|---|---|
| Authoritative nameservers: `hermes.dns-parking.com`, `artemis.dns-parking.com` (Hostinger); SOA admin `dns.hostinger.com`, serial 2026101501 | queried both servers directly |
| Both servers return the identical record set (table below) | direct queries to each server |
| No wildcard record (a random name is NXDOMAIN); `boss` does not exist | direct probe |
| No DNSSEC (no DS, no DNSKEY) — nothing to remove at the registrar before a nameserver change | DNS-over-HTTPS with DO bit |
| The apex has no fixed address: Hostinger answers 2 A + 2 AAAA that change on every query (TTL 60), i.e. an alias of its CDN | repeated direct queries |
| `americawhat.com.cdn.hstgr.net` and `www.americawhat.com.cdn.hstgr.net` serve the site with a valid certificate (HTTP 200, TLS verify OK, `server: hcdn`) | `curl --resolve` to the CDN host addresses, read-only GET of `/robots.txt` |
| The zone is **not** in the Cloudflare account | API read |
| The CLI login **cannot create zones** (`com.cloudflare.api.account.zone.create` missing; HTTP 403, nothing created) | one attempt with `jump_start=false` |

## Records to preserve (exact; all DNS-only / grey cloud)

Machine-readable copy: [`scripts/release/dns-records.json`](../scripts/release/dns-records.json).

| Name | Type | Value | TTL | Purpose |
|---|---|---|---|---|
| `@` | MX | `5 mx1.hostinger.com` | 14400 | **email** |
| `@` | MX | `10 mx2.hostinger.com` | 14400 | **email** |
| `@` | TXT | `v=spf1 include:_spf.mail.hostinger.com ~all` | 3600 | **email – SPF** (only one SPF record allowed) |
| `_dmarc` | TXT | `v=DMARC1; p=none` | 3600 | **email – DMARC** |
| `hostingermail-a._domainkey` | CNAME | `hostingermail-a.dkim.mail.hostinger.com` | 300 | **email – DKIM** (keep as CNAME, never copy the TXT behind it) |
| `hostingermail-b._domainkey` | CNAME | `hostingermail-b.dkim.mail.hostinger.com` | 300 | **email – DKIM** |
| `hostingermail-c._domainkey` | CNAME | `hostingermail-c.dkim.mail.hostinger.com` | 300 | **email – DKIM** |
| `autodiscover` | CNAME | `autodiscover.mail.hostinger.com` | 300 | mail client setup |
| `autoconfig` | CNAME | `autoconfig.mail.hostinger.com` | 300 | mail client setup |
| `ftp` | A | `45.89.205.38` | 1800 | Hostinger FTP (until web retirement) |
| `www` | CNAME | `www.americawhat.com.cdn.hstgr.net` | 300 | web until cutover |
| `@` | CNAME (flattened) | `americawhat.com.cdn.hstgr.net` | Auto | web until cutover (Hostinger shows it as an alias) |

Not found by any query (confirm with the hPanel export): verification TXT
records, CAA, SRV, MTA-STS/TLS-RPT, `mail`, `webmail`, `smtp`, `imap`, other
subdomains.

## Needed from hPanel (owner, one time)

1. **The full DNS zone of americawhat.com** (hPanel → Domains → DNS / Nameservers:
   export, or screenshots of every row with name, type, value, TTL). Public
   queries cannot list names that nobody knows about.
2. **How the apex is defined there** (ALIAS / CDN record, or A records) and
   whether hPanel → Website → CDN states different records to use with external
   nameservers.
3. **Email → DNS / Mail service settings** page: the records Hostinger expects
   for this mailbox domain (to confirm MX, SPF, the three DKIM selectors, DMARC).
4. **Registrar and lock:** where the domain is registered, that the owner can
   change nameservers there, and the expiry date.

## Safe procedure (each phase needs its own owner approval)

### Phase 1 — pending zone (no effect on live DNS)

1. Cloudflare dashboard → Add a domain → `americawhat.com` → **Manually enter
   DNS records** (not "quick scan", which can import the rotating apex
   addresses as fixed records and mark records proxied) → Free plan. Or with
   an API token that has *Zone:Create*:
   `POST /zones {"name":"americawhat.com","account":{"id":"c8999b29b2123e2f9634248c58f43f14"},"type":"full","jump_start":false}`.
2. **Stop at the nameserver screen.** The zone stays "Pending nameserver
   update"; Hostinger remains authoritative, so nothing changes for visitors
   or email. Note the two assigned `*.ns.cloudflare.com` names. **Free-plan zones
   pending for more than 28 days are deleted automatically**, so add the zone
   at most about three weeks before the planned nameserver change (recreating
   it is harmless, but the assigned nameservers may then differ).
3. Enter every row of the table (and of the hPanel export) with proxy **off**.
4. Do **not** enable Email Routing (it replaces MX), "Email Security" DMARC
   management, or any proxy feature.

### Phase 2 — comparison (read-only)

```bash
node scripts/release/dns-compare.mjs --servers <assigned-ns-1>,<assigned-ns-2>
```

It queries the Cloudflare nameservers directly for every record and fails on
a missing or different value, on a Cloudflare proxy address, on an apex
without answers, if `boss` exists, or if a wildcard answers. If the assigned nameservers do not answer
for a still-pending zone (REFUSED or timeout — Cloudflare does not document
this case), compare the dashboard export (DNS → Records → Export, BIND
format) with `scripts/release/dns-records.json` instead, and run the tool
again right after the nameserver change. Run it without `--servers` to
re-check Hostinger. Both must print
`RESULT: all records match`. Also compare against the hPanel export by eye.

### Phase 3 — nameserver change (separate approval; still no website change)

At the registrar replace `hermes/artemis.dns-parking.com` with the two
Cloudflare nameservers. The site keeps running on Hostinger (same CDN
targets), email keeps going to Hostinger. Afterwards:
- `node scripts/release/dns-compare.mjs --servers <assigned-ns-1>,<assigned-ns-2>` again;
- send and receive a test message; its headers show `spf=pass` and `dkim=pass`;
- `curl -sI https://americawhat.com/` still shows `server: hcdn`.

**Reverting the nameservers** brings back the untouched Hostinger zone, so
the Hostinger DNS zone must not be edited or deleted during the migration.
.com delegation TTL is up to 48 h, so a reversal is not instant.

### Phase 4 — what this enables

Only after the zone is **active**: the Boss Access application (below), then
the cutover in [PRODUCTION-MIGRATION-PLAN.md](PRODUCTION-MIGRATION-PLAN.md),
where the Worker custom domains replace the apex and `www` rows.

## Hostinger rollback after cutover

The apex is a CDN alias, so a website rollback does not restore fixed
addresses: remove the Worker custom domains and recreate `@` as flattened
CNAME `americawhat.com.cdn.hstgr.net` and `www` as CNAME
`www.americawhat.com.cdn.hstgr.net`, both DNS-only.

## Boss Access dependency

A self-hosted Access application for `boss.americawhat.com` needs the zone in
this account (and the CLI login has no Access permission). Order: zone active
→ owner creates the application in the dashboard (team
`dndrnet.cloudflareaccess.com`, policy Allow, Include emails `hakan@dndr.net`
only, session ≤ 24 h) → copy the AUD →
`node scripts/release/set-production-config.mjs --app-db 3097933b-4feb-4e50-bb59-760fd06a640e --analytics-db 1012183d-96cd-4d7f-8e93-ca247ca43589 --access-aud <AUD>`
→ upload a Boss version → only then attach `boss.americawhat.com`. Until then
the production Boss has an empty AUD (503 for every request) and no route,
workers.dev or preview URL.
