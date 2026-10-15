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

## D-22 Kamusal son polish ve kabul edilen Trending (2026-10-14)

Proje sahibi mevcut kamusal yönü ve reaksiyonla görünen Trending’i kabul etti.
Trending değişmez. Footer merkezde, yalnızca daha kompakt/ikincil newsletter ile
kalır. Header’daki hedefsiz tagline kaldırılır; About footer’da korunur. Yeni
kategori/arşiv işlevi veya görsel tasarım değişikliği gerekmedi.

## D-23 Güvenlik audit’i ve Boss hazırlığı uygulama izni değildir

Güncel 21 paket / 45 advisory; dev hariç 19. Audit’in paket etiketleri gerçek
runtime kapsamından ayrılır; ayrıntı DEPENDENCY-AUDIT.md’dedir. Bu aşamada paket/
lockfile değişmez. Ayrı onaylı güvenlik bakımı merge öncesi önceliklidir.
Boss için BOSS-INTEGRATION-PLAN.md’deki seçici dosya/test stratejisi önerilir;
entegrasyon, Access veya D1 işlemi bu oturumda uygulanmaz.

## D-24 Legacy geçmiş ve manuel retention kararı kesinleştirildi

Tam aw_panel_log.txt geçmişi ve aw_votes.json sayaçları korunur; son production
snapshot’ları cutover’a yakın sağlanır. Silme yalnızca manuel operatör işlemidir,
otomatik analytics silme yoktur. 90 gün hedefi gerçek manuel uygulama ve gizlilik
metniyle tutarlı olmalıdır. DNDR’ye tarihsel olaylar tekrar aktarılıp çift sayılmaz.
Hostinger web/PHP ileride emekli olur; EMAIL hizmeti kalır. Eski legacy import
seçenekleri tarihsel değerlendirmedir; kararı yeniden sormak gerekmez.

## D-25 Onaylı güvenlik yükseltmesi, public dondurma korunarak

2026-10-14 sprint izniyle `16b10a4` tabanından ayrı `codex/security-boss`
oluşturuldu. `d266964` Astro 7.3.8/sitemap 3.7.4/Wrangler 4.151.0 yükseltmesidir;
force/overrides yok, audit 0. Public kaynak aynı; compiler whitespace farkı
DOM/CSS sözleşmesi ve derlenmiş istemci testiyle doğrulanır. Renkleri korumak
için CSS minification kapalıdır. D-23 önceki salt okunur aşamaya aittir.

## D-26 Seçici Boss yerel entegrasyonu ve uzlaştırma sınırı

Planın dokuz Boss/test/preview dosyası seçildi; reddedilmiş public deneyler
alınmadı. Ek Published navigation testleri ve yalnızca kendi sentetik state’ini
temizleyen preview koruması vardır. Auth/CSRF/atomik yayınlama/import/manuel
retention ve Hostinger mail kararı korunur. 115 test, 18 sentetik workerd kontrolü
başarılıdır. Gerçek staging Access/CPU/credential testleri ayrı onaylı sonraki adımdır.
Yeni uzak main içerikleri için sıradan merge planı hazırlanır; bu sprintte
merge/push/deploy veya gerçek veri işlemi yapılmaz. Ayrıntı INTEGRATION-SPRINT.md.

## D-27 Boss renk uyumu, public kaynağı değiştirmeden

Sahibi mevcut layout’u beğendi; yalnızca renk uyumu istedi. `0f3fe02` public
night/card/ink/dim/red/red-hot/line değerlerini ayrı Boss CSS token’larına
eşler. İnce ayraçlar aynı; küçük metin ve form/focus sınırlarında erişilebilir
public ton seçimi, kırmızı butonda kontrast için siyah metin istisnası vardır.
Layout/typography/spacing/backend aynı; 117 test/18 workerd. Ayrıntı BOSS-THEME.md.

## D-28 Staging preflight dağıtım izni değildir; Git credential izolasyonu

Web staging `636936f` ve iki D1 şeması gerçek salt okunur kanıtla doğrulandı;
yeni migration gerekmiyor. Boss Access uygulaması yok, AUD/secret eksik,
URL kapalı kalır. Content merge/config tamamlandıktan sonra tam SHA pinlenerek
ayrı onayla staging rollout/test/rollback provası yapılır. Fine-grained PAT’in
branch scope’u yoktur; ayrı staging içerik reposu önerisi veya production
ref’lerine etkili server-side engel sahibi onayı bekler. Uzak kaynak/kimlik/
workflow/tarihçe bu sprintte değiştirilmez. STAGING-PREFLIGHT.md geçerli plandır.

## D-29 Filled Boss aksiyonlarında beyaz metin

Sahibi siyah metni reddetti; D-27’nin yalnızca bu istisnası yerine
#d9364a normal, #cf3044 hover, #c82d41 active ve #fff metin kullanılır.
Kontrast 4,59/5,05/5,37:1; public palet ve buton ölçüleri korunur.

## D-30 Ortak Analytics country contains ve progressive enhancement

Country name LIKE contains/case-insensitive, stored country_code exact;
bind/literal escaping korunur. Ortak WHERE summary/table/day/top/export’u
etkiler; günlük chart varsayılanı artık tüm filtreli günlerdir. IP/TODAY/ALL
ve manuel retention/import tanımları değişmez. Text350ms, select hemen,
generation/AbortController/history destekli küçük authenticated same-origin
script yalnızca Analytics’te çalışır; JS’siz GET fallback kalır. Global
retention/log sayıları açıkça global etiketlenir. Schema/dependency yok.

## D-31 ID sınırlarıyla doğrudan Analytics sayfası

First/Previous/select/Next/Last; p+snapshot URL’si. ID-only window/group
metadata taraması ve bounded primary-key hydration kullanılır; OFFSET,
kalıcı table/cache/migration yok. Kriter değişimi yeni snapshot/sayfa1 açar;
ilk history kaydı dahil sabit üst ID append kaymasını önler. 10.000 kayıt/
200 sayfa test edildi. Metadata taraması/substring maliyeti doğrusal olabilir;
gerçek staging CPU/rows_read ayrıca ölçülür. Snapshot MVCC kopyası değildir,
manuel silme sonrası yenileme gerekir. Ayrıntı BOSS-UX-ANALYTICS-SPRINT.md.

## D-32 Yerel RC merge'i ve kapalı staging hazırlığı (2026-10-15)

Yeni sprint izniyle kabul dalı73bc5cc'den codex/staging-rc oluşturuldu;
eaef194 main'i sıradan merge4a28f69 ile, kayıp/çakışma olmadan alındı.
Bu izin uzak main/push/deploy izni değildir. Staging origin workers.dev,
Git hedefi önerilen bağımsız private sandbox; repo/token henüz oluşturulmaz.
AUD boş/URL kapalı kalır; gerçek Access/team/secret ve repo kapsamı sağlandıktan
sonra ayrı onayla yeni tam SHA pinlenir. Production config ve tarihçe aynı.

## D-33 RC artifact'larının sabit girdileri

Public kaynak değişmez. build:rc yalnız üretilmiş statik Random fallback'ini
content/path hash'iyle, RSS build tarihini Git commit zamanı ile sabitler;
JS Random davranışı aynı. Onaylı125 OG PNG ayrı değişmez build girdisidir;
approved-og.json dosya seti/hash ve published blob koruması zorunludur.
Mevcut renderer farklı metin pikselleri ürettiği için yeni PNG'ler reddedildi;
orijinaller geri yüklendi ve rc-approved-og.zip olarak hash'lenip korundu.
Reproduction kaynak+lock+onaylı OG arşivini gerektirir. Yeni published/OG,
yeni renderer ve herhangi artifact farkı ayrı review ister. Tarihsel gen-og
reçetesi bu RC'ye doğrudan uygulanmaz. Ayrıntılar STAGING-PREFLIGHT/OPERATIONS.

## Open questions (owner, previous decisions unchanged)

1. Legacy geçmişin korunması karara bağlandı (D-24); final log/oy snapshot’ları, reconciliation ve manuel retention uygulama zamanı cutover hazırlığında tamamlanmalı.
2. Monthly page/country aggregates: keep all cells, or drop cells below a threshold.
3. Weekly vs twice-weekly review; reduce fetches to once a day.
4. DNDR: approve the gap import and a native producer for AmericaWhat.
5. "Verified" commits: is the owner identity enough, or should local commits be
   signed (SSH signing) for GitHub's Verified badge?
6. Workers plan (Free or Paid) — affects the Boss review page's CPU budget.
7. The 3 real visitor rows and 2 non-test votes in staging: delete or keep.
