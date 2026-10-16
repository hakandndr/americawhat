# Boss UX ve Analytics güvenilirliği sprinti

2026-10-15, America/Los_Angeles. Başlangıç doğrulandı:
`codex/security-boss`, HEAD `3bae019f9877601ecc8270349f1269440d49e0fb`, temiz ağaç.
Worktree `D:\IT\AmericaWhat\americawhat\tmp\security-boss`.
**Yalnızca yerel uygulama/test/commit. Push, merge, deploy, gerçek ziyaretçi
okuması veya uzak veri/Access/DNS/Hostinger değişikliği yok.** Önceki staging
preflight bu sprintte gereksiz yere tekrarlanmadı; tarihi kanıtları
[STAGING-PREFLIGHT.md](STAGING-PREFLIGHT.md) içinde korunur.

## Commit’ler ve değişen dosyalar

| Commit | Kapsam |
|---|---|
| `5cc3d1326ea42065ccda99e0c69dacd67c6a2888` | Dolu kırmızı butonda beyaz, AA kontrastlı metin |
| `c199b46041c5a40e54bb80ec33d44e59c582a92c` | Ülke contains eşleşmesi, canlı filtreleme, ortak görünüm tutarlılığı |
| `148838c6531f3af83c81fb9fa0b89e0ef12f33cd` | Doğrudan sayfa seçimi, ID sınırları ve pagination regresyonları |
| `389c61525090fc6a1afcefe3b8c6e2839cf3f41c` | İlk tarihçe kaydını da sabitleyen Geri/İleri düzeltmesi |
| `399e823cce3e0186e0d9c7e8331bcc9f0fded6ec` | Uzun grafik ve sayfa seçicisi taşma koruması |
| `71879c83acf9353516c1deb8b8de886a0589c4c9` | Bekleyen metin kriterini sayfa/range geçişinde koruma; test rapor dizini |

Sonraki yalnızca belge commit’i bu raporu ve devir notlarını
kaydeder; kesin uç `git rev-parse codex/security-boss`. Tüm yeni commit’ler
`Hakan Dundar <hakan@dndr.net>` kimliğindedir; tarihçe yeniden yazılmaz.

Uygulama: `workers/boss/src/html.mjs`, `analytics-db.mjs`, yeni
`analytics-client.mjs`, `index.mjs`, `pages/analytics.mjs`.
Testler: `boss-theme`, `boss-e2e`, `boss-analytics-layout` güncellendi;
`boss-country-filter`, `boss-live-filter`, `boss-pagination` eklendi.
Test raporları worktree kökünden türeyen, gerektiğinde oluşturulan Git dışı
`reports/` dizinine gider; temiz checkout’ta önceden dizin varsayılmaz.

## A — Beyaz metinli dolu buton

Önceki siyah metin tercihi sahibi tarafından reddedildi. Beyazı doğrudan
`#e23b4e` üstüne koymak 4,23:1 olacağından yalnızca dolu aksiyon tonları koyulaştı:

| Durum | Boss token / renk | Beyazla kontrast |
|---|---|---|
| Normal | --accent-strong `#d9364a` | **4,59:1** |
| Hover | --accent-hover `#cf3044` | **5,05:1** |
| Active | --accent-active `#c82d41` | **5,37:1** |
| Metin | --on-accent `#fff` | Üç durumda da ≥4,5:1 |

Disabled opacity .5 ve cursor ayrımı korunur. Boyut/radius/padding/font aynı;
outline/destructive/secondary anlamları kalır. Public `--red`/`--red-hot`, Boss
link/focus/nav marka vurguları değişmedi. Altı bölümün sunduğu CSS beyaz buton
token’larıyla local workerd GET’inde doğrulandı. Piksel/grafik test iddiası yok.

## B — Germany kök nedeni ve tek filtre sözleşmesi

Eski `whereFor()` ülke adı için `lower(country) = lower(?)`, ülke kodu için
tam eşleşme kullanıyordu. Veritabanında Germany olmasına rağmen `ger` eşit
olmadığından sonuç 0’dı; görüntüleme/ülke kodu dönüşümü hatası değildi.

Artık ortak SQL koşulu:

```sql
(lower(country) LIKE lower(?) ESCAPE '\' OR upper(country_code) = upper(?))
```

İlk argüman `%ger%`; kullanıcı `%`, `_`, `\` karakterleri literal escape edilir.
Değerler bind edilir; SQL metnine kullanıcı girdisi eklenmez. Partial arama
birden fazla ülke döndürebilir: `united` United States + United Kingdom.
Kod araması mevcut country_code sütununu kullanır; kodu boş legacy satırlar
için isim/kod tahmini veya veri güncellemesi yapılmaz.

Gerçek preview generator’ının **190 Germany kaydı** ile `ger`, `germ`,
Germany ve GERMANY hepsi 190 döndürdü. DE/de, country_code=DE olan 29 satırı
bulur. Country+human, country+mobile ve country+date kombinasyonları; yüzde/
underscore/SQL-injection benzeri literal girdiler test edildi.

Aynı `whereFor()` ve görünüm üst-ID’si özet kartlarına, visitor tabloya,
günlük grafiğe, Top pages/Countries/Referrers/Agents ve filtreli CSV/NDJSON’a
uygulanır. Export seçilen sayfayla sınırlanmaz: aynı filtreli görünümün tamamıdır.
All retained export ayrı ve açıkça globaldir. Retention ve üst global log
istatistikleri global olarak etiketlenir. IP VISITS, TODAY # ve ALL # global
tanımları değiştirilmedi.

Yeni tutarlılık testi eski günlük grafiğin 60 günle sınırlı çıktı verdiğini de
gösterdi. Varsayılan günlük sorgu artık seçili görünümün tüm günlerini verir;
toplamı summary/export ile eşittir. Grafik uzun geçmişte panel içinde yatay
kaydırılır ve klavyeyle odaklanabilir. Tek günlük görünüm de çizilir.

## C — Küçük, güvenli progressive enhancement

Analytics hâlâ server-rendered GET formudur. JavaScript yoksa Apply filters,
Reset, First/Previous/Next/Last bağlantıları ve sayfa seçimi + Go çalışır.
Yeni script yalnızca Access JWT doğrulamasından sonra `/assets/analytics.js`
üzerinden sunulur. Sadece Analytics HTML’sinde CSP’ye `script-src 'self'` ve
`connect-src 'self'` eklenir; inline/eval izni yoktur. Diğer Boss sayfalarının
script yasağı ve tüm yazı işlemlerinin Access/Origin/CSRF koruması aynıdır.

- IP/country/place/page/referrer/browser input’ları **350 ms debounce** kullanır.
  Mevcut IP exact, page exact/prefix* ve browser prefix anlamı korunur; country
  case-insensitive contains olur. Dropdown’lar hemen uygular; tam/takvimsel
  olarak geçerli tarihler ve From≤To doğrulanır. IME yazımı bitene kadar beklenir.
- Yeni giriş eski isteği hemen AbortController ile iptal eder. Artan generation
  sayısı, iptal yarışı olsa bile eski response’un yeni sonucu ezmesini engeller.
- Aynı-origin HTML GET cevabından yalnızca metrics/events/breakdowns/global
  warning bölgeleri ve export/range bağlantıları güncellenir. Form düğümü
  yerinde kaldığından yazı odağı/selection/seçili filtreler kaybolmaz.
- Updating…/Waiting… ve aria-live/aria-busy durumu vardır. Ağ/Access oturumu
  hatasında eski sonuç korunur, Apply ile retry veya yeniden giriş için reload
  önerilir; yanlış login HTML’si tablo yerine konmaz.
- Kriter değişimi p ve snapshot’ı göndermez: **yeni görünüm, sayfa 1** oluşur.
  Reset alanları hemen temizler ve yeni filtresiz görünümü ister.
  Debounce beklerken pager’a basılırsa eski sayfa yerine yeni kriterler hemen
  uygulanır; date-range chip’leri de yazılmakta olan diğer filtreleri korur.
- URL’de seçili p ve gerçek server snapshot yer alır. İlk yükleme replaceState
  ile sabitlenir; başarılı yeni görünüm pushState, popstate GET’i yeni history
  girdisi oluşturmadan çalışır. Page selector change ve klavyeyle Go aynı yolu
  kullanır; navigasyonda sonuç başlığına klavye odağı taşınır.

## D — Doğrudan sayfalama algoritması ve maliyeti

Eski stream yalnızca `id < before` keyset ile Older bağlantısı veriyordu.
Yeni görünüm **First | Previous | Page select | Next | Last** sunar. Seçicide
örneğin `Page 1 · ALL # 940–891` yazılır; metadatataki Rows 1–50 of N ise
filtreli sonuç sırasıdır. Silme boşlukları olan ALL # yeniden numaralanmaz.

1. Tek metadata SQL’i üst `MAX(id)` sınırını sabitler; filtrelenmiş **yalnızca
   ID’ler** üzerinde ROW_NUMBER üretir, sayfa başına first_id/last_id/count
   gruplar. 10.000 kayıtta 200 sınır satırı döner, 10.000 ziyaretçi gövdesi dönmez.
2. İstenen p mevcut sayfalara clamp edilir; seçili ID aralığı tekrar aynı
   filtrelerle primary key üzerinden, LIMIT 25/50/100 ile okunur. OFFSET yok;
   Last için önceki sayfaları ziyaret eden sorgu döngüsü yok.
3. TODAY # mevcut `(la_day,id)` indeksiyle tüm ilgili gün içindeki retained
   sırayı; IP VISITS mevcut IP/event indeksiyle tüm retained adres sayısını
   korur. IP sorguları ≤90 bind’lık gruplardır; D1 100 bind sınırı aşılmaz.
4. Snapshot üst ID’si page/export/history URL’lerinde taşınır. Sonradan append
   edilen ID’ler eski görünümü kaydırmaz. Kriter değişimi yeni snapshot açar.
   Metadata/row/summary sayıları aynı istek sırasında değişirse HTTP 409 ile
   yeniden yükleme istenir; tutarsız sayfa sessizce gösterilmez.

Yeni tablo, index, migration, kalıcı cache veya event update yoktur.
Tam sayfa sayısı/aralıkları için tarama maliyeti vardır: metadata eşleşen ID’leri
doğrusal tarar; leading-% ülke araması tüm retained log’u tarayabilir. Filtreye
göre sort/group için geçici B-tree kullanılabilir. Bu, sabit maliyet veya
logaritmik rastgele erişim iddiası değildir. Hydration yalnızca sayfa boyutudur;
EXPLAIN QUERY PLAN primary-key aralığını doğrular.
[SQLite planner](https://www.sqlite.org/queryplanner.html),
[D1 sınırları](https://developers.cloudflare.com/d1/platform/limits/).

Yerel gerçek SQLite/D1 adapter ölçümünde 10.000 kayıt / 200 sayfanın tamamı
tekrarsız ve eksiksiz dolaşıldı. Kaydedilen son ölçüm: **Last 4,59 ms**, bütün
200 sayfa **848 ms**; 940 kayıt / 19 sayfa yaklaşık 19 ms. Donanım/çalıştırmaya
bağlıdır; Cloudflare CPU/latency/rows_read ölçümü **değildir**.
Bir gerçek router Germany GET’i **17 D1 sorgusu** kullandı (regresyon üst sınırı
22); doğrudan sayfa alma metadata/hydration/IP dahil ≤4 sorgudur. Sorgu sayısı
sayfa numarasıyla artmaz, taranan satır maliyeti veri büyüklüğüyle artabilir.

Snapshot bir MVCC geçmiş kopyası değildir: manuel retention/import sonrası
görünüm yenilenmelidir. Arada silinmiş kayıtlar korunuyor gibi gösterilmez.
Çok büyük geçmişte tüm page seçenekleri/gün barları da büyür; gerçek staging
maliyeti ölçülmeden yeni indeks/cache/aggregation veya Paid kararı verilmez.

## Doğrulama ve kalan manuel kapı

| Kontrol | Sonuç |
|---|---|
| npm test | **134/134**; önceki 117 + ülke/live/pagination/router/layout regresyonları |
| Boss workerd entegrasyonu | **18/18**, history düzeltmesiyle; sonraki istemci/taşma düzeltmeleri unit/VM + local workerd render/script eşitliğiyle doğrulandı |
| Loopback altı bölüm / yeni script | 200, beyaz buton token’ları; sunulan script kaynakla aynı; same-origin CSP |
| country=ger workerd | **190**, limit25 ile Last sayfa **8**; CSV/NDJSON aynı 190 |
| Pagination fixture’ları | 0, 1, 49, 50, 51, 940, 10.000; gaps, sınırlar, invalid p, filtreler, append, durable ALL/TODAY/IP |
| Live VM/DOM testleri | Debounce, altı text input, dropdown, eksik/geçersiz tarih, stale response, hata/retry/login HTML, Reset, page jump/Go, Geri/İleri ve ilk history snapshot |
| Public | src aynı; build162, static0 hata, DOM/CSS162 aynı, 124 haber/11 parça/3.652 iç bağlantı korunur |
| npm audit / --omit=dev | **0 / 0**, bağımlılık/lockfile aynı |
| Yerel Worker dry-run | Web8 / Boss21 girdi, npm runtime girdisi0; upload yok |

Kanıtlar Git dışı `reports/tests-ux-final.tap`, `boss-ux-final.log`,
`boss-ux-workerd.json`, `pagination-synthetic-performance.json`,
`pagination-query-plans.json`, `analytics-view-query-count.json`,
`audit-ux*.json`, `ux-*-dryrun.log` altındadır. Grafik/Computer Use/tarayıcı
otomasyonu yapılmadı; yerel DOM/VM testi grafik tarayıcı testi değildir.

Sahibi desktop/mobile’de beyaz butonları, filtre sırasında caret/IME davranışını,
uzun chart/page selector taşmasını, Geri/İleri ve gerçek klavye/ekran okuyucuyu
incelemelidir. Ortam sonradan manuel silmeyle değişirse yeniden görünüm açılmalı.
Staging CPU/D1 maliyetleri ve gerçek Access oturum yenilemesi hâlâ uzak doğrulama ister.

Yerel düzeltmeler tamamdır; **doğrudan staging deploy’a hazır denmez**.
Önceki Access/AUD/secret, sandbox Git credential, güncel main uzlaştırma,
kesin yeni SHA ve rollout/rollback prova kapıları sürer. Önceki `636936f`
staging kanıtı bu sprintte yeniden okunmadı; dağıtım yapıldığı söylenmez.
Bir sonraki ayrıca onaylı sprint bu hazırlıklar ve gerçek staging testidir.

## Yerel önizleme

```powershell
Set-Location D:\IT\AmericaWhat\americawhat\tmp\security-boss
npm test
# Çalışan kendi Boss preview'sini durdurduktan sonra; ikisini aynı anda çalıştırma:
$env:BOSS_PREVIEW_PORT = '18828'
npm run test:boss-preview
npm run preview:boss
```

`http://127.0.0.1:18828/analytics?country=ger` hazır sentetik preview’dır.
Preview kendi local D1/fake GitHub state’ini yeniden kurar; gerçek veri kullanmaz.
Önceki local geçici kimlik dosyaları silinmeden `.wrangler/` içinde yedeklendi;
beklenmeyen mevcut `.dev.vars` dosyasının üzerine yazılmaz. Public önizleme
`http://127.0.0.1:8817/`; public kaynak/SEO/URL’ler değiştirilmedi.
