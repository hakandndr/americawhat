# AmericaWhat staging — Boss tablo düzeni ve hazırlık incelemesi

15 Ekim 2026. Yalnız Boss staging Worker'ı güncellendi; Web staging kodu
değişmediği için c08cdfc'de kaldı. Production, DNS, Hostinger, D1 verisi/
şeması, Access ve başka proje değişmedi.

| Alan | Değer |
|---|---|
| Boss RELEASE_ID | ca3666282996330ee455a38facb776a1c04b9d75 |
| Boss version | 1de0fbdf-f374-44aa-a46b-71782a728fe6 (%100) |
| Web RELEASE_ID / version | c08cdfc62eb4483ea1356c35ce7a2a5989c99407 / 1346af78-327b-434d-8cd1-294d0bf39dc3 (%100, değişmedi) |
| Boss rollback | 58dfdaf4-87b3-41f6-a7f0-0f68215bcd44 (c08cdfc) |
| Paket | reports/boss-table-candidate, reports/boss-table-release-manifest.json (SHA256 f99ded4e46e009ff6ff5dbb2911b91d965e604afa4bf0dcb536f6fa6c09353e7) |

## Analytics düzeni

- Ortak shell 1480 px; header, filtreler ve tablo aynı kenarlarda.
- Tek sütun listesi (workers/boss/src/pages/analytics-event.mjs) Analytics akışını
  ve IP geçmişini üretir: ALL #, DAY # (gün toplamıyla), DATE / TIME (PT),
  IP ADDRESS, IP VISITS, SOURCE, EVENT, ACTOR, AGENT, COUNTRY · CITY, PAGE,
  REFERRER, DEVICE, BROWSER · OS, Details. Her hücre tek satır; tam değer title'da,
  tüm ham alanlar Details'te. ≤1431 px EVENT/DEVICE, ≤1291 px AGENT/REFERRER
  satırdan çıkar (Details'te kalır), ≤1109 px etiketli kartlar.
- Davranış sinyali gösterilmez: AmericaWhat verisinde böyle bir alan yok.
- Özet bandı kompakt; grafik görünümün tamamı, son 30 veya 7 gün arasında
  yalnız CSS ile daralır (aralık filtresi değişmez, sıfır günler korunur, her
  pencere kendi tepe değerine ölçeklenir).
- Hata düzeltmesi: grafik çubukları Breakdowns listesinin .bar sınıfını
  paylaşıyordu; human payı 0 genişlikte kalıyordu. Artık .day-bar.
- 50 satırlık sayfa yüksekliği 1440 px'te 5928 → 3430 px.

## Doğrulama

164/164 test; 19/19 workerd Boss smoke; 20 tarayıcı etkileşim kontrolü (canlı
filtre, aralık, ikincil filtre, IP/IP Visits aynı hedef, Details çekmecesi, IP
sayfası, Back ile filtre korunumu, CSV, Next/Last) ve 12 genişlikte (1920–390)
yatay kaydırma yok. Tek konsol hatası Boss'ta zaten olmayan favicon (404).

## Faz B — staging hazırlık incelemesi

Canlı (anonim): 15 public route 200 (44–135 ms), edge Trending, Google Fonts
yok ve 3 font preload, reaction okuma, Load More 12→24, Random → item, footer
About/Disclaimer'da viewport altında; Boss 9 yolda 302→Access. Editoryal
hedef: kodda staging için yalnız hakandndr/americawhat-staging-content /
content-staging kabul edilir; canlı Boss version vars aynı. Bindings: iki
Worker da staging D1 id'leri a3c9ff1f… / 306b9ee6…; Boss BOSS_ALLOWED_EMAILS
hakan@dndr.net.

Doğrulanamayan: owner oturumlu canlı Boss akışları (giriş denenmedi).

Owner için manuel kontrol listesi:
1. Boss → Analytics: 1440 ve 1920 px'te tablo; bir satırın Details'i; grafik
   30/7 gün; ülke filtresi; IP ve IP VISITS bağlantısı; Back; CSV/NDJSON.
2. Weekly review: bir adayı Skip bırakıp sayfayı gönderme (değişiklik olmamalı);
   isterseniz bir Reject → content-staging'de tek commit.
3. Published: arama/kategori filtresi ve bir kaydın düzenleme formunu açma
   (kaydetmeden).
4. Reactions, Audit, Health: Health yeşil, Audit'te son işlemler.

Production geçişi açıkları (salt okunur inceleme):
- codex/staging-rc dalı (tüm staging işi, HEAD ca36662) origin'de yok; yalnız
  bu makinede. dev/cloudflare-native'in tamamını içerir; origin/main'in 1
  içerik commit'i (9f6c3fc, published.json değişmedi) içinde değil.
- CLOUDFLARE-MIGRATION.md ve önkoşul belgeleri dev/cloudflare-native → main
  akışını anlatır; merge adayı artık codex/staging-rc'dir ve main'e merge
  Hostinger'a FTP ile yeni font/footer/Trending istemci kodunu da gönderir.
- Hostinger envanteri/yedeği (§1), log_df.php POST kontrolü ve final
  aw_panel_log.txt / aw_votes.json snapshot'ları yapılmadı.
- Production D1'lar, boss.americawhat.com Access uygulaması, production
  secret'ları ve CI production job yok (config'te PRODUCTION_NOT_PROVISIONED).
- Workers planı (Free 10 ms CPU riski) doğrulanmadı.
- Gizlilik sayfasındaki ~90 gün sözü ve DNS taşıma (§2) owner kararı bekliyor.
