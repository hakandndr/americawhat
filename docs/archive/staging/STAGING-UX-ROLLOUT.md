# AmericaWhat staging — footer ve IP Analytics iyileştirmesi

15 Ekim 2026, America/Los_Angeles. Bu sprint kullanıcının sürekli staging
yetkisiyle tamamlandı. Production, DNS, Hostinger/email ve başka proje sınırı
korundu. Önceki34d40c0 release, manifest ve arşivleri değiştirilmeden tutuldu.

## Dağıtılan sürüm

| Alan | Son durum |
|---|---|
| Public | https://americawhat-web-staging.hakan-c89.workers.dev |
| Boss | https://americawhat-boss-staging.hakan-c89.workers.dev |
| RELEASE_ID | 720be24b20df976d34115ad4c5ca59f1d70ae0a6 |
| Web version / trafik | 9c3cb1c3-124b-4e52-a63d-bca74bf379e1 / %100 |
| Boss version / trafik | 5b3267a9-3cf6-4cea-bc51-bcc3bd2cdbbb / %100 |
| Boss koruması | mevcut owner-only Access; hakan@dndr.net; previews kapalı |
| Paket | reports/overnight-candidate; reports/overnight-release-manifest.json |

Kaynak feature commit'i720be24'tür. Sonraki devir/durum dokümantasyon commit'i
deployed RELEASE_ID olarak kullanılmaz. Tek Astro RC build'i309 dosya/162 sayfa/
124 içerik üretti; statik upload listesi300 dosya. 125 onaylı OG dosyası hash ile
korundu ve yeniden üretilmedi. Web/Boss local bundle'ları donduruldu; upload
- -no-bundle ile bu dosyalardan yapıldı. Gerekli mevcut secret binding'leri
versiyonlara miras kaldı; secret değerleri okunup raporlanmadı veya Git'e alınmadı.

Manifest SHA25680d41d2e430adb8fac1eea465551d13c3192f3f8ca7b04b05b7934195e0bd013;
ZIP SHA25684ff9a1114c049a7f12650c2b167ef7a8f8eb346e4494301ccb3f23ebabd1109.
Donmuş pakette315 dosya bulunur; bundle çıktıları/metadata rapor dizinindedir,
public upload sadece dist ve iki açıkça seçilmiş index.js dosyasını kullanır.

## Footer düzeltmesi

Ortak body100vh minimum yüksekliğe sahipti, fakat main kalan alanı almıyordu.
Bu nedenle kısa sayfa footer'ından sonra viewport boşluğu kalıyordu. Ortak CSS
body'yi flex-column/100dvh (100vh fallback) yaptı; main.wrap kalan alanı alır,
header/hero/footer küçülmez. Sabit footer, spacer veya route özelinde yükseklik
eklenmedi. Base layout'u kullanan About, Categories, Contact/legal, item, feed,
home ve archive şablonlarına aynı kural uygulanır.

Eski gerçek About DOM'u1440x1000 pencerede footer'ı yaklaşık850px'de bitiriyordu;
yeni düzen1000px'de bitirir. Ana sayfanın hero yüksekliği/main başlangıcı/footer
başlangıcı önceki onaylı DOM ile aynı kaldı. Uzun sayfalarda footer içerik
sonrasındadır; örtüşme veya footer altında yapay boşluk yok.

## Analytics ve IP detayları

Analytics çalışma alanı1920px'e kadar genişler. Yedi okunabilir sütun; IP ve
IP Visits mavi, gerçek ve klavyeyle kullanılabilir bağlantılardır. Uzun IPv6,
sayfa/referrer değerleri tam title metni ve native Details ile korunur. Dar
ekranlarda tablo1000px altında iki sütunlu,520px altında tek sütunlu kartlara
dönüşür. Ham alanlar kaybolmaz; tüm değerler Details ve CSV/NDJSON'da kalır.
Genel .kv minimum genişlik zorlaması da kaldırıldı; diğer Boss bölümleri
yeniden tasarlanmadı.

Yeni owner-protected GET /analytics/ip?address=... aynı Access/JWT kontrolünden
geçer. Şunları gösterir: retained page views (IP Visits), ilk/son kayıt zamanı,
aktif PT günleri, farklı sayfalar, kaynak ve human/automated sayıları; zaman
damgasına göre yeni→eski geçmiş, lokasyon, sayfa/referrer, cihaz/browser/UA ve
tüm ham kayıt alanları. Aynı zaman damgasında durable ID sıralamayı sabitler.
IP başına olay sayısı kişi/oturum değildir. IP Visits bütün mevcut retained
kayıtları saymaya devam eder; geçmiş ve export üst ID snapshot'ını korur.
Back bağlantısı ana Analytics filtre/sayfa/snapshot durumunu geri getirir.

IP biçimi ve pagination doğrulanır; hatalı giriş owner auth'tan sonra400 döner.
SQL değerleri bound parameter'dır, çıktı escape edilir; Back yalnız yerel
/analytics yoluna izin verir. Geçmiş üç salt okunur sorgu kullanır: IP indeksli
sayfa sınırları, tek-address aggregate ve sınırlı sayfa hydration'ı. Per-row
network/N+1 yok; yeni migration veya indeks gerekmedi. Manual-only90 gün
retention, mevcut veriler, live filtreler, chart'lar ve export formatları korundu.

## Tamamlanan doğrulamalar

- 147 unit/integration testi PASS; buna IPv4/IPv6, hatalı/tekrarlı parametre,
  XSS/SQL safety, yetkisiz/farklı email, snapshot appends, kronoloji ve timestamp
  eşitliği, doğrudan Last/boundaries, export/IP count ve Back sürekliliği dahil.
- 19 gerçek local workerd testi PASS. Yeni IP route için401/400/200 ve geçmiş
  bağlantısı dahil. Tüm yazım/retention fixture testleri yalnız local izole D1
  ve in-memory GitHub'da çalıştı; staging verisi reset/seed/import edilmedi.
- Gerçek üretilmiş DOM ile localhost başsız Chrome:390/768/1440/1920px,
  20 footer ve20 ilgili Boss ekranı kontrolü PASS. Analytics tablo scrollWidth'i
  desktop1440'da1380/1380,1920'de1846/1846px; yatay scrollbar yok. Açık Details,
  canlı ülke filtresi, First/Last, klavyeyle IP, IP Visits, filtreli/snapshot'lı
  Back ve JavaScript kapalı mobil gezinme PASS.
- Canlı staging:21 HTTP smoke PASS;16 render edilmiş public footer kontrolü
  PASS. Load More12→24 kart ve Random klavye navigasyonu200 PASS. Random'ın
  tasarıma ait animasyonu otomasyonun stable-pointer beklemesini tetikledi;
  aynı kontrol gerçek klavye aktivasyonu ile tamamlandı, uygulama değiştirilmedi.
- Yeni IP route/export/script dahil5 anonim Boss yolu mevcut team Access
  girişine302 döndü. Public /analytics/ip yolu404; IP/raw event public leak yok.
- Gerçek staging analytics D1'ında IP geçmişi ve First/Last salt okunur
  kontrolleri PASS.9 sorgu0.2644–1.4525ms, rows_read1–14, rows_written0;
  mevcut retained kayıt sayısı değişmedi. Gerçek IP ve event gövdeleri receipt'e
  yazılmadı. Düşük veri hacmi nedeniyle bu sonuç yüksek yük kapasitesi iddiası
  değildir.
- Cloudflare GraphQL, yalnız iki staging scriptName, PDT10:14:37–10:18:25:
  Web140 istek/0 hata, CPU P50/P99 536/3314µs (0.536/3.314ms). Yeni Boss için
  ölçüm penceresinde Worker invocation örneği yok; CPU ölçüldü denmez. Anonim
  istekler Access'te kesildi. CPU P95 ölçülmedi. Bu sorgular başka Worker verisi
  istemedi; Access API403 tekrarlanmadı.

Yerel testte Windows8950 portunu reddetti; mevcut8788 portuna geçilip workerd
kontrolü tamamlandı. Bu çözülmüş yerel kısıttır, staging engeli değildir.

## Yarın owner oturumuyla yapılacak manuel kontroller

Yeni staging Boss sürümünde authenticated interaktif test yapılmadı. Kullanıcı
uyurken giriş/cookie/OTP istenmedi, mevcut tarayıcı oturumuna erişilmedi;
Computer Use kullanılmadı. Önceki owner login doğrulaması eski rollout'a aittir.
Authenticated akışın yerel gerçek router/workerd ve izole tarayıcı testleri
geçti; canlı owner-session UI doğrulaması yerine sunulmaz.

1. Boss'a owner olarak girip Analytics'te normal desktop genişliğinde tabloyu,
   mobil kartları ve tam kayıt Details'ı kontrol edin.
2. Bir filtre+sayfa seçip IP ve IP Visits bağlantılarını açın. Count tanımını,
   kronolojiyi ve Back ile aynı filtre/snapshot'a dönüşü doğrulayın.
3. Detail ve filtreli görünümden CSV/NDJSON indirin; canlı filtre ve First/
   Previous/Page/Next/Last gezinmesini kontrol edin. Gerçek kayıtlarda silme/
   import veya retention işlemi gerekmez.

Gözlenen açık işlevsel hata yok; canlı authenticated UI ve yeni Boss CPU
örneklemi eksik doğrulamalardır. Başka kullanıcıyla gerçek Access login/logout
testi yapılmadı; auth/CSRF hiçbir yerde gevşetilmedi.

## Hazır rollback ve kanıtlar

Bu sürümde gözlenen işlevsel hata olmadığından yeniden rollback/re-promote
yapılmadı. Önceki sprintte gerçek rollback testi tamamlanmıştı. Bu sprint
başlangıcındaki exact hedefler kaydedildi:

- Web7e315208-ef9b-4b8b-ac10-48d7419ef9e2.
- Boss7fa88813-9247-4f02-b784-67e1b92a65f2.

Gerektiğinde sadece bu staging isimleriyle versions deploy UUID@100% kullanılır;
aktif Access owner-only ve preview=false korunur. Şüphede önce Boss workers.dev
kapalı tutulur. Bu iki önceki sürüm de sandbox Git hedefine ve doğru AUD'ye
sahiptir. Daha eski history sürümlerinde önceki runbook'un kapalı Boss kuralı
geçerlidir. D1/Git verisi, Access/DNS/URL ayarı deployment rollback'iyle geri
alınmaz. Rebuild veya latest/tag seçimi yerine kaydedilmiş exact UUID kullanılır.

reports/overnight-baseline.json, overnight-release-manifest.json,
overnight-upload-receipt.json, overnight-tests.tap, overnight-workerd.log,
overnight-browser-local.json, overnight-browser-built.json,
overnight-live-receipt.json, overnight-d1-receipt.json,
overnight-cpu-receipt.json ve overnight-completion-receipt.json yerel kanıtlardır.
Visitor gövdeleri veya secret değerleri raporlanmaz; görüntüler sentetik
localhost veya public staging içeriğidir. Rapor/paketler Git'e veya public
assets'e eklenmedi.

Diğer siteler/projeler, production GitHub dalları, live americawhat.com,
production veri/analytics, DNS, Hostinger ve email değiştirilmedi. TürkiyeCennet
kaynaklarına dahi erişim gerekmedi. Sandbox'a bu sprint yeni commit veya test
içeriği yazılmadı. Owner Git author/committer kimliği korundu; push/merge ve
attribution eklemesi yapılmadı.
