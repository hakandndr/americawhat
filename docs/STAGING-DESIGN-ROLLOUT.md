# AmericaWhat staging — tipografi, footer ve Analytics tasarımı

15 Ekim 2026. Sürekli staging yetkisiyle yapıldı. Production, DNS, Hostinger,
başka proje/Worker/D1 ve Access ayarı değişmedi. Önceki 720be24 paketi ve
UUID'leri rollback için korunur.

## Dağıtılan sürüm

| Alan | Değer |
|---|---|
| RELEASE_ID | 38096fa03f52c87b5049eaf00911f9590a09fa82 |
| Web version / trafik | 09efe0f7-3384-49ae-a627-7c15c34f2ba5 / %100 |
| Boss version / trafik | 3c28937a-44fd-4f46-b39b-c59d71587d50 / %100 |
| Rollback hedefleri | Web 9c3cb1c3-124b-4e52-a63d-bca74bf379e1, Boss 5b3267a9-3cf6-4cea-bc51-bcc3bd2cdbbb |
| Paket | reports/design-candidate, reports/design-release-manifest.json (SHA256 c3792f41a75574a142ba7187f832f5ab8c7c9df0a062af18feb7cd4c8531dfc5, 321 dosya) |

`build:rc` (315 statik dosya: 309 + 6 woff2) → iki Worker için
`deploy --dry-run --outdir` frozen bundle → `verify-staging-candidate` PASS →
`versions upload --no-bundle` (secret'lar mevcut version'dan miras; yalnız
adları kontrol edildi) → önce Web, sonra Boss `versions deploy UUID@100%`.
125 onaylı OG yeniden üretilmedi.

## Tipografi flaşı

Kök neden: Anton/Archivo Google Fonts'tan `display=swap` ile geliyordu. woff2
istekleri ancak üçüncü taraf CSS çözüldükten sonra başlar; `swap` ilk kareyi
fallback ile boyar. Soğuk önbellekli Chrome'da eski staging ilk karesi Anton
yerine Arial, Archivo yerine Segoe UI; fallback'siz `font-family:'Archivo'`
kuralları yüzünden logo Times (serif). Yavaşlatılmış ağda fallback ~700 ms
görünür kaldı. Production HTML'i aynı font bağlantılarını kullanır (Hostinger
bot kontrolü başsız ölçümü engelledi; fark büyük olasılıkla site başına
ayrılmış tarayıcı önbelleğidir).

Çözüm: fontlar `src/assets/fonts` altında (OFL 1.1), Google'ın yüz/ağırlık/
unicode-range tanımlarıyla birebir `@font-face`; Vite hash'li `/_astro/` adresi
ve mevcut immutable cache kuralı. Base.astro üç latin dosyasını `<head>`
başında preload eder; `font-display:block`. Font yığınları `--font-body` /
`--font-display` token'ları. Üçüncü taraf font bağlantısı kalmadı.

Ölçüm: canlı soğuk önbellekte font yüklemesi ilk metin karesinden önce bitiyor
ya da metin görünmez kalıp doğrudan nihai fontla çiziliyor; fallback font hiçbir
karede görünmedi. Yavaş ağda (150 ms, 1.6 Mbps) ilk ~250 ms sayfa iskeleti metinsiz
görünür; bu `block` seçiminin bilinçli bedelidir.

## Kısa sayfa footer'ı

Önceki düzen kalan yüksekliği `main`'e veriyordu; boşluk içerik alanında
kalıyordu. Artık body sütununda kalan yüksekliği footer alır ve footer
`--night-deep` yüzeyli bir "zemin" bandıdır; içeriği üstte hizalı. Uzun
sayfalarda büyüme sıfırdır. Footer/subscribe kuralları tek blokta birleşti
(önceki override zinciri kaldırıldı).

## Boss Analytics

Header ve içerik tüm Boss sayfalarında tek `--shell:1320px` genişliğini
paylaşır. Analytics: özet paneli (ana sayı, human/automated oran çubuğu,
ikincil metrikler) + boş günleri sıfır gösteren yığılı günlük grafik; kompakt
filtre çubuğu ve aktif ikincil filtre varsa açık gelen "More filters";
iki satırlık grid olay akışı, Details satırın altında tam genişlik çekmece;
dar ekranda kart. IP activity aynı yapıyı kullanır. Region id'leri, canlı
filtre, IP/IP Visits bağlantıları, sayfalama/snapshot, CSV/NDJSON, ham
alanlar ve veri/retention politikası değişmedi.

## Doğrulama

- 147/147 test; 19/19 yerel workerd Boss smoke; verify:static, verify:refinement PASS.
- verify:public-parity: 162 sayfa body DOM onaylı baseline ile aynı; CSS
  bilinçli olarak farklı (font/footer), bu yüzden CSS adımı beklenen şekilde durur.
- Yerel tarayıcı: canlı ülke filtresi, tarih aralığı, ikincil filtre, IP→Back
  (filtre korunur), Details çekmecesi, CSV indirme, Next/Last; 1440/1280/1024/
  768/390 px'te yatay kaydırma yok. Tek konsol hatası Boss'un önceden de olmayan favicon'u (404).
- Canlı: 21/21 HTTP smoke; health RELEASE_ID yeni SHA; Boss 5 yolda anonim
  302→Access; public /analytics/ip 404.

Doğrulanamayan: canlı Boss'un owner oturumlu görünümü (oturum yok, giriş
denenmedi). Görsel kanıtlar `reports/design-visual/` (Git dışı).

## Bilinen açık nokta

Ana sayfadaki Trending bloğu reaksiyon API'sinden sonra istemci tarafında
eklenir ve kartları aşağı iter (production'da da aynı). Kalıcı çözüm Web
Worker'ın ana sayfa HTML'ine trending'i sunucu tarafında yerleştirmesidir;
backend değişikliği olduğu için bu sürüme alınmadı.
