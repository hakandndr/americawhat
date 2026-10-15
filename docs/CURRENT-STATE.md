# americawhat — Current State

## Son durum — staging yayında, rollback tamamlandı (2026-10-15)

Kullanıcının tüm staging rollout için sürekli yetkisiyle frozen RC
34d40c0f3c84c789fe22f462c9ef6affd06e268b iki Worker'da %100 aktif.
Web7e315208-ef9b-4b8b-ac10-48d7419ef9e2;
Boss7fa88813-9247-4f02-b784-67e1b92a65f2. Boss URL mevcut owner-only Access
arkasında açık, previews kapalı. Owner gerçek girişini doğruladı.
23 Web smoke, gerçek analytics D1 ve sandbox GitHub backend yayın testleri,
eski UUID→aynı yeni UUID rollback/re-promote PASS. HTTP form submit otomasyonu
yapılmadı; CPU ölçümü düşük örneklemdir. Secret değerleri raporlanmadı.
Production/DNS/Hostinger/başka proje dokunulmadı. Yeni geçerli durum ve
kanıtlar [STAGING-ROLLOUT.md](STAGING-ROLLOUT.md); aşağıdaki hazırlık notları
tarihseldir. Frozen manifest/paket yeniden yazılmadı, deployed SHA sabit.

## Son durum — deployment hazırlığı tamamlandı, Access owner doğrulaması esas (2026-10-15)

Access app932d247c-4d98-479e-a8c8-50da8a0550d1 / team/AUD / owner-only All
traffic dashboard doğrulaması kabul edilir. Mevcut OAuth API403 yalnız izin
sınırıdır; proje kapısı veya uygulama yokluğu değildir. Aynı GET tekrarlanmadı.
Yeni staging repo+branch allowlist'i yanlış hedefte hiçbir GitHub isteği yapmaz;
JWT null/array/primitive bölümleri de401 ile kapanır. 139 test ve18 local
workerd başarılı; public kaynak/OG125 ve production config korunur.

[STAGING-DEPLOYMENT.md](STAGING-DEPLOYMENT.md) geçerli kısa yürütme belgesidir:
owner-only offline secret hazırlığı; frozen kod+secret'ı tek unpublished
version'a upload; exact UUID ile ayrı activation; aynı UUID ile rollback/
re-promote; Access login, editorial ve gerçek CPU/D1 ölçümü. Secret put veya
dashboard Deploy kullanılmaz. Tüm config/secret adları/D1 ID'leri belgede.
Final source SHA ve frozen paket hash'leri reports/predeploy-release-manifest.json.
Owner PAT scope doğrulaması/korumalı secret dosyası ve sonraki açık upload/
deploy/URL test onayı kalır. API read izin genişletmesi zorunlu değildir.
Bu sprint uzak yazım/upload/deploy/URL açma/gerçek veri işlemi yapılmadı.

## Son durum — onaylı staging altyapı hazırlığı (2026-10-15)

Private/fork olmayan `hakandndr/americawhat-staging-content` onayla başlatıldı.
Yalnız dört JSON, eaef194 snapshot'ıyla blob/SHA256 aynı; main ve content-staging
**58cedb3e4b265ffec44d0394072b226fbd5285e9**. Actions kapalı, workflow yok;
dört başlangıç commit'inin author/committer'ı Hakan Dundar <hakan@dndr.net>.
Production main eaef194 aynı; uygulama production main'e merge edilmedi.

Mevcut Access app **932d247c-4d98-479e-a8c8-50da8a0550d1** sahibi tarafından
doğrulandı: dndrnet.cloudflareaccess.com, dndr-staging-owner-only, yalnız
hakan@dndr.net, bu Worker için All traffic. Yerel staging config gerçek AUD'yi
içerir; URL/previews kapalı, production config aynı. Doğrudan app/policy GET
403/1010 auth.forbidden; org GET403/10000 Authentication error. Wrangler OAuth
scope listesinde Access izinleri yok; eski boş listeden uygulama yokluğu
çıkarılmaz. API bağımsız policy doğrulaması eksik; uygulama yeniden oluşturulmadı.

PAT sahibi tarafından oluşturuldu (2026-11-14 bitiş); token/kapsamı alınmadı.
Uzak GITHUB_TOKEN/BOSS_CSRF_SECRET hâlâ yok; D1 binding'leri doğru. Cloudflare
hesap ayarı/deploy/URL açılışı/gerçek veri işlemi yapılmadı. Yeni config commit'i
ve artifact manifest'i `reports/infra-release-manifest.json`; önceki4ba890c RC
raporları tarihsel olarak korunur. OG125/arşiv ve depo dışı ikinci yedek doğrulandı.
Sonraki kapılar ve exact API izinleri STAGING-PREFLIGHT'ın en üstündedir.

## Son durum — staging RC hazırlığı (2026-10-15)

`tmp/security-boss` artık **`codex/staging-rc`** dalında; başlangıç kabul edilmiş
`73bc5cc08dd131235ba22e7f45ec215a68c18f5a` korunur. Güncel main
`eaef1940d66843a2062e59d59e0eb7753d9dac1c`, normal iki-parent yerel merge
`4a28f69aeef598fcfb926e4cc52e4897458b26e8` ile alındı. Published124 aynı;
pending134, seen11404, fetch-status güncel; dört Git blobu incoming ile aynı,
kayıp yok. Public kaynak data hariç onaylı `16b10a4` ile aynı.

Staging config/tekrarlanabilir build `0497c8d`: Boss origin workers.dev hedefine,
Git hedefi önerilen bağımsız sandbox depoya düzeltildi. AUD boş, URL/preview
kapalı; production bloğu aynı. `npm run build:rc`, yalnızca çıktıdaki Random
fallback ve RSS build tarihini sabitler; tarayıcı Random davranışı değişmez.
136 test, 18 local workerd, 162 sayfa, statik/SEO/DOM/CSS ve iki build hash
eşitliği başarılı; tam/dev hariç audit0. Son belge commit'i dahil tam HEAD ve
dosya hash envanteri Git dışı `reports/rc-release-manifest.json` içindedir.

Uzak GET doğrulaması: web hâlâ636936f, Boss URL kapalı, Access0/AUD boş/
Boss secrets yok. Team domain GET403; CPU planı sahibi kontrolü bekler.
**Yerel RC incelemeye hazır; Boss dağıtım kapıları henüz kapalı.** Depo/PAT/
Access/AUD/secrets/URL açma, deploy, sentetik uzak yazılar ve rollback provası
ayrı onay bekler. Push/uzak merge/deploy/gerçek veri değişikliği yapılmadı.
[Güncel RC kaydı ve kesin plan](STAGING-PREFLIGHT.md) geçerlidir; aşağıdaki
"merge yapılmadı" / eski sayım ve test kayıtları önceki sprintlere aittir.

## Son durum — Boss UX ve Analytics (2026-10-15)

Başlangıç `3bae019`, aynı `codex/security-boss` / `tmp/security-boss` worktree’si.
Beyaz metinli AA kırmızı butonlar `5cc3d13`; ülke/live filter `c199b46`;
doğrudan sayfalama `148838c`; history snapshot `389c615`; taşma koruması `399e823`;
bekleyen kriter koruması `71879c8`. 134 test, 18 sentetik local workerd kontrolü;
Germany `ger` 190 sonuç, filtreli
CSV/NDJSON aynı. 10.000 kayıt/200 sayfa tekrarsız/eksiksiz; schema migration yok.
Public src aynı, 162 sayfa/parity/static başarılı; tam/dev hariç audit0.

Live text 350ms, dropdown hemen, eski yanıt iptal/generation korumalı; Apply
ve Go JS’siz fallback. First/Previous/select/Next/Last p+snapshot URL’siyle
çalışır; filtre değişince sayfa1/yeni görünüm. Analytics script’i authenticated
same-origin; diğer sayfalarda script yasağı sürer. Raw event/retention/import/
oy tanımları değişmedi. Tam rapor [BOSS-UX-ANALYTICS-SPRINT.md](BOSS-UX-ANALYTICS-SPRINT.md).

Yalnızca yerel: push/merge/deploy/uzak ayar veya gerçek ziyaretçi okuması yok.
Önceki staging preflight yeniden yapılmadı; son bilinen `636936f` ve Access/
credential/content reconciliation kapıları tarihli önceki kayıttır. Yeni tam
SHA ve gerçek staging testi ayrı onay ister. Önceki bölümler tarihsel kayıttır.

## Önceki durum — Boss renk uyumu ve staging preflight (2026-10-14)

`codex/security-boss`, `D:\IT\AmericaWhat\americawhat\tmp\security-boss`;
başlangıç `3730297`, ayrı renk commit’i `0f3fe02`. Boss public paletteki
#0b1120/#111c34/#e23b4e/#ff5468 ile hizalandı; layout/işlev/public kaynak aynı.
117 test, 18 workerd kontrolü, 162 sayfa/parity/static ve audit 0 başarılı.

Canlı staging hâlâ `636936f`; web version `02c0da48-f3a2-47ad-99e0-8358b9244ac7`
API ile doğrulandı. Trending/reactions zaten var; Load More/category/archive/
menü-footer ve yeni araç zinciri henüz yok. Staging iki D1/29 DDL tanımı
uyumlu, yeni migration gerekmez. Boss URL/preview kapalı; Access uygulaması
0, AUD boş, GITHUB_TOKEN/BOSS_CSRF_SECRET yok. Team domain org GET’i 403;
gerçek domain ve CPU planı sahip kontrolü bekler.

Uzak main yine `b1312bf` (124 published/131 pending/11.373 seen-id);
uzlaştırma yapılmadı. Engineering adayı yerelde; config/credential/main
hazırlığı sonrası yeni tam SHA pinlenmeden deploy edilemez.
[STAGING-PREFLIGHT.md](STAGING-PREFLIGHT.md) exact dashboard/deploy/rollback
planıdır. Ayrı staging içerik deposu önerilir; PAT branch bazında scope’lanmaz.
Push/merge/deploy/uzak ayar veya gerçek veri değişikliği yapılmadı.
Sonraki bölümler önceki sprint kayıtlarıdır; güncel preflight için bu bölüm geçerli.

## Önceki durum — güvenlik ve Boss sprinti (2026-10-14)

Yalnızca yerel `codex/security-boss`, worktree
`D:\IT\AmericaWhat\americawhat\tmp\security-boss`; başlangıç onaylı `16b10a4`.
Güvenlik commit’i `d266964`: Astro 7.3.8 / sitemap 3.7.4 / Wrangler 4.151.0;
tam ve dev hariç npm audit **0**. Sonraki ayrı Boss entegrasyonu navy/kırmızı
altı bölümü, Published filtre/sayfalama ve salt okunur günlük Analytics’i içerir.
115/115 test, 18/18 sentetik Boss workerd kontrolü, 162 sayfa build/statik/
DOM-CSS eşdeğerliği başarılı. Public `src/` başlangıçla aynı; grafik test yok.

Uzak main `b1312bf`: published aynı 124, pending 131, seen-id 11.373;
yerel pending 130, seen-id 11.348. Uzlaştırma **yapılmadı**. Canlı staging
hâlâ `636936f`, production Hostinger; bu sprint dağıtılmadı. Boss staging
anonim GET’i 404; gerçek Access/plan/production kaynakları doğrulanmış değildir.
Yerel önizlemeler web `http://127.0.0.1:8817/`, Boss `http://127.0.0.1:18828/`.
Ayrıntı, kanıtlar ve onay sonrası komutlar: [INTEGRATION-SPRINT.md](INTEGRATION-SPRINT.md),
[SECURITY-REMEDIATION.md](SECURITY-REMEDIATION.md). Push/merge/deploy/gerçek veri
işlemi yapılmadı. Aşağıdaki önceki UI/audit notları tarihsel kayıttır; güncel
sürüm, açık sayısı ve Boss uygulama durumu için bu bölüm geçerlidir.

## Önceki yerel UI durumu — 2026-10-14 (sprint öncesi)

Son polish (`e7d2116` sonrası): proje sahibi mevcut kamusal yönü ve Trending
çalışmasını kabul etti. Trending incelenmedi/değiştirilmedi; ana sayfa ve istemci
betikleri Git karşılaştırmasında aynı. Footer yalnızca CSS ile sıkılaştırıldı;
hedefsiz dekoratif header tagline kaldırıldı. About footer’da korunur.
Kategori/arşiv/sıralama/Load More için yeni işlevsel kusur saptanmadı.

Güncel salt okunur audit: 21 paket / 45 advisory; dev hariç 19. İki yerel Worker
paketi ve altı tarayıcı JS paketinde üçüncü taraf npm girdisi yok; bu bulgu
build/dev riskini ortadan kaldırmaz. Paket/lockfile hash’leri değişmedi.
[Bağımlılık değerlendirmesi](DEPENDENCY-AUDIT.md) P0/P1/P2 planını içerir.
[Boss entegrasyon planı](BOSS-INTEGRATION-PLAN.md) yalnızca hazırlıktır;
`72689b4` ve `8da9839` mobil hunk’ı alınmadı. Backend bu dalda zaten mevcut.
106 test/build/statik ve mevcut SEO/kart kontrolleri yeniden geçti. Grafik
test ve Buttondown gönderimi yapılmadı. Tam legacy log/oy koruma, manuel
retention ve Hostinger mail’in kalması kesin kararlardır; final snapshot ve
üretim hazırlığı/onayları bekler.

**Geçerli kamusal görsel karar:** Cloudflare staging görünümü korunur. V1/V2/V3
kamusal yeniden tasarımları reddedilmiş tarihsel deneylerdir. Sadece Load More,
Random? → Categories → Archive menüsü ve sade footer onaylıdır.

- Başlangıç: `dev/cloudflare-native` / `4438907`. Canlı staging sağlık GET’i:
  `636936f`, 124 yayın, ziyaret toplama `test-only`. İki revizyonun uygulama
  kaynakları aynıdır; fark yalnızca belgelerdir. Başlangıç derlemesi CSS’si
  staging CSS’siyle birebir eşleşti.
- Uygulama: **yalnızca yerel**, `design/staging-refinement`, worktree
  `D:\IT\AmericaWhat\americawhat\tmp\staging-refinement`.
  İlk 12 + 12’şer statik parça, JS’siz devam bağlantısı, tam kategori/arşiv
  rotaları, özgün kartlarla uygulandı. 124 kart HTML’si staging ile aynı.
- Deneysel dal `design/editorial-casefiles` / `40274dc` ve
  `D:\IT\AmericaWhat\americawhat-redesign` korunur; worktree temiz bulundu.
  Oradaki yerel Boss tasarımı ayrı bir gelecek entegrasyonudur; staging Boss’u
  veya mevcut kamusal görsel onayı temsil etmez.
- Testler: 106/106; build 162 sayfa; statik güvenlik 0 hata; 3.652 iç bağlantı;
  eski SEO/URL’ler ve 124 kart korundu. Staging 40 sayfa karşılaştırmasında fark
  yok. Yerel workerd’da 124 haber, tek beacon ve ilk/eklenen kart oyları geçti.
- `npm audit`: 4 orta + 16 yüksek + 1 kritik mevcut araç zinciri bulgusu;
  yükseltme yapılmadı. Grafik/mobil taşma testi ve gerçek abonelik teslim
  kontrolü yapılmadı; manuel önizleme bekler.
- Hostinger production, GitHub remote, Cloudflare staging/production, DNS,
  Access ve uzak veriler bu çalışma tarafından değiştirilmedi. Ana checkout’taki
  iki untracked digest notu ve başlangıç branch uçları korundu.

Ayrıntı ve kapsam dışı öneriler: [DESIGN-REDESIGN.md](DESIGN-REDESIGN.md).
Çalıştırma: [OPERATIONS.md](OPERATIONS.md). Aşağıdaki altyapı envanteri önceki
2026-10-14 incelemesinin tarihsel kaydıdır; bu görevde sağlık/HTML/CSS/SEO GET’leri
ve yerel Git durumu dışında yeniden doğrulanmadı.

Snapshot. Update whenever something structural changes. Earlier snapshots are
in Git history; dated statements are historical once superseded.

**As of:** 2026-10-14

Status words: **Implemented** (code exists) · **Tested locally** (automated
tests and/or local workerd) · **Staging verified** (checked on the deployed
AmericaWhat staging resources) · **Production verified** · **Blocked** ·
**Awaiting owner approval**.

---

## Production (unchanged by the migration work)

- Hostinger web hosting; FTP deploy from `main`; PHP endpoints
  `/analytics/vote.php`, `get_votes.php`, server-only `log_df.php`; PHP Studio
  panel at `/boss/` (GitHub Contents API, password login).
- DNS at Hostinger (`dns-parking.com`); email on Hostinger (MX/SPF/DKIM/DMARC) —
  email stays there by owner decision.
- `origin/main` at `302549b` (fetch commit). **Content (verified on `main`,
  2026-10-14):** 124 published (highest id `aw-0135`), 130 pending (none
  drafted), 14 RSS sources, fetch three times a day, recent fetch runs green.
  Last panel approval and deploy: 2026-10-01.
- **Reactions (verified via the live read endpoint):** 13 votes on 9 items.
- **Visitor history:** Hostinger log since 2026-07-07; DNDR holds 1,031
  imported + 29 relayed rows for `site_americawhat` (read-only aggregate query);
  see `ANALYTICS.md` §1.

### Category distribution (published, 124)

| category | items |
|---|---|
| florida-man | 42 |
| hoa-housing | 26 |
| crime-weird | 25 |
| bureaucracy | 11 |
| only-in-america | 10 |
| fine-print | 5 |
| food-crime | 5 |

`city` present on 62 of 124, `state` on 73.

## Cloudflare-native replacement — branch `dev/cloudflare-native`

Deployed source revision: **`636936f`** (later commits on the branch change
documentation only). `/api/health` on staging reports `"release":"636936f"`.

| Part | Status | Evidence |
|---|---|---|
| Static site on Workers Static Assets | **Staging verified** | `americawhat-web-staging` version `02c0da48-f3a2-47ad-99e0-8358b9244ac7`; smoke 23/23 |
| URL/SEO parity with production | **Staging verified** (build vs live) | `npm run parity:live`: 131/131 sitemap URLs, 40 sampled pages identical, `/about` → 301 |
| Static upload excludes PHP/config/logs/secrets | **Staging verified** | `verify:static` 0 failures; 9 forbidden paths answer 404 |
| Reactions API (atomic, guarded, POST-only, chunked reads) | **Staging verified** | 124-id read 200 (was 500 before the fix); repeat vote counted once; 40 parallel votes = 40 (local workerd) |
| Page-view collector, staging gate | **Staging verified** | anonymous beacon → 202, nothing stored; keyed smoke beacon stored once; no new real rows after the gate |
| DNDR forwarding | **Implemented, tested locally**; **Blocked** (needs a DNDR producer, DNDR-side approval) | mock binding tests |
| Legacy log importer (SQL statements, Boss and offline .sql) | **Tested locally**; offline path **staging verified** with a synthetic file (applied twice, second run added nothing) | no real log imported |
| Reaction snapshot importer | **Tested locally** (unit + workerd preview) | no real votes imported |
| Boss Worker | **Tested locally** (`npm run test:boss-preview` 18/18 in workerd); uploaded to staging as version `85119d25-bc70-4871-a5f2-f9dcb3dbf896` with **no route** (unreachable); Access-protected staging **Awaiting owner approval** (CLOUDFLARE-MIGRATION.md §3a) | |
| Boss auth, CSRF, atomic publishing, URL protection, analytics, retention, audit | **Tested locally** | `npm test` 100/100 |
| Production Workers, D1, Access, custom domains | **Awaiting owner approval** — none created | |
| CI (`ci.yml`, no deploy, no secrets) | green on `025e01c`; latest run: see the final report | |

### Staging data (verified 2026-10-14)

`americawhat-analytics-staging` holds 3 page views from **real** browser visits
(real IPs and user agents, before the gate), 4 smoke rows and 5 synthetic
legacy rows; `americawhat-app-staging` holds 3 votes (2 not from tests).
Nothing was deleted — **Awaiting owner approval** to delete or keep.

## Known gaps / backlog

1. **Production migration approvals** — the ordered list is in
   `CLOUDFLARE-MIGRATION.md` §7. Nothing beyond staging has been done.
1a. **Workers plan unknown** — on the Free plan (10 ms CPU) the Weekly review
   page may hit the CPU limit (measured ~11 ms warm, ~31 ms cold in Node).
2. **Hostinger inventory and backup** — not done yet (owner action,
   `CLOUDFLARE-MIGRATION.md` §1), including the pre-merge checks (server
   `log_df.php` reads POST; `ftp-diff` shows no PHP/`.htaccess` change).
3. **Privacy promise already exceeded** — the page says ~90 days; the log is
   older and nothing deletes it (`ANALYTICS.md` §6). Owner decision needed.
4. **Original source URLs** — 108 of 124 published items and almost all pending
   candidates carry Google News links instead of the outlet's article URL.
   Boss now requires an original URL for new `REAL` stories; backfilling the
   published ones is a separate editorial task.
5. **DNDR side** — the 13 h 30 min coverage gap of 2026-10-03 and a native
   producer for AmericaWhat need DNDR-side approval.
6. **Fetch cadence** — recommendation (daily) in `EDITORIAL-GUIDE.md` §10; not changed.
7. **Foreign noise** — geography flags now mark it in review; a domain
   blocklist in `filters.json` would cut it at fetch time.
8. **Category imbalance** — `fine-print` and `food-crime` need dedicated sources.
9. **Published items missing `city` (62 of 124 lack it) or `state` (51 lack it)** — cosmetic, unchanged.
10. **Contact form** — posts to Formspree; delivery not re-verified.

## Repository

- Local `main` points at `origin/main` (`302549b`); `origin/main` is merged into
  `dev/cloudflare-native` (merge `e36b707`), never the reverse. Recovery bundle
  and backup refs in `.git/aw-backups/20261014-sprint/`,
  `refs/aw-backup/pre-sprint/*` and `refs/aw-backup/pre-verify/dev` (`025e01c`).
- Local branch `docs/neutral-tooling-note` (2 commits, owner-authored) is merged
  into `dev/cloudflare-native`; the branch itself is kept.
- Remote branch `staging/dndr-analytics` untouched.
- Untracked `digest-2026-08-14.md` and `digest-2026-09-18.md` at the root are
  left as they were (owner's notes; copies in the recovery folder).
- Local git identity: `Hakan Dundar <hakan@dndr.net>`; hooks enabled with
  `core.hooksPath=.githooks`.
