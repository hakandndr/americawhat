# americawhat — Decisions

Each entry: decision, reason, rejected alternatives. Owner decisions are marked.

## D-01 Cloudflare Workers Static Assets + separate Worker APIs (owner-accepted)
Same platform pattern as the owner's other sites; atomic versions and rollback.
Rejected: Pages + Functions (a second paradigm in the account, no gain);
moving editorial content into D1 (Git already works as the publication record).

## D-02 Git stays the publication source of truth (owner decision)
Boss writes `published.json` and `pending.json` through the Git Data API as one
commit per action. Rejected: the Contents API used by the PHP panel (one commit
per file, so an approval could be half-applied).

## D-03 Boss on `boss.americawhat.com` only (owner decision)
Own hostname, own Access application, own Worker; the GitHub token never sits in
the public Worker. Rejected: a `/boss/*` route on the public hostname.

## D-04 Access plus Worker-side JWT verification, fail closed
Defence in depth as in OC-CA. A loopback-only identity seam exists for the local
preview and is ignored unless `ENVIRONMENT=local` (tested).

## D-05 Owner identity for commits (owner decision)
`Hakan Dundar <hakan@dndr.net>` for local commits (repository git config) and as
the author/committer of Boss commits. A fine-grained PAT is used rather than a
GitHub App, whose bot account would appear among the contributors.

## D-06 Host-neutral endpoints during the migration
The pages keep calling `/analytics/get_votes.php`, `vote.php` and `log_df.php`;
the Worker implements the same URLs, so one build serves both hosts. The beacon
moved from GET to POST (no state-changing GET); the PHP logger already reads POST.
Rejected: two builds with a host flag (two artifacts to verify).

## D-07 Two AmericaWhat-owned D1 databases
`APP_DB` (reactions, imports, guards, decisions, audit) and `ANALYTICS_DB`
(visitor history). Different privacy and retention rules, different access.
Rejected: KV for counters (eventual consistency loses increments); Durable
Objects (no need at this traffic).

## D-08 Reactions: atomic guarded increments, import only adds
One D1 batch per vote (rate bucket, daily guard, conditional UPSERT). Imports of
Hostinger snapshots are baseline then deltas that only add and refuse decreases,
so votes cast on Cloudflare during DNS propagation are never overwritten.
Abuse keys are HMACs of the address and expire after 48 hours; this is
housekeeping of transient counters, not analytics deletion.

## D-09 Analytics: one table, legacy imported with the DNDR identity
Durable ALL #, TODAY #, IP VISITS as in TürkiyeCennet. Legacy lines are imported
from the Hostinger file with `panel_log:<sha>.<n>`, so AmericaWhat and DNDR can
be reconciled line by line and a longer snapshot is a safe delta. Rejected:
reading DNDR from Boss (couples the projects); re-importing into DNDR (it already
holds the history).

## D-10 Retention: 90-day target, manual only (owner decision)
Delete Before Date with exact preview, export, typed date, stale-preview guard
and audit; aggregates kept so all-time totals stay meaningful. No schedule.
Imports never bring deleted raw rows back.

## D-11 Trailing-slash redirects stay 301
Static Assets answers 307; the Worker converts its own same-origin slash
redirect to 301 to keep today's behaviour. Costs one Worker invocation per
request (acceptable at this traffic).

## D-12 Existing URLs are protected by a shared slug function
`assignSlugs` (site and Boss) reproduces every current URL (tested against all
124) and honours a pinned `slug`; Boss pins on retitle, on colliding titles and
on deletions. Fixes a latent bug where a new story could move an old URL.

## D-13 Editorial signals are deterministic and advisory
Clustering, published matching, geography and hard-reject flags rank and
annotate; they never approve, reject or delete. No language model runs in the
production backend; drafting stays an external, owner-supervised step.

## D-14 Google News links are not decoded in code
All 119 unresolved pending links use the online-only article format; decoding it
needs an undocumented Google endpoint. Instead Boss requires an original article
URL for a `REAL` story (explicit override per item) and links to a search.

## D-15 Fetch schedule unchanged for now
Three runs a day stay until the owner decides (`EDITORIAL-GUIDE.md` §9 has the
recommendation). The fetch job now retries from the new head instead of
rebasing over a Boss commit.

## D-16 Documentation set
`RELEASE-RUNBOOK.md` and `PROCESS.md` were not created: the release procedure
lives in `CLOUDFLARE-MIGRATION.md`, the editorial process in
`EDITORIAL-GUIDE.md`, the engineering process in `OPERATIONS.md`.

## D-17 Staging never stores real visitors
Outside production, page views are stored only with the staging test key.
Reason: the public staging hostname collected real IPs and user agents on
2026-10-14. Rejected: Access in front of the public staging site (needs the
owner's Zero Trust change; the site itself must stay testable without login).

## D-18 Legacy import runs as idempotent SQL
One statement list serves Boss and an offline `.sql` file for
`wrangler d1 execute`. Reasons: Worker CPU limits on a full log, D1's
parameter limit, and identical behaviour on both paths (tested byte for byte).

## D-19 Development branch absorbs main by merge
`origin/main` is merged into `dev/cloudflare-native` (the branch never touches
`src/data`), never rebased; the branch reaches `main` only through a reviewed
pull request after the pre-merge checks.

## D-20 Staging görünümü korunur (proje sahibi kararı, 2026-10-14)

Kamusal görsel temel dağıtılmış Cloudflare staging’dir (sağlık: `636936f`).
V1/V2/V3 kamusal tasarımları reddedilmiş tarihsel deneylerdir; yeni tema,
font, kart veya haber detay düzeni onaylanmamıştır. Onaylı kapsam yalnızca
12’şer Load More, Random? → Categories → Archive ve sade footer’dır.
Dar ekranda menünün sarılması ve yeni kontrollerin yerleşimi gerekli sınırlı
farklardır; diğer marka/kart/hero kuralları korunur.

## D-21 Seçici statik işlev uyarlaması, yerel uygulama

`design/staging-refinement`, `dev/cloudflare-native` / `4438907` temellidir.
V3’ten statik parça/olay/geçmiş mantığı ve Pagination alındı; deneysel genel
UI/Boss kaynağı birleştirilmedi. Tüm kategoriye gerçek bağlantılar kullanılır;
böylece henüz yüklenmeyen haberler filtre dışında kalmaz. Parçalar JS’siz tam
sayfadır, noindex taşır ve sitemap’e eklenmez; kategori/arşiv sayfaları indekslenir.

Tüm çalışma yereldir; push/merge/deploy onayı yoktur. Deneysel dal ve Boss
iyileştirmeleri korunur. Ayrıntı/testler: DESIGN-REDESIGN.md. Yeni öneriler
(bağımlılık güvenlik bakımı, gerçek cihaz kontrolü, ileride ayrı Boss entegrasyonu)
onaylı UI kapsamından ayrıdır.

## Open questions (owner)

1. Legacy data older than 90 days: option A, B or C of the ANALYTICS.md §6 memo (A recommended).
2. Monthly page/country aggregates: keep all cells, or drop cells below a threshold.
3. Weekly vs twice-weekly review; reduce fetches to once a day.
4. DNDR: approve the gap import and a native producer for AmericaWhat.
5. "Verified" commits: is the owner identity enough, or should local commits be
   signed (SSH signing) for GitHub's Verified badge?
6. Workers plan (Free or Paid) — affects the Boss review page's CPU budget.
7. The 3 real visitor rows and 2 non-test votes in staging: delete or keep.
