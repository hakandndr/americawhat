# AmericaWhat staging — gerçekleşen rollout

2026-10-15. Kullanıcının bu oturumdaki açık ve sürekli staging yetkisiyle
upload, activation, mevcut dosyadan secret kurulumu, Boss URL açılışı, canlı
testler ve rollback/re-promote tamamlandı. Önceki hazırlık belgelerindeki
"ayrı onay bekleniyor / deploy yapılmadı" ifadeleri tarihsel aşamaya aittir.
Rutin staging işlemleri için tekrar onay gerekmez; diğer proje/production
sınırı korunur.

## Çalışan adresler ve sürümler

| Alan | Değer |
|---|---|
| Public staging | https://americawhat-web-staging.hakan-c89.workers.dev |
| Boss staging | https://americawhat-boss-staging.hakan-c89.workers.dev |
| İki Worker RELEASE_ID | 34d40c0f3c84c789fe22f462c9ef6affd06e268b |
| Web version, trafik | 7e315208-ef9b-4b8b-ac10-48d7419ef9e2, %100 |
| Boss version, trafik | 7fa88813-9247-4f02-b784-67e1b92a65f2, %100 |
| Boss URL ayarı | enabled=true; previews_enabled=false |
| Access | mevcut dndr-staging-owner-only; hakan@dndr.net; All traffic |
| İçerik yazım hedefi | yalnız hakandndr/americawhat-staging-content / content-staging |

Access app/policy değiştirilmedi ve yetkisiz Access API isteği tekrarlanmadı.
Anonim ana sayfa/Analytics/Review/Published yolları Access girişine302 döndü.
Owner, hakan@dndr.net ile gerçek tarayıcı girişinin başarılı olduğunu bu
oturumda doğruladı. Computer Use kullanılmadı; cookie/JWT/OTP alınmadı.

## Artifact ve secret sınırları

Yükleme, onaylı reports/predeploy-candidate içindeki frozen bundle/config ve
assets üzerinden --no-bundle ile yapıldı; yeniden build yok. 316 dosya, ZIP
ve manifest hash'leri önceki onayla aynı. Manifest SHA256
120d4811a3a5be9018c9a360b85a56d23891536903c767fa42c16b088a0cf67d;
ZIP SHA256 a9333e650dbc8d2dd7ef8cb8984e3cf6625eb7edc135af179eda09f044ea2d24.
Frozen hazırlık notları ve eski operator helper kopyası bilerek değiştirilmedi.

Clipboard helper düzeltmesi b00a78b5a1a8692145d161b6644c3739c8f2cdc3 yerel
commit'idir; Worker kaynak SHA'sını değiştirmez. Sonraki dokümantasyon commit'i
de deployed RELEASE_ID değildir. Eski HEAD=RC doğrulayıcısı farklı operator
HEAD'de bilerek durur; yeni upload gerekirse kaynak/runtime farkları ayrıca
değerlendirilir. Eski hazırlık receipt'i körlemesine yeniden çalıştırılmaz.

Boss GITHUB_TOKEN ve BOSS_CSRF_SECRET mevcut owner-only, repo dışı dosyadan
tek version upload --secrets-file ile kuruldu. Web'in REACTION_GUARD_SECRET ve
STAGING_TEST_KEY secret binding'leri korundu. Değerler çıktıya/rapora/Git'e
aktarılmadı. Korumalı dosya içerik backup'ına katılmadı. Wrangler request log
sanitization açık tutuldu; payload outfile oluşturulmadı.

Başlangıçta miras alınan geçersiz ortam Cloudflare API token'ı yalnız komut
alt süreçlerinde kaldırıldı; mevcut Wrangler OAuth oturumu otomatik yenilendi.
Kalıcı kullanıcı ortamı veya başka proje credential/config'i değiştirilmedi.

## Canlı test sonuçları

- Public HTTP smoke: 23/23 PASS; ana/item/RSS/sitemap/OG,301/404, güvenlik
  başlıkları, kapalı legacy/private yollar, health, GET yazmama, cross-origin
  POST reddi, reaksiyon tekrar koruması ve analytics beacon yazımı.
- D1: gerçek staging analytics üzerinde All/today/device/empty filtre,
  summary/pagination/First-Last/daily/top tutarlılığı PASS. 37 salt okunur
  sorgu; 0 satır yazım; ölçülen duration0.2338–1.6298ms, rows_read0–65.
  Test beacon'ı aynı event UID ile iki istekten tam bir satır oluşturdu.
- HTTP ölçümü: 7 endpoint x5 istek, tümü200; endpoint medyanları40–108ms,
  örnek p95 değerleri88–186ms. Bunlar istemci elapsed ölçümleridir, CPU değildir.
- GitHub canlı backend entegrasyonu: geçici iki sandbox adayını tek atomik
  transaction ile onay/red, replay'de yeni commit oluşturmama, edit ve slug
  koruma PASS. Test fixture'ları kaldırıldı; published/pending başlangıç
  metinleri byte olarak geri korundu. Sandbox dalında4 owner commit'i kaldı;
  son HEAD2d2411e4930d02bb2b4079f320578f1f58f42670. Force push yok.
  Test branch'i Web'i otomatik rebuild etmez; Actions kapalı kalır.
- Bu GitHub testi, deploy edilen kaynakla aynı modüllerin gerçek sandbox
  API'larına çağrısıdır; authenticated Boss HTTP form/audit/CSRF uçtan uca
  otomasyon testi olarak sunulmaz. Owner login manuel doğrulandı; gerçek
  authenticated form submit ve farklı kullanıcıyla login testi otomatik
  yapılmadı. Bu oturumda gözlenen işlevsel hata yok; bu alan test sınırıdır.
- Cloudflare Workers GraphQL ölçümü, yalnız iki staging scriptName ve
  10:23:10–10:28:18 UTC penceresi: Web105 istek/0 hata, CPU P50/P99
  462/4755µs; Boss3 istek/0 hata, CPU P50/P99 5788/118837µs. Düşük örneklem
  ve ilk giriş/JWKS maliyeti dahil; sıcak trafik veya yük kapasitesi iddiası
  değildir. CPU P95 ölçülmedi. Yüksek hacimli sentetik D1 seed yapılmadı.

[Workers GraphQL ölçüm yöntemi](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/).

## Gerçek rollback ve aynı version'a dönüş

Boss workers.dev önce kapatıldı; preview kapalı ve Access değişmeden kaldı.
Web02c0da48-f3a2-47ad-99e0-8358b9244ac7 ve
Boss85119d25-bc70-4871-a5f2-f9dcb3dbf896 %100 aktive edildi. Metadata ve
eski Web health RELEASE_ID636936f doğrulandı. İlk anlık HTTP isteği önceki
edge sürümünü gördüğünden kısa, sınırlı no-store kontrolüyle yayılım beklendi.
Sonra yukarıdaki aynı yeni Web/Boss UUID'leri yeniden %100 aktive edildi;
yeni health SHA ve anonim Access302 doğrulandı. Rebuild/reupload yapılmadı.
Boss URL yeniden enabled=true/previews=false yapıldı. Eski Boss açıkta kalmadı.

İleride rollback gerektiğinde aynı sıralama ve exact UUID'ler kullanılır:
önce Boss URL kapatılır; versions deploy <UUID>@100% ile yalnız staging
hedeflenir. D1/Git verisi, Access policy, URL/settings rollback'in parçası
değildir. D1 restore/delete/seed/migration ve production işlemi yapılmaz.

## Kapsam ve kanıtlar

americawhat.com, production kaynak/veri, DNS, Hostinger/email ve başka proje,
repo, Worker, D1 veya Access ayarı değiştirilmedi. Production repo'ya test
isteği/yazımı yapılmadı. Uygulama main'e merge/push edilmedi; AI attribution
eklenmedi. Mevcut staging verisi silinmedi/import edilmedi.

Secret içermeyen yerel receipt'ler (reports git-ignored):
staging-rollout-baseline.json, staging-upload-receipt.json,
staging-live-test-receipt.json, staging-editorial-receipt.json,
staging-cpu-receipt.json, staging-rollback-old-state.json ve
staging-final-remote-state.json. staging-completion-receipt.json ayrıca son
%100 trafik, frozen vars eşitliği, korunmuş secret adları ve URL ayarlarının
kontrolüdür. Owner PAT expiry2026-11-14; süresi
dolmadan sandbox-only token rotation yapılır, secret değerleri gösterilmez.
