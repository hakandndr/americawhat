# americawhat — Analytics

## Boss Analytics screen (production)

- **Live view:** `/analytics` always shows the newest records first and keeps
  its clean URL; Refresh reloads with the same range and filters. Filter changes
  stay live.
- **Fixed lists for paging:** First/Previous/Next/Last/Page links carry an upper
  ALL # (`snapshot`) so pages never shift while records arrive; such a list says
  "Fixed list up to ALL # N", how many newer records matched since, and offers
  Show latest. Back/Forward restore exactly the URL they left.
- **Columns** (one line per event, shared with IP activity,
  `workers/boss/src/pages/analytics-event.mjs`): ALL #, DAY # (time-ordered per
  Pacific-Time day), DATE / TIME (PT), IP ADDRESS, IP VISITS, SOURCE, EVENT,
  ACTOR, AGENT, COUNTRY · CITY, PAGE, REFERRER, DEVICE, BROWSER · OS, Details
  (every raw field). Narrow screens drop columns into Details, then use cards.
- **IP VISITS** = retained page views from that exact address, all dates and
  sources, **up to the same ALL # as the list shown** (rows and counts agree).
  Events, not people or sessions. IP addresses link to `/analytics/ip`
  (exact-address history, frozen at an upper ALL #, behind the same Access guard).
- Summary, daily chart (all filtered days; quiet days are zero bars; 30/7-day
  zoom is CSS only), breakdowns and CSV/NDJSON export use the same filters.
  The export audit records filter names, never values.

Earlier layout and sprint notes: [archive/sprints/BOSS-UX-ANALYTICS-SPRINT.md](archive/sprints/BOSS-UX-ANALYTICS-SPRINT.md).

Authoritative for the AmericaWhat analytics store, the Boss Analytics screen,
the legacy import, DNDR reconciliation and retention. Status labels used here:
**IMPLEMENTED**, **TESTED LOCALLY**, **STAGING**, **PRODUCTION**, **OWNER DECISION**.
Production since 2026-10-16: native collection on `americawhat.com`, S1 legacy
import applied (1,083 events); S2 waived by the owner, S1 is the last legacy import.

## 1. Former Hostinger collection (historical, verified 2026-10-14)

- `src/scripts/tracking.js` calls `/analytics/log_df.php` on every page view.
  That file exists **only on the server** (not in `main`; a reviewed copy is on
  the `staging/dndr-analytics` branch). It appends one JSON line per view to
  `public_html/analytics/aw_panel_log.txt` (address, PT wall time, country, city,
  crawler label, device, full user agent, referrer, path) and, since
  2026-10-03 21:04:44 UTC, relays a signed copy to the DNDR collector.
- Geolocation is looked up by sending each visitor address to `ip-api.com`
  over plain HTTP. This processor is not named on the Privacy page.
- The Studio panel (`/boss/`) reads the log file directly.
- DNDR `dndr-analytics-v2`, site `site_americawhat` (read-only aggregate query,
  2026-10-14): **1,031 imported** page views (2026-07-07 → 2026-10-03 07:34 UTC)
  and **29 native relay** page views (2026-10-03 → 2026-10-14 10:42 UTC). DNDR's
  own records add one `missing_page` line preserved in its ledger and an
  **unobserved interval of at most 13 h 30 min** (2026-10-03 07:34 → 21:04 UTC)
  between the snapshot it imported and the start of the relay.

## 2. Store (PRODUCTION)

One table, `visitor_events` (`migrations/analytics/0001_analytics_core.sql`),
holds legacy and native page views:

- `id` — **ALL #**: AUTOINCREMENT, never reused or renumbered; deletions leave gaps.
- `event_uid` — stable identity, unique: `panel_log:<first 32 hex of sha256(line)>.<n>`
  for legacy lines (the identity DNDR already uses), `aw:<uuid>` for native views.
- `origin` — `legacy` | `native`, set by the writer, never inferred later.
- `occurred_at` (UTC seconds), `la_day` (America/Los_Angeles day), `time_quality`.
- address, country/code, region, city, path, normalized page, referrer label and
  raw referrer, full user agent, legacy crawler label, device string, device
  class, browser, OS, agent family, `automation` (`human` | `automated`).
- `import_corpus_id`, `import_record_id` for legacy rows.

Native rows come from the web Worker (`workers/web/src/collector.mjs`): POST
only, Origin-checked, per-view UUID (a retried beacon is stored once), location
from Cloudflare's request metadata (no third-party lookup), at most 120 events
per address per 10 minutes.

## 3. Metrics (Boss → Analytics)

| Metric | Definition |
|---|---|
| Global # (ALL #) | `visitor_events.id` (AUTOINCREMENT): never reused or renumbered; deletions leave gaps |
| Day # (TODAY #) | position among **all** retained rows of the same PT day in time order (occurred_at, then id), shown with the day's total; filters never change it. Only an import of older events into an existing day can move later rows of that day |
| IP VISITS | retained page views with exactly that address, all time, all origins |
| Distinct IP addresses | distinct address strings in the view — **not people** (shared networks, changing addresses, privacy relays) |
| Human / Automated | from the crawler label (legacy) or the user-agent classification (native); a user agent can lie |
| All-time page views | retained rows + aggregates kept from deleted rows |

The screen has range chips (Today, 7 days, 30 days, All time), custom PT day
ranges, filters (source, class, device, exact IP, country, city/region, page or
page prefix `*`, referrer, browser), top pages / countries / referrers / agents,
the raw stream (newest first, keyset "Older →"), CSV and NDJSON exports, the
retention box and the import/coverage list. Owner-facing times are PT, 12-hour;
storage is UTC. LA day boundaries come from the IANA zone (23- and 25-hour DST
days are tested).

CSV cells are quoted, quotes doubled, NUL removed, and a cell starting with
`=`, `+`, `-`, `@`, tab or CR is prefixed with `'` (a lone `-` is kept). NDJSON
keeps exact values. Exports stream in keyset chunks and are audited.

## 4. Legacy import (PRODUCTION: S1 applied 2026-10-16)

Code: `workers/shared/legacy-import.mjs`; local tool
`scripts/analytics/legacy-import.mjs` (inventory / rehearse / daily); Boss page
Analytics → Legacy log import.

- **Identity:** `panel_log:<sha32>.<occurrence>` of the PHP-trimmed line, the
  same id DNDR assigns; an append-only log keeps every id stable, so a later,
  longer snapshot is a safe delta import.
- **One disposition per line:** `imported`, `already_present` (stored by an
  earlier corpus, or imported once and since deleted), `missing_page`,
  `malformed`, `invalid_time`, `before_retention_cutoff`. Nothing is invented:
  no region split from the stored city, no country code for legacy lines.
- **Time:** the log has PT wall time without offset. A repeated fall-back hour
  (next: 2026-11-01 01:00–01:59) has two instants: log order decides when it
  rules one out (`dst_ambiguous_ordered`), otherwise the earlier instant is used
  and flagged (`dst_ambiguous_first`). The skipped spring hour cannot be written
  by PHP and is `invalid_time`.
- **Idempotent and restartable:** the import is one ordered list of SQL
  statements (`importStatements`): the ledger row of each line is written first
  and decides the disposition in SQL; the event is inserted only if its ledger
  row says `imported`. Everything is `INSERT OR IGNORE` by identity, so a failed
  run is completed by running it again and a second run adds nothing (tested in
  Node, in workerd, and on the staging D1 with a synthetic file).
- **Two ways to run it, same statements:** Boss → Analytics → Legacy log import
  (small deltas), or `npm run analytics:legacy -- sql <log> --out private/<name>.sql`
  followed by `wrangler d1 execute <db> --remote --file private/<name>.sql` (the
  full log; no Worker CPU limit applies). The .sql file holds visitor data: keep
  it under `private/` (git-ignored) and delete it after the import. On
  2026-10-14 the first `d1 execute` attempt returned a transient authentication
  error (code 10000) and the retry succeeded.
- **D1 limits:** at most 100 bound parameters per statement; the presence checks
  are chunked and the test adapter enforces the limit.
- **Privacy guard:** lines older than an applied Delete Before Date cutoff, and
  lines once imported and since deleted, are never inserted again.
- **Reconciliation report:** every line accounted for; events equal the ledger;
  per-LA-day counts (`daily --compare <json>`) for comparison with DNDR or the old
  panel.
- The Boss import applies only after an inventory and the first 12 characters
  of the file's SHA-256 typed back. The page never shows addresses or agents.

No real log has been imported anywhere.

### Staging data (verified 2026-10-14)

The staging analytics database is **not** synthetic-only: besides one smoke
row and the 5 synthetic legacy rows from the import test, it holds **3 page
views from real browser visits** to the public staging hostname (2026-10-14,
about 18:44 UTC), with real IP addresses and user agents (2 distinct
addresses, all classified human). The staging reactions table holds 3 votes, 2
of them not from the smoke test (stored as counts; the abuse guard keeps only
HMACs). Nothing was deleted.

Corrective action (implemented, **staging verified** on version
`2f53980a-f08a-4d14-8362-20f6b1299fb7`): outside production, page views are
stored only when the request carries the staging test key (Worker secret
`STAGING_TEST_KEY`, used by the smoke test); every other beacon is answered 202
and stored nowhere. `/api/health` reports `visit_collection: test-only`.
Owner action: approve deleting the 3 real rows (and the 2 non-test votes) from
the staging databases, or keep them.

## 5. Native ingestion and DNDR (no double counting)

- After cutover, each page view reaches exactly one origin: Cloudflare (stored
  natively, optionally copied to DNDR with `producerEventId = event_uid`) or —
  for a client with stale DNS — Hostinger (PHP log + existing signed relay).
  Neither path can store the same view twice.
- AmericaWhat's own database imports the **whole** final log (including the
  relay era and any stale-DNS tail) under the legacy identity; DNDR is **not**
  re-imported. The only DNDR-side history work left is the 13 h 30 min gap,
  which DNDR's own importer can fill with `--native-start
  2026-10-03T21:04:44.968Z --producer prd_americawhat_relay` (a DNDR change,
  separate approval).
- Forwarding native rows: implemented (production-only binding
  `DNDR_COLLECTOR` → `dndr-collector#ProducerApi`, producer
  `prd_americawhat_native`, outbox + 15-minute recovery cron; ARCHITECTURE §5).
  **Live since 2ef6a57 (2026-10-16 20:52 UTC)**: DNDR registry rows applied
  (owner-approved), then the owner-approved release; the first controlled
  visit was read back once in both systems under the same `event_uid`.
  Rollback on DNDR's side: `enabled = 0` on `prd_americawhat_native`.
- Cutover gap (native rows stored before forwarding is live): DNDR stamps PAGE
  events on receipt, so these are not replayed through `recordPage`. They are
  an owner-approved DNDR history import keyed on `event_uid`, limited to
  native rows without a `sent` outbox entry. The Hostinger relay kept
  delivering stale-DNS visits to DNDR until 2026-10-16T07:27Z; those are
  different page views from the native rows, so neither side double counts.
- Reconciliation after cutover: per LA day, AmericaWhat native
  `visitor_events` = DNDR `site_americawhat` events from
  `prd_americawhat_native` + the gap import.

## 6. Retention (OWNER DECISION: 90-day target, manual only)

Güncel proje sahibi kararı (2026-10-14, D-24): tam tarihsel log ve mevcut oylar
korunarak taşınacak; final production snapshot cutover’a yakın sağlanacak.
Analytics silme yalnızca manuel işlem, 90 gün ise gizlilik metniyle tutarlı
uygulanması gereken hedeftir. Aşağıdaki A/B/C memo’su tarihsel seçeneklerdir;
importun tam yapılması yeniden açık karar değildir. Memo’daki “hemen silme”
önerisi otomatik işlem veya bu oturum için silme yetkisi değildir. DNDR tarihsel
olayları yeniden saymayacak; başka projeye yazım ayrı izin gerektirir.

Implemented (TESTED LOCALLY, workerd):

- Retention status on the Analytics screen and on Health: records older than
  90 days, oldest record and its age, last deletion. **Nothing is deleted
  automatically.**
- Delete analytics records before a PT day: exact preview (count, ALL # range,
  oldest/newest affected, kept records, oldest kept), export links for exactly
  those rows, typed date confirmation, and one D1 batch in which the audit row
  is inserted only if the live count still equals the preview; the aggregates
  and the deletion run only if that audit row exists. A stale preview deletes
  nothing; an operation id cannot be replayed.
- Before raw rows go, non-identifying aggregates are kept: per day × origin ×
  class page views, per month × page, per month × country. No address, agent,
  city or exact path is kept for deleted rows. All-time totals remain correct.
- `analytics_operator_log` is append-only (triggers) and holds no address or path.

### Assessment of the aggregates

Daily totals by origin and class carry no visitor attribute. Monthly page and
monthly country counts can, in principle, contain a cell of one (one view of a
rarely read page from one country in a month). Without the address, agent,
city, time of day or day, such a cell does not identify a person in practice,
but it is not mathematically anonymous. If the owner wants a stricter rule, the
monthly tables can drop cells below a threshold at deletion time — not
implemented, an **OWNER DECISION**.

### Copies that the Boss deletion does not reach

| Copy | Holds | Covered by Delete Before Date? |
|---|---|---|
| AmericaWhat `ANALYTICS_DB` | raw rows | **yes** (aggregates kept) |
| D1 Time Travel of that database | every past state, 7 days (Free) or 30 days (Paid) | **no** — deleted rows stay restorable for that window, then expire |
| Hostinger `aw_panel_log.txt` | full raw history since 2026-07-07 | no, until the file is removed at retirement |
| Owner's offline `public_html` archive | same file | no — owner decides how long to keep it |
| DNDR `dndr-analytics-v2` (`site_americawhat`) | 1,031 imported + relayed rows, address-level counters | no — DNDR's own policy (`detail-90d-durable-forever` in its registry; actual behaviour not verified) |
| CSV / NDJSON exports | whatever was exported | no — files on the owner's machine |
| Google Analytics | GA's own data | no — GA retention setting |

### Inconsistencies found before production (open ones are tracked in CURRENT-STATE)

1. **The public promise is already exceeded.** The Privacy page says visit logs
   are "kept for about 90 days, then deleted". The Hostinger log holds lines
   from 2026-07-07 (99 days old on 2026-10-14) and nothing deletes them.
2. **Copies are not covered by any deletion:** the Hostinger file, DNDR's
   imported and relayed copies (its registry policy reads
   `detail-90d-durable-forever`; actual behaviour not verified), the owner's
   offline backup, and any CSV/NDJSON export.
3. **Undisclosed processor:** `ip-api.com` receives every visitor address today
   (ends with the Cloudflare cutover).
4. **Manual-only deletion** means the 90-day figure is a target the owner keeps
   by running the tool; the page should say so honestly.
5. **Importing the full legacy log** into the new store will bring records
   older than 90 days into a new system. Options: import everything and run a
   Delete Before Date right after (aggregates kept), or import only the last 90
   days. **OWNER DECISION** before the real import.

### Decision memo: legacy data older than 90 days (OWNER DECISION)

Facts: the Hostinger log starts on 2026-07-07; on 2026-10-14 the oldest lines
are 99 days old and the file keeps growing until cutover. DNDR already holds a
raw copy (1,031 rows) and its own address-level counters. The owner wants the
historical statistics kept and raw IP / user-agent data limited to about 90 days.

| Option | What happens | Historical statistics | Raw data older than 90 days |
|---|---|---|---|
| **A. Import all, then Delete Before Date at once** (recommended) | Full import with the tested tools, then one Delete Before Date with cutoff = today − 90 days, in the same sitting | Kept: daily totals by origin and class, monthly pages and countries, durable ALL # | Gone from the AmericaWhat database; recoverable only through D1 Time Travel until it expires (7 or 30 days) |
| B. Import only the last 90 days | Older lines stay only in the Hostinger file and the archive | **Lost** in AmericaWhat (only DNDR keeps them) | Never enters the new system |
| C. Import all, keep all | Everything stays | Fully kept, including addresses | Kept indefinitely — contradicts the 90-day target; the Privacy page would have to say so |

Recommendation: **A**. It keeps every historical total, uses only tested code,
and leaves no raw row older than 90 days in AmericaWhat after the sitting
(apart from the Time Travel window, which should be stated in the decision).
Independently of the option:

- **DNDR copy:** decide on the DNDR side whether raw AmericaWhat rows older than
  90 days are deleted there too; otherwise the public statement must mention
  the network analytics copy and its own rule. AmericaWhat cannot delete them.
- **Hostinger file and archive:** after the final import is reconciled, keep
  the encrypted archive for a stated period (for example 30 days, for rollback)
  and then delete it; remove `aw_panel_log.txt` from the server at retirement.
- **Exports:** treat as temporary; delete after use.
- **Cadence:** manual deletion keeps the target only if it is run; a monthly
  Delete Before Date keeps raw data between 90 and about 120 days old. The page
  must not promise a strict 90-day maximum unless the owner runs it at least
  that often.

### Privacy page — proposed wording (not published)

> **Visit records.** When you view a page, our own analytics records the page,
> the time, your IP address, the approximate location your network provider
> reports, your browser's user agent and the referring page. We use this to
> count visits and to keep the site working and free of abuse. Detailed records
> are kept for about 90 days: the site owner removes older ones by hand, at
> least once a month, so a record can occasionally be up to about four months
> old. Afterwards only daily and monthly totals without any personal detail
> remain; backups that still contain removed records expire within 30 days.
> A copy of the same visit record may be held in the owner's private network
> analytics under the same limits. We do not build advertising profiles and we
> do not sell this data.
>
> **Reactions.** The WAT / LOL / SAME / DEAD buttons store anonymous counts. To
> stop repeated or automated voting we keep, for about two days, a one-way code
> derived from your IP address; it cannot be turned back into the address.

This wording must be checked against the final DNDR retention decision and the
real deletion schedule before it is published (a separate, owner-approved
change to `src/pages/privacy.astro`).
