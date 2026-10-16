# AmericaWhat — Onaylı staging tasarımı ve sınırlı iyileştirme

Tarih: 2026-10-14, America/Los_Angeles. Durum: yalnızca yerel uygulama.

## Son kamusal UI polish — e7d2116 sonrası

Proje sahibi yerel tasarım yönünü ve Trending’in reaksiyonlardan sonra görünmesini
kabul etti. Trending yeniden incelenmedi/yazılmadı/taşınmadı; ilgili ana sayfa ve
istemci kaynakları değişmedi.

Yalnızca iki ürün dosyası değişti: Base.astro içindeki hedefsiz dekoratif tagline
span kaldırıldı (About zaten footer’da); global.css’in mevcut footer bölümünde
üst/alt padding 28/48 → 24/32 px, contact/nav/newsletter/attribution üst boşlukları
10/20/26/22 → 8/16/18/14 px oldu. Newsletter başlığı 16 → 14 px, yardımcı metni
13 → 12 px, form yazısı 14 → 13 px ve form padding’i küçültüldü; dar ekranda
sarılmış Subscribe kontrolü merkezlenir. Logo/e-posta/yasal linkler, mevcut
renkler, Buttondown action/method/target/submit davranışı ve DNDR atfı korunur.
Yeni kolon, renk, metin veya dekorasyon yok.

Kategori sayıları (7 kategori), arşiv/sayfalama, sıralama/tekrarsızlık, footer
hedefleri ve Load More kontrollerinde yeni işlevsel kusur bulunmadı. 106/106 test,
162 sayfa, 0 statik güvenlik hatası, 3.652 iç bağlantı, 124 staging-eş kart ve
önceki metadata/URL karşılaştırması yeniden geçti. Yerel workerd önizlemesinde 10 parça GET’iyle 124 haberin tamamı tekrarsız
yüklendi; bu turda oy/beacon/form POST’u veya veri yazımı yapılmadı.
Grafik/mobil yerleşim testi yapılmadı; proje sahibi manuel inceleyecek.

Güvenlik ve Boss için yalnızca [audit](DEPENDENCY-AUDIT.md) ve
[entegrasyon hazırlığı](BOSS-INTEGRATION-PLAN.md) yapıldı. Aşağıdaki ilk uygulama
kaydı tarihsel kapsamını korur; hiçbir yükseltme veya Boss merge’i yapılmadı.

## Geçerli tasarım kararı

Onaylı kamusal görsel temel, [Cloudflare staging](https://americawhat-web-staging.hakan-c89.workers.dev/) görünümüdür.
Canlı `/api/health` bu çalışmada `release: 636936f`, 124 yayın ve `test-only`
ziyaret toplama bildirdi. Başlangıç dalı `dev/cloudflare-native`, commit
`4438907c26ac00180571a76a4bea7edac6f02c72`; dağıtılmış revizyonla arasındaki
fark yalnızca HANDOFF/CURRENT-STATE belgeleridir.

V1, V2 ve V3 **kamusal görsel yeniden tasarımları reddedilmiş deneylerdir**.
Bu karar önceki önerilerin yerine geçer. Deneylerin kodu, belgeleri ve Boss
iyileştirmeleri `design/editorial-casefiles` dalında, `40274dc979c4d57966bf7754e782282c256d9ebf`
ucunda ve `D:\IT\AmericaWhat\americawhat-redesign` worktree’sinde korunur.
Bu dal birleştirilmedi; Boss tasarımı bu çalışmaya alınmadı.

## Uygulanan üç iyileştirme

1. Ana sayfada ilk 12 haber; her aktivasyonda sonraki 12. V3’ün statik
   `/feed/N/` yaklaşımı, kimlik ile tekrar elemesi, erişilebilir durum bildirimi,
   yeni habere odak aktarımı, hata/tekrar deneme ve geçmiş/konum geri yüklemesi
   özgün `Card.astro` bileşenine uyarlandı. Bağlantı JavaScript olmadan tam
   sonraki sayfayı açar. Parçalar `noindex, follow` taşır ve sitemap dışındadır.
   Kontrol tam genişlikte, 8 px köşeli, saydam zeminli ve mevcut `--line`
   sınır rengindedir: **Load more stories ↓**. Yeni API veya veritabanı yoktur.
2. Menü sırası **Random? · Categories · Archive**. Random’ın kırmızı vurgusu,
   hareketi ve çalışan haber hedefi korunur. Kategori/Archive rotaları özgün
   kartları kullanır; kategori başına 12, arşivde 30 haber/sayfa. V3’ün
   `Pagination.astro` bileşeni ve rota/paginate yaklaşımı seçilerek kullanıldı;
   deneysel StoryCard/FeedPost, tema ve editorial yardımcıları alınmadı.
   Kategori çipleri yalnızca yüklenen 12 haber üzerinde filtre uygulamak yerine
   tüm kategoriye giden gerçek bağlantılardır; görünümleri korunur ve JS’siz çalışır.
3. Footer’da özgün logo, `hello@americawhat.com`, yedi gerekli bilgi/yasal/RSS
   bağlantısı, mevcut Buttondown formu ve DNDR Labs atfı tek sütunda düzenlendi.
   Formun endpoint’i ve işlevsel HTML’si değişmedi; abonelik gönderimi denenmedi.

V3’ün `aw:feed-append` olayına dayalı reaksiyon bağlama yaklaşımı alındı.
Tekrarlanan bağlamalar/okumalar engellenir; yalnızca eklenen kartlar aktarılır,
indirilen belgenin betikleri çalıştırılmaz. Sayfa görüntüleme sayılmaz; normal
sayfa açılışında mevcut POST beacon çalışır. Trending, yalnızca ilk 12 üzerinden
değil bütün yayınların hafif başlık/URL/kimlik listesi üzerinden sıralanmaya devam eder.

## Görsel koruma kanıtı ve sınırları

- `Card.astro`, haber detay kaynağı, içerik JSON’ları, slug üretimi ve mevcut
  global CSS kuralları değiştirilmedi. Ek CSS yalnızca yeni kontrol/listeleme,
  footer, bağlantı çipleri ve dar ekran menüsünü kapsar. Marka token’ları,
  fontlar, kart genişliği/zemini/kenarlığı/köşeleri, yorum ve reaksiyon
  stilleri, kart aralıkları, ana zemin ve hero korunur.
- Başlangıç derlemesinin `about.e79auZgE.css` dosyası canlı staging CSS’siyle
  byte düzeyinde aynı: SHA-256 `62b8f6a2b34ceb7b4a7172c31e72949d784ff48f5369c83cf7ac5eb6f21838ee`.
- Tüm 124 haber kartının üretilen DOM HTML’si canlı staging’den alınan
  karşılıklarıyla birebir aynı bulundu.
- Daha uzun menünün sığması için 420 px ve altında başlık iki satıra geçebilir;
  bu ekranlarda başlık yüksekliği artar. Masaüstü başlık ölçüleri korunur.
- Grafik tarayıcı, ekran görüntüsü, gerçek klavye/ekran okuyucu veya cihaz
  testi yapılmadı. Flex sarımı, gerçek bağlantılar, odak aktarımı ve DOM
  davranışı denetlendi; piksel düzeni/yatay taşma için manuel önizleme gerekir.

## Çalışma alanı ve doğrulama

Dal: `design/staging-refinement`. Worktree:
`D:\IT\AmericaWhat\americawhat\tmp\staging-refinement`.
Değişiklik commit’i bu dalın HEAD’idir: `git log -1 --format="%h %an <%ae> %s"`.
Henüz hiçbir ortama dağıtılmadı, uzak Git’e gönderilmedi veya birleştirilmedi.

| Gerçekten çalıştırılan kontrol | Sonuç |
|---|---|
| `npm test` | 106/106; mevcut 100 + 6 yeni DOM davranış testi |
| `npm run build` | 162 HTML sayfası |
| `npm run verify:static` | 0 hata; 9 eski sunucu dosyası asset yüklemesinden dışlanır |
| `npm run verify:refinement -- --baseline reports/baseline-dist --staging reports/staging-home.html` | 124 haber, 11 parça, 3.652 iç bağlantı; kartlar, tam yorum/kaynak/reaksiyonlar, kategori/arşiv kapsamı, Random, eski SEO, hero ve abonelik formu doğrulandı |
| Aynı doğrulayıcıda RSS/sitemap | RSS yalnızca doğal `lastBuildDate` farkı dışında aynı; 131 eski sitemap URL’si korunur, 20 kategori/arşiv URL’si eklenir; feed parçaları dışarıda |
| `node scripts/parity/compare-live.mjs https://americawhat-web-staging.hakan-c89.workers.dev --pages 40` | 40 sayfada canonical/title/OG/JSON-LD farkı yok; kayıp URL yok; `/about` → 301 |
| Yerel workerd + gerçek HTTP + DOM | 10 parça GET’iyle 124 benzersiz haber; ilk/eklenen kart oyu başarılı; tekrarlanan oy 1; tek beacon POST; 4 özel yol 404 |
| `git diff --check` | Temiz |
| `npm audit --json` | Başarısız güvenlik durumu: 4 orta, 16 yüksek, 1 kritik; ayrı bakım gerekli |

`linkedom` yalnızca geliştirme/test bağımlılığı olarak eklendi; tarayıcı
paketine alınmaz. Mevcut OG dosyaları ana AmericaWhat checkout’undan bu
worktree’ye kopyalandı; OG üreticisi değiştirilmedi/yeniden çalıştırılmadı.
Yerel workerd testleri bu worktree’nin `.wrangler/refinement-state` kopyalarını
kullandı. Uzak veritabanları okunmadı/yazılmadı; canlı sağlık kontrolü hariç
veri katmanı yeniden denetlenmedi. Boss kodu değişmediği için Boss önizleme
testi yeniden çalıştırılmadı. Ham karşılaştırma çıktıları `reports/` altında
yereldir ve Git dışıdır.

## Bağımsız teknik değerlendirme — kapsam dışında

Mevcut tasarımı korumak en uygun yaklaşım: beğenilen görsel kimliği korur,
değişken sayısını azaltır ve geçiş riskini backend taşınmasından ayırır.
V3’ün statik parça mantığı uygundur; bütün deneysel dalı almak, tema/Boss/
detay sayfası bağımlılıklarını gereksizce taşır. Özellikle eski kategorilerin
yalnızca ilk parçada filtrelenmesi, eklenen reaksiyonların bağlanmaması,
Trending’in ilk 12’ye daralması ve tekrar beacon çalıştırılması riskleri bu
uyarlamada ele alındı.

Kalan riskler/öneriler:

- Kilitli Astro 4 ve ilişkili araç zincirinde audit açıkları bulunuyor. Yeni
  çalışma bunları gidermiyor. Statik yayın modeli SSR bulgularının tümünü
  doğrudan uygulanabilir kılmaz; ayrı bağımlılık yükseltmesi ve etki incelemesi
  dağıtım öncesinde yapılmalı. Geliştirme sunucusu loopback ile sınırlıdır.
- Yeni yayın sırasında zaten açık bir sayfanın sonraki statik parça sınırları
  değişebilir; kimlik elemesi tekrarları önler fakat tutarlı yeni sıralama için
  sayfayı yenilemek gerekir. Arşiv tüm yayını erişilebilir tutar.
- Oy verme mevcut iyimser istemci davranışını korur; başarısız POST sonrası
  geri alma/yeniden deneme ayrı bir iyileştirme olabilir.
- Manuel 320/375/768/1280 px görünüm, gerçek klavye/ekran okuyucu ve
  Buttondown/Formspree teslim kontrolü önerilir; bu çalışmada yapılmış sayılmaz.
- Boss iyileştirmeleri daha sonra ayrı seçici entegrasyonla değerlendirilmelidir.

Üretim taşıması için mevcut `CLOUDFLARE-MIGRATION.md` önkoşulları geçerlidir:
Hostinger envanter/yedek, Boss staging Access onayı, Workers planı, gizlilik/
saklama ve mevcut staging verisi kararları, DNS/mail kayıt kontrolü,
production kaynak/secret hazırlığı, veri aktarımı ve geri dönüş planı, ayrı
merge/deploy/cutover onayı. Bu çalışmanın tamamlanması bu onayları sağlamaz.

Önizleme komutları `OPERATIONS.md` içindeki güncel sınırlı iyileştirme bölümündedir.
