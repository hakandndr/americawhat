# AmericaWhat — production geçiş planı (hazırlık, 2026-10-15)

Bu belge yalnız plan ve tespittir. Hiçbir production kaynağı, D1, DNS kaydı,
Hostinger dosyası veya `main` dalı değiştirilmedi. Her adım ayrı owner onayı
ister. Eski runbook [CLOUDFLARE-MIGRATION.md](CLOUDFLARE-MIGRATION.md) ayrıntı
kaynağıdır; aşağıdaki "güncelliğini yitirenler" listesi onun hangi kısımlarının
bu plana göre okunacağını söyler.

## Kaynak durumu (doğrulandı)

| Ref | SHA | Not |
|---|---|---|
| Yerel `codex/staging-rc` = uzak yedek `backup/cloudflare-staging-2026-10-15` | 209aa9e (+ bu belge commit'i) | Tüm onaylı staging işi; owner kimliği; CI başarılı |
| `origin/dev/cloudflare-native` | 4438907 | Yedeğin tam atası (31 commit geride, 0 ileride) |
| `origin/main` | 9f6c3fc | Ortak ata eaef194; main'de yedekte olmayan tek commit 9f6c3fc |

- 9f6c3fc (aw-bot, fetch) yalnız `pending.json`, `seen_ids.json`,
  `fetch-status.json` değiştirir. `git merge-tree` çakışmasız; `published.json`
  ve OG envanteri etkilenmez. Merge zamanında bu tür fetch commit'leri tekrar
  birikmiş olacaktır; aynı yöntemle (merge-tree, sadece üç veri dosyası) kontrol
  edilir. `published.json` değişmişse `scripts/release/approved-og.json` envanteri
  yeni yayınlar için güncellenmeden build:rc durur (bilinçli kapı).
- main'e göre fark: 138 dosya (docs, tests, workers, src, scripts, fontlar),
  ayrıca `ci.yml` eklenir, `deploy.yml` (yalnız main'den manuel çalıştırma +
  iki exclude) ve `fetch.yml` (yarış durumuna dayanıklı push) değişir.

## Kritik risk: yanlış yayın yolu

`main` push'u bugün **FTP ile Hostinger'a** yayın yapar (`deploy.yml`). Yedek dalı
main'e merge etmek Cloudflare'a özel kodu Hostinger'a gönderir.
`scripts/release/ftp-diff.mjs` (salt okunur, canlı sync-state) bu build için:
44 yeni dosya (6 woff2 font, 8 `_astro`, 15 category, 10 feed, 5 archive),
259 değişen dosya (neredeyse tüm HTML, rss/sitemap, **124 OG PNG**), 3 silinen
eski `_astro` dosyası; PHP/.htaccess ve hassas dosya yok. Sonuç: Hostinger'da
görünür tasarım değişir, yeni `tracking.js` POST beacon'ı Hostinger
`log_df.php`'nin POST'u okuduğu doğrulanmadan devreye girer.

**Kural:** Cloudflare cutover'ından önce main'e merge yapılmaz. Merge, cutover
penceresinde ve önce `deploy.yml` FTP job'u kapatılmış/Cloudflare deploy job'u
ile değiştirilmiş olarak yapılır (ayrı onaylı PR).

## OG görselleri

Production'ın sunduğu OG'ler, deploy job'unun sürümü sabitlenmemiş Pillow ile
CI'da ürettiği dosyalardır (`public/og/` Git'te yok). Onaylı arşiv
(`approved-og.json`, kaynak 16b10a4 staging build'i) bunlardan bayt düzeyinde
farklı (örn. aw-0011: canlı 47.636 B, onaylı 52.304 B). Cutover sosyal önizleme
görsellerini onaylı set ile değiştirir. Ayrıca yeni yayınlanan haberler için
Cloudflare yolunda henüz bir OG üretim/onay adımı yok (build:rc yeni içerikte
durur). Owner kararı: hangi set kanonik ve yeni haber OG'leri nasıl üretilecek.

## Plan (sırayla, her adım ayrı onay)

1. **Hostinger envanteri ve yedeği** (owner, salt okunur; runbook §1):
   `public_html` arşivi + hash manifesti, cron/PHP/SSL/redirect listesi, tam DNS
   zone listesi, e-posta hesap/forwarder adları. `log_df.php` POST desteği
   kontrolü. Secret içerikleri sohbete/commit'e girmez.
2. **Kaynak/CI hazırlığı** (PR, merge yok): `deploy.yml` FTP job'unu cutover
   sonrası devre dışı bırakacak, Cloudflare production deploy job'unu
   (`production` Environment, reviewer `hakandndr`, yalnız Workers+D1 yetkili
   token) ekleyecek değişiklik; OG kararı uygulanır.
3. **Workers planı ve CPU:** Hesap planını doğrula. Free planda 10 ms CPU;
   Weekly review yerelde ~11 ms sıcak/~31 ms soğuk ölçüldü → Paid önerilir.
   Edge Trending tek D1 okuması + isolate önbelleği; staging p50 ~104 ms.
4. **Production D1** (ayrı onay): `americawhat-app-production`,
   `americawhat-analytics-production` oluştur; id'leri `env.production`'a yaz
   (şu an PRODUCTION_NOT_PROVISIONED); migrations `--remote --env production`;
   önce Time Travel bookmark kaydı.
5. **Boss Access ve secret'lar:** `boss.americawhat.com` için owner-only Access
   uygulaması → AUD `BOSS_ACCESS_AUD`'a (şu an boş); secret'lar `GITHUB_TOKEN`
   (yalnız bu repo, Contents RW, süreli), `BOSS_CSRF_SECRET`,
   `REACTION_GUARD_SECRET`; `versions upload --secrets-file` ile, değerler
   loglanmadan. Boss production hedefi `hakandndr/americawhat` / `main` (kod
   yalnız production ortamında main'e yazmaya izin verir).
6. **DNS taşıma** (runbook §2): zone'u Cloudflare'e ekle, kayıtları birebir
   karşılaştır (MX/SPF/DKIM/DMARC Hostinger'da kalır, DNS-only), sonra NS
   değişimi; site bu adımda taşınmaz. Geri dönüş: Hostinger NS'leri.
7. **Final snapshot'lar — cutover penceresinde, erken değil:**
   `aw_votes.json` ve `aw_panel_log.txt` indir; `npm run analytics:legacy --
   inventory`, `sql` çıktısını production analytics D1'a uygula (iki kez; ikinci
   çalıştırma 0 eklemeli); reactions Boss → Reactions import (SHA önekiyle).
   Geçici .sql dosyası doğrulamadan sonra silinir. Staging verisi production'a
   taşınmaz.
8. **İçerik uzlaştırma:** Cutover commit'inde main'deki son fetch/onay
   commit'leri merge-tree ile alınır; `published.json` sayısı, slug'lar,
   OG envanteri, RSS/sitemap ve `verify:refinement`/`verify:static` kontrolleri.
9. **App cutover:** `americawhat-web --env production` custom domain
   `americawhat.com` + `www`; Boss production deploy; deploy.yml FTP kapalı.
10. **Doğrulama:** `npm run smoke -- https://americawhat.com` (salt okunur),
    `npm run parity:live`, bir manuel reaction ve sayfa görüntüleme, Boss
    Analytics native satırı, font/footer/Trending kontrolü, Access'in başka
    kimliği reddetmesi, CPU/D1 metrikleri.
11. **72 saat sonra:** S2 snapshot'ları (yalnız yeni satırlar/delta) import.
12. **Hostinger:** web dosyaları 30 gün sonra ayrı onayla kaldırılır;
    **plan e-posta için aktif kalır** (MX/SPF/DKIM Hostinger'da).

## Geri dönüş

- Site: custom domain'leri production Worker'dan ayır, kayıtlı Hostinger
  A/AAAA/CNAME kayıtlarını geri koy. Bunun çalışması için Hostinger'ın güncel
  kalması gerekir: cutover'dan sonra FTP kapalıysa, geri dönüşte son içerik
  için bir kez manuel FTP yayını gerekir (bu plan değişikliği runbook §4.5'i
  günceller).
- Reactions: Boss'tan `aw_votes.json` export → Hostinger'a yükle.
- Analytics: native satırlar D1'da kalır; PHP logger devam eder, çift sayım yok.
- D1: ileri düzeltme; Time Travel yalnız son çare (ALL # numaralarını geri sarar).
- Worker: kayıtlı önceki version UUID'ye `versions deploy UUID@100%`.

## Açık konular (owner kararı/eylemi)

1. Hostinger envanteri/yedeği ve `log_df.php` POST kontrolü yapılmadı.
2. Workers planı doğrulanmadı.
3. Kanonik OG seti ve yeni haberler için OG üretim yolu.
4. FTP→Cloudflare deploy job değişimi (PR) ve merge zamanlaması.
5. Gizlilik sayfasındaki ~90 gün sözü (retention yalnız manuel).
6. Staging'deki 3 gerçek ziyaretçi satırı ve 2 oy: sil/koru kararı.
7. 108/124 yayında Google News URL'si (editoryal geri doldurma).

## Güncelliğini yitiren talimatlar

- CLOUDFLARE-MIGRATION §0: Boss Access/AUD/secret/URL "yok/kapalı" ifadeleri
  eski; Access owner-only ve staging Boss açık ([STAGING-READINESS.md](STAGING-READINESS.md)).
- CLOUDFLARE-MIGRATION "Branch reconciliation" ve §1 pre-merge: merge kaynağı
  artık `dev/cloudflare-native` değil, `codex/staging-rc` / yedek dal; "merge
  yalnız beacon ve slug gönderir" ifadesi eski — FTP diff yukarıda.
- §3a tamamlandı; §7 madde 2 (Access) tamamlandı, kalan karar 3 ziyaretçi satırı.
- §4.5 "FTP deploy'u gözlem süresince açık tut" yeni kuralla çelişir; Cloudflare
  kodunun Hostinger'a gitmemesi için cutover sonrası FTP job'u bu dalın
  içeriğini yayınlamamalıdır.
- CURRENT-STATE "Repository" bölümü (`302549b`, dev dalı) tarihseldir.
