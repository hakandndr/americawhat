# AmericaWhat — Güvenlik, Boss entegrasyonu ve release değerlendirmesi

2026-10-14, America/Los_Angeles. **Sonuç yalnızca yereldir.** Push, merge,
deploy, DNS/Access/D1/Hostinger değişikliği, gerçek import/export/silme veya
yayın yapılmadı. DNDR ve diğer projeler değiştirilmedi. Grafik otomasyonu yok.

## Git durumu ve uygulama sınırı

| Konum/dal | Başlangıç ve son durum |
|---|---|
| Onaylı `tmp/staging-refinement`, `design/staging-refinement` | `16b10a4ae5532bedb139aeab7fe36bccbb9bc759`, temiz ve aynı |
| Yeni `tmp/security-boss`, `codex/security-boss` | `16b10a4` tabanından; güvenlik `d266964f81e5302d9697dca637a108876870f015`, ardından ayrı Boss/test/belge commit’i; kesin uç `git rev-parse codex/security-boss` |
| Ana checkout `dev/cloudflare-native` | `4438907c26ac00180571a76a4bea7edac6f02c72`, aynı; iki untracked digest notu korundu |
| Deneysel `design/editorial-casefiles` | `40274dc979c4d57966bf7754e782282c256d9ebf`, aynı |
| Yerel `main` | `302549bbc6c5e43956f0f9b302f6ae4694e59b2f`, aynı |
| Salt okunur getirilen `origin/main` | `b1312bfff52279c9a74058e51fb3e3a4f15aacb5`; son `ls-remote` aynı ucu gösterdi |

Yeni worktree: `D:\IT\AmericaWhat\americawhat\tmp\security-boss`.
İki yerel commit’in author/committer kimliği `Hakan Dundar <hakan@dndr.net>`;
co-author/AI atfı eklenmedi, tarihçe yeniden yazılmadı.

## A — Güvenlik sonucu

Astro **4.16.19 → 7.3.8**, sitemap **3.1.6 → 3.7.4**, Wrangler
**4.147.0 → 4.151.0** exact sürümleri. Vite 8.3.4 tekilleştirildi;
http-cache-semantics 4.3.0, Sharp 0.35.5, Wrangler esbuild 0.28.2.
Node `>=22.12.0 <23`, çalıştırılan Node 22.23.2. Temiz `npm ci` başarılı.
`audit fix --force`, override veya doğrudan yeni Vite/esbuild bağımlılığı yok.
Astro 5/6/7 migration koşulları değerlendirildi.

En son tam audit ve `--omit=dev` audit’i **0 advisory / çıkış 0**.
Bu bir tarihli bağımlılık taramasıdır, tüm uygulama için güvenlik garantisi
değildir. Wrangler’ın resmi zinciri Miniflare `5.20261012.0-beta` içerir;
kararlı Wrangler dışına elle geçilmedi. Ayrıntı ve kaynaklar
[SECURITY-REMEDIATION.md](SECURITY-REMEDIATION.md).

## B — Boss seçimi ve korunan davranış

`72689b4` ve `8da9839` kaynaklı planın dokuz dosyası seçildi:
`html.mjs`, `pages/analytics.mjs`, `pages/misc.mjs`, `pages/review.mjs`,
`pages/published.mjs`, `index.mjs`, `analytics-db.mjs` (Boss kaynak dizini),
`tests/boss-analytics-layout.test.mjs`, `scripts/dev/boss-preview.mjs`.
Toplu merge yapılmadı; deneysel public kaynak/belge/ignore değişiklikleri alınmadı.

Weekly Review, Published, Analytics, Reactions, Audit ve Health navy/kırmızı
tasarıma geçti. Published q+cat+p birlikte çalışır, 40’lık sayfalanır;
Analytics filtreleriyle günlük SELECT ve tablo/özet düzeni bağlandı.
≤760 px `.sticky-submit` statik düzeltmesi dahil. Şema/yazma/silme mantığı
eklenmedi. `daily()` en çok 60 gün **döndürür**; sorgu tarama maliyetini
60 günle sınırlamaz.

Ek `tests/boss-published-navigation.test.mjs`: gerçek router, imzalı JWT,
SQLite D1 ve fake GitHub ile 97 sentetik haberin 40/40/17 sayfaları, arama/
kategori kombinasyonları, geçersiz/boş sayfalar, pinned/collision URL’leri,
HTML escaping ve mobil kural sınanır. Preview script’i kendi gerçek worktree
kökünü ve state yolunu doğrular; başka projeye/symlink dışına recursive temizlik
yapmaz. `BOSS_PREVIEW_PORT=18828` desteği alınmıştır.

`auth.mjs`, `csrf.mjs`, `github.mjs`, `editorial.mjs`, `workers/shared`,
migrations, `.github`, Worker konfigürasyonları ve public `src/` değişmedi.
Worker tarafı Access JWT, tek izinli `hakan@dndr.net`, CSRF, tek atomik Git
commit’i, slug/pinned URL, legacy/reaction import ve manuel silme korumaları
korunur. Yerel kimlik anahtarları yalnızca local/loopback bağlamında geçerlidir.

## Çalıştırılan son kontroller

| Kontrol | Gerçek sonuç |
|---|---|
| `npm test` | **115/115** (önceki 106 + 4 Analytics + 5 Published) |
| `BOSS_PREVIEW_PORT=18828 npm run test:boss-preview` (PowerShell env ile) | **18/18** gerçek local workerd kontrolü |
| Boss kapsamı | Altı bölüm; yetkisiz/sahte JWT, yabancı Origin; reject/approve, tek commit, tekrar import, sentetik analytics/export, typed-date retention/aggregate koruması, reaction snapshot ve audit |
| `npm run build` | **162 sayfa** |
| `npm run verify:static` | 309 dosya; 300 upload edilebilir, 9 dışlanır; **0 hata** |
| `verify:refinement` | 124 haber, 11 statik parça, 3.652 iç bağlantı; SEO/RSS/sitemap ve kart sözleşmesi başarılı |
| `verify:public-parity -- --baseline reports/approved-dist --ref 16b10a4` | 162 body DOM ve CSS eşdeğer; public kaynak aynı |
| `test:web-client -- http://127.0.0.1:8817` | Derlenmiş ES modülleri: ilk 12 + 10 parça GET’iyle 124 benzersiz haber; ilk/eklenen oylar, ana/detay sayfada birer beacon; uzak istek yok |
| Web/Boss `deploy --dry-run --metafile` | Başarılı; **upload yok**; web 8, Boss 20 girdi, üçüncü taraf npm runtime girdisi yok |
| Canlı production read-only SEO karşılaştırması | 40 sayfa metadata aynı; eksik eski URL yok; yerel 151/canlı 131 sitemap URL’si, yalnızca 20 beklenen kategori/arşiv ilavesi; `/about` 301 |
| Son tam/dev hariç npm audit | **0/0** |
| Manuel inceleme önizlemesi HTTP GET | Boss loopback 200, local veri bandı mevcut; görsel inceleme yapılmadı |

Ham çıktılar Git dışı `reports/` altındadır: `tests-phase-b.tap`,
`boss-phase-b.log`, `audit-final.json`, `audit-final-prod.json`,
`production-parity.json`, `content-reconciliation.json`, `final-web`, `final-boss`.
Workerd ve gerçek derlenmiş web istemci testi Phase A’da geçti; Boss entegrasyonu
public istemciyi değiştirmedi. Build/statik/public parity ve Boss testleri
entegrasyon sonrasında da geçti. Belgeler kod testlerinin yerine geçmez.

Public `git diff 16b10a4 -- src` boş. Renkler/fontlar/hero/kartlar/detay/footer/
Trending kaynakları aynıdır. Compiler HTML whitespace’i değiştirdiği için ham
byte eşitliği iddiası yok; DOM sözleşmesi ve aynı parser ile CSS eşdeğerliği
kullanılır. Derlenmiş `:root` token değerleri kaynak CSS ile de aynı bulundu.
CSS minification kapalı: sayısal renkler korunur, aktarım boyutu artar.
Grafik, gerçek cihaz, ekran okuyucu veya gerçek abonelik teslim testi yapılmadı;
proje sahibi yerel önizlemeleri inceleyebilir.

## C — İçerik uzlaştırma hazırlığı; uygulanmadı

Ortak ata `302549bbc6c5e43956f0f9b302f6ae4694e59b2f`. Gelen `b1312bf` ile
onaylı `16b10a4` arasındaki `src/data` farkı yalnızca üç dosyadır:

| Dosya | Yerel | Uzak main |
|---|---|---|
| `published.json` | 124, SHA256 `2f70e7e67bdbb871e689c36f92455cb39003a21c21a6128fa455423c1db9b3da` | Aynı |
| `pending.json` | 130 | 131 |
| `seen_ids.json` | 11.348 | 11.373 |
| `fetch-status.json` | Eski fetch durumu | Yeni fetch durumu; 5 üst anahtar korunur |

Tüm blob SHA256 değerleri `reports/content-reconciliation.json` içinde.
Eski dosyaları elle kopyalamak, reset/rebase veya `-X ours` kullanmak yerine
son main sıradan merge ile alınmalıdır. Güncel yayın/aday/seen-id/fetch
durumunun tamamı korunur. Aşağıdaki **onay sonrası yerel** reçete bu sprintte
çalıştırılmadı; uzak yazım içermez. Her hata/çakışmada durulur, dosyalar
incelenir; içerik hunk’ları körlemesine seçilmez.

```powershell
Set-Location D:\IT\AmericaWhat\americawhat\tmp\security-boss
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw 'Önceki komut başarısız; dur.' } }
if ((git branch --show-current) -ne 'codex/security-boss') { throw 'Yanlış dal.' }
if (git status --porcelain) { throw 'Çalışma ağacı temiz olmalı.' }
$combined = git rev-parse HEAD
Check-Exit
git fetch --no-tags origin main
Check-Exit
$incoming = git rev-parse origin/main
Check-Exit
# RSS fetch devam ediyor. Uç değişmişse önce yeni içerik/kod farkını yeniden incele.
if ($incoming -ne 'b1312bfff52279c9a74058e51fb3e3a4f15aacb5') { throw 'Yeni main: planı güncelle.' }
git diff --exit-code 16b10a4 -- src/data
Check-Exit
git switch -c codex/reconcile-main
Check-Exit
git merge --no-ff --no-commit $incoming
Check-Exit
# Bu anlık main snapshot’ının dört dosyası byte düzeyinde korunmuş olmalı.
git diff --exit-code $incoming -- src/data/published.json src/data/pending.json src/data/seen_ids.json src/data/fetch-status.json
Check-Exit
git diff --exit-code $combined -- src ':(exclude)src/data/**'
Check-Exit
git diff --check
Check-Exit
git diff --cached --check
Check-Exit
npm ci
Check-Exit
npm test
Check-Exit
npm run build
Check-Exit
npm run verify:static
Check-Exit
npm run verify:public-parity -- --baseline reports/approved-dist
Check-Exit
node scripts/parity/compare-live.mjs https://americawhat.com --pages 40
Check-Exit
git -c user.name='Hakan Dundar' -c user.email='hakan@dndr.net' commit -m 'merge: güncel main içeriğini koruyarak uzlaştır'
Check-Exit
git show -s --format=fuller HEAD
git ls-remote --heads origin refs/heads/main
Check-Exit
```

Bu reçete mevcut worktree’deki OG/baseline çıktısını kullanır. Yeni yayımlanmış
haber gelirse önce OG üretimi, eski URL/metadata korunumu ve yeni beklenen
sayfa/SEO seti yeniden hesaplanır; baseline eşitliğini geçsin diye test
gevşetilmez. Veri değişeceği için final public parity çağrısında `--ref`
verilmez; kaynak dondurması `src/data` hariç ayrıca denetlenir. Son `ls-remote`
ucu değişmişse yeni snapshot tekrar incelenir/ordinary merge/test yapılır;
eski içerik geri yazılmaz. Push/PR/remote merge ve staging dağıtımı ayrı izinlidir.

Kimlik: yeni commit’ler sahibi adına. GitHub Contributors API yalnızca
`hakandndr` (324) döndürdü. Buna rağmen son RSS commit’i `aw-bot
<actions@users.noreply.github.com>` ve API `author.login`/`committer.login`
**`actions`**; tek amaçlanan kimlikle tutarsızdır. `origin/main` shortlog’unda
324 Hakan/dndr, 298 aw-bot/actions, 22 eski Hakan/gmail commit’i; 5 tarihsel
co-author trailer’ı var. Eski tarihçe değiştirilmedi. `.github/workflows/fetch.yml`
bugün aw-bot kimliği ayarlıyor; gelecekte sahibi e-postasına geçirilmesi ayrı
onaylı bakım olmalı. Contributors listesinin mevcut hali temiz gelecek
atıf garantisi değildir; workflow bu sprintte değiştirilmedi.

## D — Hazırlık kapıları: kanıt, bilinmeyen ve sonraki işlem

| Kapı | Salt okunur kanıt / kalan işlem |
|---|---|
| Web staging | Health GET: `636936f`, 124 yayın, `test-only`, app/analytics D1 ve reaction-secret kontrolü OK. Yeni commit dağıtılmadı; aynı kesin commit üzerinde gerçek staging API/istek/SEO/manuel görünüm doğrulaması gerekir. |
| Boss staging / Access | Anonim staging GET 404; Access yönlendirmesi görülmedi. Bu hesapta Access uygulaması yok demek değildir. Yerel config workers_dev/preview_urls false ve AUD boş. Gerçek hostname/Access app/policy ve Worker JWT negatif testleri bekler. Tek e-posta `hakan@dndr.net`, hedef `boss.americawhat.com`. |
| Production Worker/D1 | Yerel prod config D1 kimlikleri `PRODUCTION_NOT_PROVISIONED`, AUD boş. Hesap düzeyinde envanter bu sprintte yok; provisioning/migration/secret ve izole test ayrı onay ister. |
| CPU/plan | Gerçek hesap planı doğrulanmadı. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/): Free HTTP 10 ms; Paid varsayılan 30 s, ayarlanabilir üst sınır 5 dk. Ağ/DB bekleme Worker CPU’su değildir. Önceki Node ~11 ms warm/~31 ms cold gerçek Worker CPU ölçümü sayılmaz. Review/analytics/import workload ve D1 rows-read/latency staging’de ölçülmeli; `daily LIMIT 60` tüm geçmiş taramasını sınırlamaz. |
| GitHub staging branch / secret | `content-staging` remote ref yok. Secrets isim API’sinde yalnızca FTP_PASSWORD, FTP_SERVER, FTP_USERNAME var; Cloudflare secret adı görülmedi. Bu değer/scope veya başka ortamdaki credential yokluğunu ispatlamaz. Sandbox içerik dalı ve yalnızca gereken repo/branch erişimli Boss credential, CF kaynaklarına dar token ve server-side secrets hazırlanıp sınanmalı. FTP/mail credential’a dokunulmaz. |
| DNS/mail | NS `hermes.dns-parking.com`, `artemis.dns-parking.com`; MX Hostinger mx1 priority 5 / mx2 10. DNS cutover yapılmadı. Mailbox/forwarding ve MX/SPF/DKIM/DMARC korunur; web emekliliği email aboneliğini sonlandırmaz. |
| Hostinger yedek | Güncel geri yüklenebilir web/PHP/config yedeği kanıtlanmadı. Kesimden önce alınmalı/doğrulanmalı; bu sprintte dosya erişimi/değişimi yok. |
| Final legacy log / votes | `aw_panel_log.txt`, `aw_votes.json` final snapshot’ları henüz yok; şimdi talep edilmez. Onaylı cutover’a yakın boyut/hash/kapsam kaydıyla alınır. Tam tarihçe/sayaç koruma kararı kesin. |
| Import / reconciliation | Yerel sentetik duplicate/idempotent legacy ve vote snapshot import’u, aggregate korunumu, typed-date silme testleri geçti. Gerçek final dosyalar için dry-run sayım, corpus/hash, tekrar çalıştırmada delta=0, oy-toplamları ve kesim aralığı reconciliation bekler. Gerçek veri import/export yapılmadı. |
| Native analytics / reactions | Yerel web modülleri + workerd tek beacon/oy ve sentetik Boss kontrolleri geçti. Staging test-only gerçek istek, origin/rate-limit, tekrar oy, D1 olay/sayaç reconciliation ayrı doğrulanır. Gerçek ziyaretçi/oy verisi değiştirilmez; staging’de eski 3 satır/2 test dışı oy kararı bekler. |
| DNDR | Yerel prod binding/producer yok; diğer proje salt okunur. AmericaWhat native producer ve kesim aralığı/gap ayrı proje onayı ister. Legacy tarihçe tekrar forward edilip çift sayılmaz; outbox/ack/retry işleyişi gerçek bağlantıyla henüz sınanmadı. |
| Privacy / retention | Silme yalnızca manuel. Mevcut privacy 90 gün silme vaadiyle tutarsızlık üretim öncesi giderilmeli; otomatik silme varmış gibi yazılmaz. Bu sprintte donmuş public sayfa değiştirilmedi. |
| Rollback / gözlem | Runbook hazır: Hostinger web geri dönüşü korunur, ilk 72 saat gözlem; 30 gün stabil çalışmadan web/PHP emekli edilmez. Geri dönüş restore/DNS/probe uygulaması henüz prova edilmedi. Email kalır. |

## Sonraki ayrı onaylı staging adımı ve mimari değerlendirme

Önce sahibi yerel public/Boss görünümünü inceler. Ardından içerik uzlaştırma
ayrı onayla tamamlanır; tam commit pinlenerek yalnızca AmericaWhat staging
kaynaklarına dağıtılır. Boss Access/AUD/izinli e-posta ve sandbox Git dalı/
credential hazır olmadan gerçek publish denemesi yapılmaz. Staging’de web
test-key olayları, reaksiyonlar, altı Boss bölümü, sahte/eksik JWT, CSRF,
duplicate/tek-commit yayın, sentetik import/delete-preview, SEO ve gerçek CPU/
D1 maliyeti doğrulanır. Production DNS/final dosyalar bu aşamaya dahil değildir.

Mimari yerel entegrasyon için tutarlı: statik public yüzey ile yetkili yönetim
Worker’ı ayrıdır, publish Git snapshot/tek commit üstündedir, import idempotent
ve silme açık operatör eylemidir. Kalan temel risk UI entegrasyonundan çok gerçek
Access/credential yapılandırması, büyük geçmişte sorgu/import maliyeti ve kesim
anında veri aralığı reconciliation’dır. Büyük Astro/Vite geçişi için DOM/CSS
ve derlenmiş istemci kanıtı güçlüdür; manuel görsel/gerçek staging ölçümünün
yerine geçmez. Minification kapalı CSS’nin transfer maliyeti ölçülmeli.
Sıfır npm advisory bu operasyonel kapıları kaldırmaz. Güncel dışa bağımlılık
durumu yeni bir dağıtım öncesinde yeniden taranmalıdır.

## Yerel web önizlemesini tekrar başlatma

Bu worktree’de `dist`, `.wrangler/web-test` yerel migration’ları ve Git dışı
test anahtarı hazırdır; anahtar değerini paylaşma. Yeni kurulumda önce mevcut
runbook’a göre **yalnızca local** D1 migration/test-secret hazırlanır.

```powershell
Set-Location D:\IT\AmericaWhat\americawhat\tmp\security-boss
$env:WRANGLER_SEND_METRICS = 'false'
$env:WRANGLER_LOG_PATH = Join-Path (Get-Location) '.wrangler/logs'
$env:CI = 'true'
node node_modules/wrangler/bin/wrangler.js dev --local --config workers/web/wrangler.jsonc --ip 127.0.0.1 --port 8817 --inspector-port 9317 --persist-to .wrangler/web-test --var PUBLIC_ORIGINS:http://127.0.0.1:8817 --var RELEASE_ID:security-phase-a
```

Boss preview/test komutları [OPERATIONS.md](OPERATIONS.md) başındadır.
Çalışan başka AmericaWhat önizlemesine müdahale edilmez.
