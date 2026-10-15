# AmericaWhat — kontrollü staging hazırlığı

2026-10-15. Bu belge önceki API403'ü rollout önkoşulu sayan notların yerine
geçer. **Access uygulaması ve policy sahibi tarafından dashboard'da doğrulandı;
bu doğrulama kabul edilir. Access API izni proje engeli değildir.** Aynı yetkisiz
istek tekrarlanmaz, uygulama/policy yeniden oluşturulmaz, auth zayıflatılmaz.
Bu sprintte uzak upload/deploy/secret kurulumu/URL açma yapılmaz.

## Hazır olan güvenlik sınırları

- RS256 imzası yalnız team JWKS'sindeki RSA anahtarıyla doğrulanır; issuer,
  AUD, exp/nbf/iat (60sn saat toleransı) ve imzalanmış owner email kontrol edilir. Header-only kimlik,
  yanlış anahtar/issuer/AUD/email, süresi geçmiş token reddedilir. Eksik config/
  erişilemeyen JWKS fail closed. JSON null/array/primitive JWT bölümleri401 döner.
  BOSS_DEV_JWKS yalnız local+loopback; staging bu seam'i kullanmaz.
- ENVIRONMENT=staging iken repo **hakandndr/americawhat-staging-content** ve
  branch **content-staging** zorunludur. Başka hedefte okuma dahil hiçbir GitHub
  isteği yapılmaz. Production repo'ya negatif yazma testi yapılmaz. Doğru hedefte
  editorial değişiklik tek atomik owner commit'i, non-force ref güncellemesidir.
- Runtime fine-grained PAT ayrıca yalnız sandbox seçili, Contents RW/Metadata
  read olmalı. Token biçimi veya uygulama guard'ı PAT'in hesabındaki izinleri
  kanıtlamaz; sahibi izin ekranını doğrular. Yönetim gh oturumu Worker'a kurulmaz.
  PAT bitişi sahibi bildirimiyle2026-11-14; rotation ayrı unpublished version'dır.
- Her POST, Access'e ek olarak tam Origin ve HMAC CSRF ister. Eksik CSRF secret
  yazı işlemini503 ile reddeder. Authenticated Analytics script'i self CSP kullanır.

## Sabit staging ayarları

| Alan | Değer |
|---|---|
| Account / Access app | c8999b29b2123e2f9634248c58f43f14 / 932d247c-4d98-479e-a8c8-50da8a0550d1 |
| Team / issuer | dndrnet.cloudflareaccess.com / https://dndrnet.cloudflareaccess.com |
| JWKS | https://dndrnet.cloudflareaccess.com/cdn-cgi/access/certs |
| AUD | f750490dc8657f942cf2eb7af70137e0f00bd19c9b437e7d82b0f0f2fd8b194b |
| Policy / scope | dndr-staging-owner-only / yalnız bu Worker, All traffic |
| Kimlik | yalnız hakan@dndr.net; Everyone/domain/bypass/ek kullanıcı yok |
| Boss origin | https://americawhat-boss-staging.hakan-c89.workers.dev |
| Boss source config | ENVIRONMENT=staging; workers_dev=false; preview_urls=false |
| Git repo / branch | hakandndr/americawhat-staging-content / content-staging |
| Commit author+committer | Hakan Dundar / hakan@dndr.net |
| APP_DB | americawhat-app-staging / a3c9ff1f-05c2-4ed6-bb9e-4ca41f4cc9e2 |
| ANALYTICS_DB | americawhat-analytics-staging / 306b9ee6-2529-4f95-b43c-c7cd9dbf0a3c |
| Boss secret adları | GITHUB_TOKEN, BOSS_CSRF_SECRET |
| Web vars | ENVIRONMENT=staging; SITE_HOSTNAME=americawhat-web-staging.hakan-c89.workers.dev; PUBLIC_ORIGINS=https://americawhat-web-staging.hakan-c89.workers.dev |
| Web secret adları | mevcut REACTION_GUARD_SECRET, STAGING_TEST_KEY; koru, kopyalama/yazdırma yok |
| Release etiketi | iki Worker'da RELEASE_ID = aynı tam Git SHA |

Production env bloğu/binding'leri değişmez. BOSS_DEV_JWKS ve
BOSS_GITHUB_API_BASE uzakta kurulmaz. Secret değerleri vars/Git/rapor/.dev.vars
veya public artifact paketine konmaz. İki mevcut D1'de migration/reset/seed/
import/export/delete gerekmez. 90 gün hedefi ve yalnız manuel retention korunur.

## Secrets: deploy tetiklemeyen güvenli yöntem

`wrangler secret put`, normal `secret bulk` ve dashboard Variables and Secrets
**Deploy** düğmesi bu prosedürde kullanılmaz: doğrudan active deployment
yaratabilir. Secret-only version komutlarının hangi kodu baz aldığını varsaymak
yerine **pinlenmiş kod+vars+iki secret tek unpublished version** olarak hazırlanır.
[Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

1. Sahibi GitHub token ekranında Only select repositories=yalnız sandbox,
   Contents RW/Metadata read ve expiry'yi doğrular. Token sohbete gönderilmez.
2. Kendi Windows PowerShell7 terminalinde transcript/debug tracing olmadan
   `./scripts/release/prepare-staging-secrets.ps1` çalıştırır. Bu araç **offline**;
   network/Wrangler çağrısı yapmaz. PAT gizli prompt'tan alınır; bağımsız32-byte
   CSRF üretilir. JSON yalnız LOCALAPPDATA altında yeni owner-only ACL dizinine
   yazılır. Yalnız dosya yolu/secret adları çıkar; değerler gösterilmez.
   Dosya encrypted disk/password-vault politikasıyla güvenli saklanır; aynı
   CSRF değeri test/re-promote boyunca korunur. Public RC backup'ına kopyalanmaz.
   Araç sentetik tokenla JSON/32-byte CSRF/owner-only ACL kontrolünü geçti;
   gerçek token ile bu sprintte çalıştırılmadı.
3. Yalnız sonraki açık **version upload** onayından sonra, frozen Boss index.js
   için `versions upload --no-bundle --secrets-file <korumalı-dosya>` kullanılır.
   CLI argümanında değer değil dosya yolu vardır. DEBUG/verbose/transcript yok;
   JSON'u cat/Write-Output yapma. Secret adı/varlık ve version UUID kaydedilir.
4. Upload sonucunda active deployment/version, trafik ve workers.dev ayarı
   öncekiyle aynı olmalı. Yeni version'da RELEASE_ID, doğru sandbox vars, iki
   secret **adı** ve iki D1 ID metadata'sı incelenir. Secret değerleri okunmaz.
   Sonraki **versions deploy** ayrı onaydır. Bu sprintte ikisi de çalıştırılmaz.

## Tek değişmez RC: build → upload → test → geri dönüş

`reports/predeploy-release-manifest.json` tam SHA/config/bundle/309 statik dosya
hash'lerini; `reports/predeploy-candidate.zip` frozen kod/assets/config girdilerini
tutar. Onaylı125 OG aynı; gen-og çalıştırılmaz. Eski RC manifest/arşivleri ve
depo dışı backup korunur. Source/config/secret değişirse yeni version/receipt
gerekir; staging testi sırasında main fetch edip rebuild yapılmaz.

Sonraki onaylı upload'da temiz aynı HEAD, manifest dosya hash'leri ve frozen
config doğrulanır. Aşağıdaki PowerShell komutları **yalnız inceleme içindir**:

```powershell
$release = Join-Path (Get-Location) 'reports/predeploy-candidate'
$rc = (Get-Content reports/predeploy-release-manifest.json -Raw | ConvertFrom-Json).head
if ((git rev-parse HEAD) -ne $rc -or (git status --porcelain)) { throw 'RC değişti' }
# $reviewedSeal: review edilen release receipt'indeki manifest SHA256.
node scripts/release/verify-staging-candidate.mjs reports/predeploy-release-manifest.json $reviewedSeal
if ($LASTEXITCODE -ne 0) { throw 'RC artifact doğrulaması başarısız' }
# Secret dosyası bu pakette olmaz.
# $bossSecrets: offline yardımcı aracın verdiği owner-only dosya yolu; içeriğini yazdırma.
node node_modules/wrangler/bin/wrangler.js versions upload "$release/web/index.js" --no-bundle --env "" --config "$release/config/web.jsonc" --name americawhat-web-staging --assets "$release/dist" --var RELEASE_ID:$rc --tag $rc --upload-source-maps=false
node node_modules/wrangler/bin/wrangler.js versions upload "$release/boss/index.js" --no-bundle --env "" --config "$release/config/boss.jsonc" --name americawhat-boss-staging --secrets-file $bossSecrets --var RELEASE_ID:$rc --tag $rc --upload-source-maps=false
# Çıkan exact UUID'leri inceleme receipt'ine yaz; latest/tag'le activation yapma.
```

Bu komutlar kaynak main'i yeniden bundle etmez; frozen index.js/assets kullanır.
İki secret aynı Boss version'ına girer. Ardışık secret-only komutlarıyla eski
deployment kodunu yanlışlıkla yeniden baz alma riski önlenir. Aktif %100
version'ların değişmediği GET ile doğrulanır. Preview URL'leri kapalı tutulur.
Upload kaynak yazımıdır, trafik activation'ı değildir; burada yapılmadı.

## Sonraki kontrollü staging onayıyla yürütme sırası

1. Owner-only Access dashboard doğrulamasını esas al; API403 için yeniden deneme/
   yeni Access app veya ek izin şartı yok. PAT kapsamını ve secret dosyasını
   sahibi tamamlar. Workers planı/CPU bütçesi ve latency kabul sınırları belirlenir.
   Mevcut version/deployment UUID'leri, iki D1 ID, URL ve secret adlarını kaydet.
2. Yukarıdaki iki immutable version'ı upload et, metadata'yı doğrula; iki exact
   yeni UUID'yi kaydet. Tamamen farklı code/assets çıkarsa activation durur.
3. **Web önce**: aşağıdaki activation; health RELEASE_ID ve version %100 aynı
   SHA, noindex/301/404/RSS/sitemap/category/archive/Load More kontrolleri.
4. **Boss sonra**: yalnız incelenmiş yeni Boss UUID'yi activate et. URL hâlâ
   kapalı kalsın. Ayrı onayın içerdiği Worker-level workers.dev açılışını ancak
   mevcut Access All traffic/tek owner policy dashboard kontrolünden sonra yap.
   Preview URLs kapalı, DNS/custom domain yok. URL ayarı version dışıdır:
   canonical source config false kalır; zaman sınırlı test açılışı/kapanışı
   ayrı settings receipt'ine yazılır. Bu sırada ordinary deploy çalıştırılmaz.
   Böylece aynı kod/assets/version ile test ve rollback yapılır; sessiz drift yok.

```powershell
# Yalnız sonraki deployment onayıyla; UUID'ler upload receipt'inden gelir.
node node_modules/wrangler/bin/wrangler.js versions deploy "$webVersion@100%" --env "" --config "$release/config/web.jsonc" --name americawhat-web-staging --yes
node node_modules/wrangler/bin/wrangler.js versions deploy "$bossVersion@100%" --env "" --config "$release/config/boss.jsonc" --name americawhat-boss-staging --yes
```

5. Anonim/başka email deny, owner login/altı bölüm/Analytics asset200; yeni oturum,
   logout/expiry, yanlış issuer/AUD/key/expiry/JWT ve Origin/CSRF negatifleri.
   Auth bypass açılmaz. Gerçek JWT/cookie veya secret rapora kaydedilmez.
6. Ayrı onaylı sentetik beacon/test-key/idempotency/oy/rate smoke. Editorial
   approve/reject/edit tek owner commit ve yalnız sandbox content-staging ref'i;
   production main önce/sonra aynı. Replay/duplicate ikinci yayın yapmamalı.
   Sandbox commit'i Web'i otomatik rebuild etmez (Actions kapalı); bu test Git
   transaction ve Boss Published görünümüdür, mevcut frozen Web RC değişmez.
   Gerçek D1 kayıtlarına import/export/delete yok; manual retention testleri
   yalnız preview/local corpus'ta. smoke script'in normal modu bile POST yollar.
7. CPU: Worker Metrics/Observability'de version/endpoint/zaman penceresi,
   CPU p50/p95/p99, cold/warm gözlemi, errors/1102; client TTFB/elapsed/bytes.
   D1'de yalnız ilgili DB'nin rowsRead/query latency/query count ölçümleri;
   düşük trafik kontrollü pencere farkı endpoint tahminidir, kesin query meta
   değildir. Node ms veya LIMIT satır sayısı Cloudflare CPU/rows_read yerine geçmez.
   Request helper meta'yı dışarı vermediği için per-query attribution yoksa bunu
   açıkça yaz. Ölçüm için auth zayıflatılmaz veya gizli query params loglanmaz.
8. 10k→100k→beklenen retained hacim yalnız ayrı onaylı izole sentetik D1/test
   Worker bağlamında; aynı frozen bundle hash'leri, binding farkı ayrı deney
   manifest'i. All/ger/date/device, First/Last/sparse/limit100 ve export/summary/
   daily/top eşitliği. Mevcut staging D1'ye seed yok. Doğrusal metadata/contains
   maliyeti CPU/latency/rows_read bütçesini aşarsa production kararı durur.
9. Rollback provası: **yeni→eski→aynı yeni UUID**, rebuild/reupload yok.
   Önce Boss workers.dev kapat; Access açık, previews kapalı. Tarihsel web hedefi
   **02c0da48-f3a2-47ad-99e0-8358b9244ac7**, Boss hedefi
   **85119d25-bc70-4871-a5f2-f9dcb3dbf896**; işlem öncesi GET ile tekrar pinle.
   Aynı versions deploy sözdizimiyle eski UUID@100% seçilir; komut deployment'tır.
   Web eski health636936f/asset/301/DB ID; eski Boss kapalı/AUD boş durumu güvenli
   deny503/kapalı URL olarak beklenir, owner200 beklenmez. Eski Boss production
   repo hedefini kullanabilir: kapalı kalır ve sandbox-only PAT başka repoya
   yazamaz. Sonra exact yeni UUID'ler re-promote, yeni health/Access/ayar kontrolleri.
10. Rollback D1 verisi/oylar/Git commit'leri/Access/DNS/URL/settings'i geri almaz.
    Secret version bağları/expiration/CSRF uyumu ve URL kapanışı ayrıca kontrol
    edilir. Test geçmişi veya mevcut kayıtlar silinmez, DB restore yapılmaz.
    Gerçek prova henüz yapılmadı. Final Hostinger log/oy snapshot'ları cutover'a
    yakın; mail ve manual-only90gün/DNDR çift saymama kararları aynı.

[Version/deployment modeli](https://developers.cloudflare.com/workers/versions-and-deployments/),
[rollback sınırları](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).
