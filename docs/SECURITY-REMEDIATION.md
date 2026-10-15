# AmericaWhat — Yerel güvenlik iyileştirmesi

2026-10-14 (America/Los_Angeles). Başlangıç `16b10a4ae5532bedb139aeab7fe36bccbb9bc759`;
ayrı dal `codex/security-boss`, worktree `D:\IT\AmericaWhat\americawhat\tmp\security-boss`.
Onaylı `design/staging-refinement` dalı değiştirilmedi. Bu rapor Phase A sonucudur;
Boss UI entegrasyonu ayrı commit’tir. Hiçbir uzak dağıtım/yazım yapılmadı.

## Yükseltmeler ve karar

| Paket | Önce | Sonra |
|---|---|---|
| Astro | 4.16.19 | 7.3.8, exact |
| @astrojs/sitemap | 3.1.6 | 3.7.4, exact |
| Wrangler | 4.147.0 | 4.151.0, exact |
| Vite | 5.4.21 | 8.3.4; vitefu peer kopyası tekilleştirildi |
| HTTP cache semantics | 4.2.0 | 4.3.0, mevcut Astro aralığı içinde |
| Sharp | 0.33.5 / 0.35.4 | 0.35.5 |
| esbuild | 0.21.5 / 0.28.1 | 0.28.2 (Wrangler zinciri) |

Node engine `>=22.12.0 <23`; test ortamı 22.23.2. Diğer transitif sürümler
lockfile’da kayıtlıdır. `npm audit fix --force` ve overrides kullanılmadı.
Eski lockfile’dan kalan Vite 5 peer’i, vitefu’nun desteklediği `^8` aralığında
`npm update vite http-cache-semantics` ile çözüldü. Yeni doğrudan Vite/Sharp/
esbuild bağımlılığı eklenmedi. `npm ci` ile temiz yeniden kurulum doğrulandı.

Güncel registry’de kararlı kök sürümler bunlardı. Wrangler kendi desteklenen
zincirinde Miniflare `5.20261012.0-beta` kullanıyor; bu transitif prerelease
gizlenmiyor. Önceki Wrangler da alpha kullanıyordu. Elle farklı/uyumsuz bir
Miniflare zorlanmadı; gerçek workerd testleriyle doğrulandı.

[Astro v5](https://docs.astro.build/en/guides/upgrade-to/v5/),
[v6](https://docs.astro.build/en/guides/upgrade-to/v6/) ve
[v7](https://docs.astro.build/en/guides/upgrade-to/v7/) migration gereksinimleri
incelendi: doğrudan script yerleşimi, Node 22.12 tabanı, Vite 8 ve Rust
compiler değişiklikleri bu repo için ilgilidir. Content collections, SSR
adapter, Actions veya ViewTransitions geçişi gerekmedi. Sitemap uyumu yeni
sürüm ve üretilen URL/SEO setiyle test edildi. CI zaten Node 22 kullanıyor;
production deploy workflow’u değiştirilmedi.

## Görsel dondurma kanıtı ve test değişikliği

`git diff 16b10a4 -- src` boş: CSS, renkler, fontlar, hero, kartlar, haber
detayları, Trending, footer ve istemci kaynakları **değişmedi**.

Vite 8’in yeni varsayılan CSS minifier’ı alpha renklerini hex’e yuvarlayıp
deklarasyonları yeniden sıralıyordu. Bunu zorlamak yerine yalnızca
`vite.build.cssMinify:false` açıkça ayarlandı. Kaynak renk değerleri korunur;
CSS dosyası biraz daha büyüktür. Gzip/staging performansı ileride ölçülmelidir.

Astro 7 compiler’ı girinti/satır sonlarını farklı serileştirir; bu yüzden ham
HTML byte eşitliği doğru karşılaştırma değildir. `html-contract.mjs` yalnızca
normal HTML’de çöken ASCII biçimlendirme boşluklarını normalleştirir; tag,
attribute, içerik ve sıra karşılaştırılır, pre/textarea/script/style korunur.
Eski kontrol artık `stagingCardContractsIdentical` raporlar; byte eşitliği
iddia etmez. Tam yorumlar, kaynak URL’leri ve metadata ayrıca aynen denetlenir.

Yeni public parity kontrolü 162 sayfanın body sözleşmesini, aynı esbuild
0.28.2 parser’ı ile CSS eşdeğerliğini ve değişmeyen `src/` ağacını doğrular.
Kasıtlı istisnalar: compiler’ın görünmeyen whitespace’i, ayrı test edilen
script düğümleri ve build başına değişen Random fallback hedefi. Gerçek
derlenmiş ES modülleri de DOM içinde yerel workerd ile çalıştırılır; böylece
script yerleşim farkı yalnızca kaynak testleriyle geçiştirilmez.

## Gerçek çalıştırma sonuçları

| Kontrol | Sonuç |
|---|---|
| `npm ci` | Başarılı, lockfile tekrar kurulabilir |
| `npm audit --json` | **0 bulgu**, çıkış 0; önceki 21/1 kritik kalmadı |
| `npm test` | 106/106 |
| `npm run build` | 162 HTML sayfası |
| `npm run verify:static` | 309 dosya, 300 upload, 9 dışlanan; 0 hata |
| `npm run verify:refinement -- --baseline reports/approved-dist --staging reports/staging-home.html` | 124 haber, 11 parça, 3.652 iç bağlantı; SEO/RSS/sitemap ve kart sözleşmeleri aynı |
| `npm run verify:public-parity -- --baseline reports/approved-dist --ref 16b10a4` | 162 body, CSS ve public kaynak aynı |
| `npm run test:web-client -- http://127.0.0.1:8817` | Gerçek build modülleri; ilk 12 + 10 chunk GET ile 124 benzersiz haber; ilk/eklenen oylar; homepage ve detayda birer beacon; uzak istek 0 |
| İki Worker `deploy --dry-run --metafile` | Başarılı, upload yok; web 8 / Boss 20 girdi, npm runtime girdisi 0 |
| Mevcut Boss workerd testi | 18/18; sentetik D1, fake GitHub, auth/CSRF, altı bölüm, import/silme koruması ve atomik publish |

Varsayılan Boss test portları kullanılamadı; 8828 adayı Windows’un ayırdığı
8819–9018 aralığındaydı. Ağ ayarı/süreç değiştirilmedi. Bu Phase A testi,
mevcut preview script’inin Git dışı geçici kopyasında yalnızca port sabitleri
18828/18829/18830’a çevrilerek çalıştırıldı. Auth/CSRF mantığı aynı kaldı.
Phase B’de planlanan resmi `BOSS_PREVIEW_PORT` desteği alınır.

Ham çıktılar `reports/` ve `.wrangler/` altında yereldir/Git dışıdır. OG
görselleri önceki AmericaWhat worktree’sinden kopyalandı; üretici değişmedi.
Grafik tarayıcı/ekran okuyucu/gerçek cihaz testi yapılmadı. DOM/CSS sözleşmesi
görsel fark riskini sınırlar; piksel testi yapıldığı iddia edilmez.

## Kalan risk ve sonraki kapı

Audit tarihinde kalan npm advisory yoktur. Bu, gelecekte yeni advisory
çıkmayacağı veya uygulamanın tamamen güvenli olduğu anlamına gelmez. Büyük
compiler/bundler geçişi için onaylı görünüm manuel tekrar incelenmeli; gerçek
Cloudflare staging testleri ayrı izinle aynı commit üstünde yapılmalıdır.
Public/Boss Worker kodu ve API’leri bu Phase A’da değişmemiştir. Gerçek staging
ve production hâlâ eski dağıtım durumundadır; yükseltme yalnızca yereldir.
