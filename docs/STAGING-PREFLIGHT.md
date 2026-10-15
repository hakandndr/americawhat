# AmericaWhat — Boss renk uyumu ve staging preflight

2026-10-15 takip notu: [Boss UX/Analytics sprinti](BOSS-UX-ANALYTICS-SPRINT.md)
beyaz metinli buton, country contains, authenticated canlı filtreleme ve
doğrudan snapshot sayfalaması ekledi; kaynak uç `71879c8`, 134 test/18 workerd.
Bu değişiklikler henüz dağıtılmadı. Aynı schema/config korunur; Analytics’e
özgü response CSP’si yeni script/connect self izni verir. Sonraki staging
doğrulamasına canlı filtre, history, /assets/analytics.js Access ve yeni sorgu
rows_read/CPU ölçümü eklenmelidir. Aşağıdaki tarihli uzak preflight/UUID’ler
bu sprintte yeniden sorgulanmadı; rollout öncesi güncel durum tekrar okunur.

2026-10-14 America/Los_Angeles; API okumaları 2026-10-15 UTC.
**Yerel uygulama ve salt okunur preflight tamamlandı; dağıtım yapılmadı.**
Başlangıç `codex/security-boss` / `3730297705ee50fc4692e63b89311462be6a28df`.
Renk commit’i **`0f3fe0281f20ec30ed8416cb0f4b28663d96c04d`**; sonraki commit
yalnızca bu preflight/devir belgeleridir. Çalışma alanı
`D:\IT\AmericaWhat\americawhat\tmp\security-boss`.

## Yerel adayın sınırı ve doğrulaması

Onaylı public tasarım dondurulmuştur; `git diff 3730297 -- src` ve
`git diff 16b10a4 -- src` boştur. Reddedilmiş V1/V2/V3 kaynakları alınmadı.
Boss yerleşim/font/spacing/tablo/form/navigation davranışı aynı; yalnızca
`workers/boss/src/html.mjs` renkleri ve theme-color değişti. Exact eşleme,
kontrast istisnaları ve kanıt [BOSS-THEME.md](BOSS-THEME.md) içinde.

| Son çalıştırılan kontrol | Sonuç |
|---|---|
| `npm test` | **117/117**, iki yeni public token/kontrast testi dahil |
| `BOSS_PREVIEW_PORT=18828` ile `test:boss-preview` | **18/18** local workerd; altı bölüm, JWT/CSRF negatifleri, atomik approve/reject, legacy/reaction import ve manuel retention |
| Build / verify:static | 162 HTML; 309 dosya, 300 upload, 9 dışlanan; 0 hata |
| verify:refinement | 124 haber, 11 parça, 3.652 iç bağlantı; metadata/kart sözleşmeleri aynı |
| verify:public-parity | 162 body DOM, CSS ve public kaynak aynı |
| test:web-client | Gerçek derlenmiş modüller, yerel web/D1; Load More 124 benzersiz haber, ana/detayda tek beacon ve oylar başarılı; uzak istek 0 |
| Tam / dev hariç npm audit | **0 / 0**, lockfile değişmedi |
| Web/Boss deploy --dry-run --metafile | Upload yok; 8/20 girdi, npm runtime girdisi 0 |
| Boss renk dışı CSS/HTML karşılaştırması | `3730297` ile aynı; mobile media/sticky-submit ve typography/radius aynı |
| Gerçek D1 şema karşılaştırması | App 9 + Analytics 20 uygulama tablo/index DDL’si, yerel migration ile aynı |

Grafik/gerçek cihaz/ekran okuyucu testi yapılmadı; görünümü sahibi inceler.
Önceki preview’dan kalan yalnızca local/sentetik `.dev.vars` dosyası silinmeden
Git dışı `.wrangler/boss-preview-vars-before-theme.dev.vars` konumuna korundu;
workerd testi bundan sonra geçti. Kimlik değerleri raporlanmadı; gerçek
ziyaretçi/oy içeriği okunmadı.
Yerel sentetik testler kendi state’ini kullanır; gerçek staging verisi değişmedi.

Kaynak sürümü `0f3fe02` olan engineering adayı hazırdır. Henüz güncel main ile
uzlaştırılmadığı ve Boss staging konfigürasyonu eksik olduğu için **dağıtılabilir
nihai RC değildir**. Bir sonraki sprintte uzlaştırma ve onaylı staging config
commit’inden sonra yeni tam SHA pinlenip aynı kontroller tekrar çalıştırılır.
Belge commit’leri de dahil gerçek yerel uç `git rev-parse codex/security-boss`;
üretilen artifact manifest’i `reports/theme-release-manifest.json` içindedir.

## Gerçek Cloudflare sürüm farkı

Mevcut Wrangler OAuth oturumuyla yalnızca AmericaWhat kaynakları okundu.
Ortamdan gelen geçersiz `CLOUDFLARE_API_TOKEN` ilk GET’i 9109 ile reddetti;
yalnızca alt süreçte kaldırılarak mevcut oturum kullanıldı. Sistem/env profili
ve hesap ayarı değiştirilmedi. Secret değerleri çıktı/rapora yazılmadı.

| Kaynak | Doğrulanan mevcut durum |
|---|---|
| Web staging health + etkin version binding | `RELEASE_ID=636936f`; Git karşılığı `636936f73d3faac901877347d53c902929324a4b` |
| Web aktif deployment | **`462bbac6-da4a-48ba-87ee-a631a71a312e`**, 2026-10-14T19:08:31.565173Z |
| Web aktif version, %100 trafik | **`02c0da48-f3a2-47ad-99e0-8358b9244ac7`** |
| Boss aktif deployment / version | `2004d44f-c78a-4d6c-b1ab-29800d4ab491` / **`85119d25-bc70-4871-a5f2-f9dcb3dbf896`**, RELEASE_ID `636936f` |
| Web URL | workers.dev açık, previews kapalı; health OK, 124 yayın, visit_collection test-only |
| Boss URL | workers.dev ve previews **kapalı**; mevcut adayda da public route yok |
| Access uygulamaları | API 200, total_count **0**; bu hesapta uygulama henüz yok |
| Zero Trust team domain | Config `dndrnet.cloudflareaccess.com`; organization GET 403/10000, gerçek auth_domain bu oturumla doğrulanamadı |
| Boss auth/credentials | Etkin version’da AUD boş; `GITHUB_TOKEN` ve `BOSS_CSRF_SECRET` secret binding’i **yok** |
| Web secret adları | REACTION_GUARD_SECRET, STAGING_TEST_KEY mevcut; değerler okunmadı/değişmedi |

Health ile deployed binding aynı kısa SHA’yı bildiriyor; Cloudflare version UUID
de bağımsız olarak kaydedildi. Bu kaynak etiketi doğrulamasıdır; health tek
başına kriptografik artifact/source attestation değildir.

Eski staging **bozuk sayılmıyor**. HTTP/HTML ve Git farkı şu ayrımı doğruladı:

| Özellik | Eski staging `636936f` | Yerel aday |
|---|---|---|
| Ana liste | 124 kart doğrudan HTML’de | İlk 12 + Load More / JS’siz parça bağlantıları |
| Kategori/arşiv | `/category/`, `/archive/`, `/feed/2/` 404 | Gerçek statik sayfalar; 11 feed parçası |
| Menü/footer | random? / About / Contact; eski footer | Onaylı Random? → Categories → Archive ve kompakt footer |
| Trending ve reaksiyonlar | **Zaten mevcut** | Korunur; parça yüklemeyle oy/beacon bağlantısı uyarlanmış |
| Public Worker API/native analytics | Mevcut ve health sağlıklı | Kaynak aynı, istemci Load More uyarlaması yeni |
| Astro/sitemap/Wrangler | Eski araç zinciri | 7.3.8 / 3.7.4 / 4.151.0; güvenlik audit’i 0 |
| Boss | Önceki UI; ulaşılmaz | Seçici altı bölüm UI + hizalanmış public renkler |

`git diff 636936f 0f3fe02 -- workers/web migrations` boş. Web/Boss config’leri,
compatibility_date `2026-09-01`, assets binding/handling, API ve iki D1 ID’si
aynı. Astro hâlâ statik `dist` üretir; SSR adapter/Pages migration yok.
Yeni HTML/CSS/JS asset hash’leri ve sayfa sayısı değişir; `_astro` immutable
cache ve Worker-first/noindex kuralları korunur. CSS minification kapalıdır;
görsel değerler korunur, staging’de transfer maliyeti ölçülür.

## D1 ve staging verisinin korunması

Yeniden kullanılabilir mevcut kaynaklar:

- `americawhat-web-staging` ve `americawhat-boss-staging` Worker’ları.
- APP_DB `americawhat-app-staging`, **a3c9ff1f-05c2-4ed6-bb9e-4ca41f4cc9e2**.
- ANALYTICS_DB `americawhat-analytics-staging`, **306b9ee6-2529-4f95-b43c-c7cd9dbf0a3c**.
- Web’in mevcut iki server-side secret’ı ve noindex/test-only ayarı.

Uzak SELECT yalnızca sqlite_master ve d1_migrations metadatasındaydı; gerçek
analytics/reaction satırları okunmadı veya export edilmedi. Uzakta
`0001_app_core.sql`, `0001_analytics_core.sql` uygulanmış; DDL aynı.
Bu aday için **yeni migration veya web ortam değişkeni gerekmiyor**.
Yeni RELEASE_ID tam SHA olmalı. Boss’un eksikleri aşağıdadır.

Static asset/Worker upload’u D1 reset/import/delete gerektirmez. Aynı ID’leri,
secret’ları ve şemayı korumak mevcut staging test verisini korur. Deploy planında
migration apply/create/drop/seed ve D1 restore yok. Boss aynı staging DB’lerini
gördüğünden destructive/import testleri mevcut kayıtları etkileyebilir:
ilk uzak turda yalnızca read ve delete-preview; gerçek Delete/Import için
ayrıca onaylı sentetik corpus ve öncesi/sonrası inventory gerekir. Var olan
3 visitor/2 test dışı vote hakkında eski karar beklemesi korunur; temizlenmez.

## Git içerik uzlaştırması ve RSS kimliği — henüz yapılmadı

Son fetch/ls-remote: main **b1312bfff52279c9a74058e51fb3e3a4f15aacb5**;
`content-staging` ref’i yok. `4438907` geliştirme tabanından sonraki tek main
commit’i `b1312bf` fetch güncellemesi. Ortak ata `302549b`.

| Veri | Yerel | Son main |
|---|---|---|
| published | 124 | 124; byte/hash aynı |
| pending | 130 | 131 |
| seen IDs | 11.348 | 11.373 |
| fetch-status | Eski durum, 5 üst anahtar | Yeni fetch durumu, 5 üst anahtar |

Blob hash’leri Git dışı `reports/theme-content-reconciliation.json` içinde.
[INTEGRATION-SPRINT.md](INTEGRATION-SPRINT.md) C bölümündeki kesin PowerShell
reçetesi bu dalın yeni ucundan da geçerlidir: temiz ağaç, yeniden fetch,
gelen SHA kontrolü, yeni `codex/reconcile-main` dalı, **ordinary
`merge --no-ff --no-commit`**, dört veri dosyasının incoming snapshot ile
eşitliği, public kaynak (data hariç) korunumu, test/build/parity, sahibi adına
merge commit’i. Uç değişmişse plan yeniden incelenir. Çakışmalar körlemesine
çözülmez; rebase/reset/force-push/`-X ours` yok. Bu sprintte merge yapılmadı.

RSS kimliği halen aw-bot / actions@users.noreply.github.com; API commit’i
`actions` hesabına bağlıyor. Contributors API yalnızca hakandndr (324) gösteriyor.
Onay sonrası yalnızca gelecekteki fetch commit’leri için workflow’daki iki git
config değeri `Hakan Dundar` / `hakan@dndr.net` yapılmalı; sahibi GitHub Emails
ekranında adresin doğrulanmış olduğunu kontrol eder. Ayrı yerel bakım commit’i
ve review gerekir; bu sprintte workflow veya tarihçe değiştirilmedi.
`fetch.yml` manuel olarak başka daldan çalıştırılsa da **main’e push** eder;
staging editör testinde kesinlikle tetiklenmez. `deploy.yml` main push’u
Hostinger’ı etkiler; bu sprintte veya staging rollout’ta main’e push/merge yok.

## Boss staging: sahibi için kesin hazırlık adımları

Bu bölüm **sonraki ayrıca onaylı sprintte** uygulanır; henüz hiçbir ayar yok.
Production hedefi `boss.americawhat.com` kalır. DNS/mail cutover’ı olmadan
staging için önerilen URL:
`https://americawhat-boss-staging.hakan-c89.workers.dev`.
Mevcut `BOSS_ORIGIN=https://boss-staging.americawhat.com` bu seçimle uyuşmaz;
sonraki staging config commit’inde gerçek HTTPS origin’e birebir ayarlanmalıdır.

1. Cloudflare Dashboard → **Workers & Pages → americawhat-boss-staging →
   Access → Protect this Worker behind Access → All traffic**. Yalnızca bu
   Worker seçilir; hesap genelindeki Protect all Workers kullanılmaz.
2. Authentication policy: ayrı AmericaWhat Boss staging Allow policy;
   **Include → Emails → hakan@dndr.net**. Everyone/email-domain, Bypass veya
   Service Auth kuralı eklenmez. Session duration önerisi 1 saat; yalnızca
   sahibinin kullanacağı doğrulanmış e-posta sağlayıcısı/OTP veya mevcut SSO
   seçilir. Başka uygulamaların policy/IdP ayarları değiştirilmez. Apply Access.
3. **Zero Trust → Access controls → Applications** içinde bu Worker’ın yeni
   uygulamasını aç; Application Audience (AUD) Tag’i al. AUD bir secret değildir;
   production app AUD’sinden ayrı olmalıdır. Team domain’i doğrula. Mevcut
   config’e göre beklenen issuer `https://dndrnet.cloudflareaccess.com`, JWKS
   `https://dndrnet.cloudflareaccess.com/cdn-cgi/access/certs`; org GET 403
   nedeniyle gerçek domain doğrulanana kadar bu değer varsayım olarak kalır.
   `BOSS_ACCESS_TEAM_DOMAIN` yalnızca hostname, AUD yalnızca bu staging app tag’i.
4. Worker **Settings → Variables and Secrets**: `ENVIRONMENT=staging`,
   izinli email tek kişi, staging origin/team/AUD ve staging Git repo/branch
   değerlerini planla. Kaynak config’te de aynı değerleri ayrı commit’te tut;
   dashboard ile dosyanın çelişmesine izin verme. Bu sonraki config commit’inde
   yalnızca staging kökünde `workers_dev:true`, `preview_urls:false` olacak;
   production env/route bloğu aynı kalır. `BOSS_CSRF_SECRET` için ayrı
   rastgele ≥32-byte secret ve aşağıdaki staging-only `GITHUB_TOKEN` ekle;
   değerleri Git’e, komut argümanına, loga veya rapora yazma.
5. Worker **Bindings**: yukarıdaki iki staging D1 ID’sini doğrula; production
   ID’si veya DNDR production binding’i ekleme. BOSS_DEV_JWKS ve
   BOSS_GITHUB_API_BASE yerel seam’lerini uzak secret/var olarak kurma.
6. Access policy/AUD/secrets/config doğrulandıktan sonra **Domains (bazı
   ekranlarda Settings → Domains & Routes) → workers.dev → Enable**.
   Önce Access korunumu, sonra URL açılışı. Preview URLs kapalı kalır.
   Bu değişiklik de ayrıca onay ister; güvensiz geçici route açılmaz.
7. Oturum açmadan 302/login veya 403, yetkisiz email için deny; oturumlu
   sahibi altı bölüme erişir. Worker hâlâ RS256 signature/kid, issuer,
   audience, expiry/nbf ve email doğrular. Sahte header/JWT, yanlış AUD,
   süresi geçmiş JWT ve eksik secret negatifleri sınanır. Access’i bypass
   ederek test etmek için açık alternatif URL kurulmaz.

Access cookie/session Cloudflare’a aittir; uygulama ek session cookie tutmaz.
Her POST tam `Origin=BOSS_ORIGIN`, varsa `Sec-Fetch-Site=same-origin`, imzalı
kimlik/subject ve mevcut/önceki 12 saat penceresine bağlı HMAC CSRF ister.
Access session süresi bu form token ömründen bağımsızdır; Access/JWT geçersizse
form token’ı erişim sağlamaz. No-store/CSP/frame koruması kaynakta aynı.
[Güncel Worker Access adımları](https://developers.cloudflare.com/workers/configuration/cloudflare-access/),
[JWT doğrulama](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

### GitHub credential izolasyonu: branch adı izin sınırı değildir

[Fine-grained PAT](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
repo + permission bazında kısıtlanır; yalnızca `content-staging` branch’ine
scope verilemez. Mevcut Worker non-production bağlamında main/master’ı reddeder,
ancak token’ın repo düzeyindeki erişimini daraltmaz. Production repo’ya yazabilen
sahibi token’ını yalnızca branch var’ını değiştirerek kullanmak yeterli değildir.

En güvenli öneri, **ayrı onayla** yalnızca AmericaWhat’a ait bağımsız staging
içerik deposu (önerilen ad `hakandndr/americawhat-staging-content`, henüz yok)
ve içinde `content-staging` dalıdır. GitHub → + → New repository → bu ad,
Private, yalnızca README ile initialize; Create repository. Repo branch
menüsü → View all branches → New branch → `content-staging`, source main.
Pinlenen son production main snapshot’ındaki `src/data/published.json`,
`pending.json`, `seen_ids.json`, `fetch-status.json` bu dalda aynı yollarla
seed edilir ve hash’leri karşılaştırılır. `.github/workflows`/FTP/deploy/fetch
otomasyonu kopyalanmaz; repo fork edilmez.
Sahibi GitHub → Settings → Developer settings → Personal access tokens →
Fine-grained tokens → Generate new token; Resource owner hakandndr, kısa expiry,
Only select repositories **yalnızca bu sandbox repo**, Contents read/write ve
zorunlu Metadata read; Actions/Workflows/Administration yok.
`BOSS_GITHUB_REPOSITORY` bu repo, branch `content-staging` olur. Böylece yanlış
branch seçimi production repo’ya yazamaz; app guard da korunur. Token prod
içeriğe public read yapabilse bile production write izni yoktur.

Asıl `hakandndr/americawhat/content-staging` zorunlu tutulursa server-side
ruleset/branch korumasıyla staging aktörünün **tüm production ref güncellemeleri**
engellenmeli ve owner/admin bypass kalmadığı kanıtlanmalıdır. Sahibinin PAT’i
aynı kullanıcı kimliğini taşıdığından bu ayrım güvenilir olmayabilir; ayrı
GitHub App/aktör tasarımı ve branch koruma review’su gerekir. Bu sprintte
depo/App/ruleset oluşturulmadı ve koruma kanıtlanmadı. Bu durumda Boss
publishing kapısı kapalı kalır; owner’ın production PAT’iyle deneme yapılmaz.

## Bir sonraki ayrıca onaylı rollout: hazırlık → deploy → doğrulama

1. İçeriği yukarıdaki normal merge prosedürüyle uzlaştır. Staging Git izolasyonu
   ve Access yolunu sahibi onaylar; gereken staging config’ini ayrı commit’te
   tamamla. Production env bloğuna/Hostinger/workflow’a dokunma.
2. Temiz ağaçtaki **tam SHA** `$rc` olur. npm ci/audit/test, OG/build/static,
   URL/SEO/public parity, Boss token/kontrast, workerd ve derlenmiş istemci
   kontrolleri çalışır. Yeni yayınlar varsa OG ve beklenen sayfa seti hesaplanır;
   test geçsin diye baseline gevşetilmez. Secret adları/scopelarını doğrula.
3. Mevcut iki deployment/version UUID’sini tekrar oku; yukarıdaki uçlar değiştiyse
   rollback hedefini güncelle ve yeniden review et. Staging-only D1 inventory/
   güvenli yedek gereksinimi sahibiyle belirlenir; bu sprintte export/backup yok.
   Yeni migration gerekmediğinden migration apply/reset/seed **çalıştırılmaz**.
4. Onaylı kesin config ve SHA ile aşağıdaki komutlar kullanılır; burada çalıştırılmadı:

```powershell
Set-Location D:\IT\AmericaWhat\americawhat\tmp\security-boss
if (git status --porcelain) { throw 'Temiz ağaç gerekli.' }
$rc = git rev-parse HEAD
# $rc, review edilen tam SHA ile birebir karşılaştırılır; config/dry-run review tamamlanmış olmalı.
$env:WRANGLER_SEND_METRICS = 'false'
# Geçersiz ortam token'ı varsa yalnızca bu shell'de kaldır; mevcut doğru oturumu doğrula.
Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue
node node_modules/wrangler/bin/wrangler.js deploy --dry-run --config workers/web/wrangler.jsonc --var RELEASE_ID:$rc
if ($LASTEXITCODE -ne 0) { throw 'Web dry-run başarısız.' }
node node_modules/wrangler/bin/wrangler.js deploy --dry-run --config workers/boss/wrangler.jsonc --var RELEASE_ID:$rc
if ($LASTEXITCODE -ne 0) { throw 'Boss dry-run başarısız.' }
# Aşağıdaki iki komut UZAK YAZIMDIR: yalnızca sonraki ayrı rollout onayıyla.
node node_modules/wrangler/bin/wrangler.js deploy --config workers/web/wrangler.jsonc --name americawhat-web-staging --var RELEASE_ID:$rc
if ($LASTEXITCODE -ne 0) { throw 'Web deploy başarısız; Boss ile devam etme.' }
# Web health, read smoke ve $rc/version doğrulaması burada tamamlanır.
node node_modules/wrangler/bin/wrangler.js deploy --config workers/boss/wrangler.jsonc --name americawhat-boss-staging --var RELEASE_ID:$rc
if ($LASTEXITCODE -ne 0) { throw 'Boss deploy başarısız.' }
```

`--env production`, main push/merge, Pages/FTP deploy veya account-wide ayar
yoktur. Boss config’te AUD boşken veya credential/Access izolasyonu eksikken
bu komut bloğuna geçilmez. Secrets deploy komutuna argümanla verilmez.

5. Web `/api/health.release == $rc`; Cloudflare deployment/version `%100`
   metadata’sında da aynı RELEASE_ID görülür. Boss health ekranı sürüm etiketi
   göstermediğinden Boss version metadata RELEASE_ID’si ayrıca karşılaştırılır.
6. Önce GET: ana/detay/about301/404, RSS/sitemap/robots/security headers,
   Load More sırası/124 benzersiz haber, JS’siz sayfalama, category/archive,
   menu/footer ve manuel public görünüm. Trending yeniden tasarlanmaz; mevcut
   sayaç görünümü kontrol edilir. PHP/config/log/static-secret sızıntısı yok.
7. **Ayrıca izinli sentetik staging yazılarıyla** tek beacon/test-key, origins,
   native event idempotency, tekrar oy/rate-limit ve counts API doğrulanır.
   Mevcut gerçek/test dışı satırlar veya oylar silinmez. `smoke.mjs --write`
   staging reaction ve beacon yazar; bu sprintte çalıştırılmadı. Script’in normal
   modu bile negatif POST gönderir; mevcut preflight sadece GET/SELECT kullandı.
8. Access owner/unauthorized/JWT/CSRF testleri; altı Boss bölümü/filtre/export
   yalnızca onaylı sentetik veriyle; approval/reject/duplicate bir Git commit’i
   ve yalnızca sandbox content-staging ref’i değiştirir. Gerçek main önce/sonra
   aynı kalmalı. Audit/error loglarında token/IP/UA gereksiz sızıntısı aranır.
9. Cloudflare Worker **Metrics / Observability** üzerinden cold/warm CPU,
   errors ve latency; D1 query latency/rows_read ölçülür. Hesap planı Billing /
   Workers plan ekranında sahibi tarafından doğrulanmalı; `usage_model=standard`
   tek başına Paid kanıtı değildir. Review/Analytics günlük SELECT ve tam geçmiş
   import yükü ölçülür; LIMIT 60 sadece çıktı sınırıdır. Free HTTP 10ms bütçesi
   gerçek Worker CPU’suyla değerlendirilir; eski Node zamanları ölçüm sayılmaz.
   [Güncel limitler](https://developers.cloudflare.com/workers/platform/limits/).

## Rollback hedefi ve doğrulama sınırı

Yukarıdaki mevcut version UUID’leri API ile okundu; CLI rollback argümanları
kurulu Wrangler 4.151.0 `--help` ile doğrulandı. Web Worker kaynakları/29 DDL
tanımı aynı olduğundan eski kod yeni şema gerektirmez. **Gerçek Cloudflare
rollback çalıştırılmadı/prova edildiği iddia edilmez**; izinsiz deploy/rollback
bu sprintte mümkün değildir. Tam uzak geri dönüş provası sonraki rollout
onayının parçası olmalı: yeni staging → önceki version → health/GET → aynı
pinlenmiş yeni version; D1 veya production geri yüklenmez.

```powershell
# Yalnızca ayrıca onaylı rollback anında; güncel hedef UUID tekrar doğrulanır.
node node_modules/wrangler/bin/wrangler.js rollback 02c0da48-f3a2-47ad-99e0-8358b9244ac7 --name americawhat-web-staging --config workers/web/wrangler.jsonc
node node_modules/wrangler/bin/wrangler.js rollback 85119d25-bc70-4871-a5f2-f9dcb3dbf896 --name americawhat-boss-staging --config workers/boss/wrangler.jsonc
```

Dashboard alternatifi: Workers & Pages → **ilgili staging Worker → Deployments**
→ hedef version’ın üç nokta menüsü → Rollback. Sonra web health `636936f`,
HTTP/asset davranışı, bindings ve D1 ID’leri doğrulanır. Access/credential sorunu
varsa önce Boss workers.dev/preview URL’lerini kapat; Access’i açık tut.
Önceki Boss zaten erişime kapalıydı: version rollback tek başına URL/Access
durumunu eski haline getirmiş sayılmaz.

[Cloudflare rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
kod/asset/binding sürümünü değiştirir; D1 kayıtlarını, Git commit’lerini, DNS,
Access policy’sini veya yapılan editorial testleri geri almaz. Yeni secret ve
route/settings durumları ayrıca kontrol edilir. Bu aday şema değiştirmediğinden
DB restore gerekmez; gelecekte şema değişirse ayrıca backward-compatibility/
backup planı gerekir. Geri dönüş için test verisi veya geçmiş silinmez.

## Bekleyen sahip karar/onayları ve değerlendirme

Yerel renk görünümünü inceleme; content merge; staging Git repo/credential
izolasyonu; yalnızca Boss staging Access/AUD/origin/secrets/URL değişiklikleri;
tam SHA staging upload’u ve sentetik yazı/rollback provası ayrı onay ister.
Şu an final FTP log/oy snapshot’ı istenmez. Hostinger web/PHP daha sonra
emekli olur, EMAIL/MX/SPF/DKIM/DMARC kalır. Tam legacy log ve votes korunur;
90 gün raw IP/UA hedefi ve yalnızca manuel silme geçerlidir. Privacy vaadi
üretim öncesi gerçeğe uymalı; otomatik silme/DNDR tarihsel tekrar sayım yoktur.

Mühendislik önerisi: web’in aynı API/şema ve izolasyonla güncellenmesi düşük
migration riski taşır; Boss için asıl kapı UI değil Access + Git credential
sınırıdır. En güçlü ve basit izolasyon ayrı staging içerik deposudur. Free/Paid
kararı ve Analytics tam geçmiş sorgu maliyeti gerçek ortamda ölçülmeden
production hazır denmez. CSS minification kapalı aktarım boyutu ayrıca ölçülür.
İlk rollout sentetik ve geri dönüş provasıyla sınırlı tutulmalıdır.

Ham kanıtlar Git dışı `reports/theme-*`, `tests-theme.tap`, `boss-theme.log`,
`audit-theme*.json`, `web-client-theme.json` altındadır. Diğer projeler,
Cloudflare kaynakları, DNS, Hostinger, production içerik/oy/analytics değişmedi.
