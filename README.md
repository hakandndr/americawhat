# americawhat — Faz 0 (Astro kürasyon feed iskeleti)

## Ne var
- Astro statik feed: `src/data/published.json`'daki item'ları kart olarak render eder
- Kategori filtresi (client-side)
- WAT/LOL/SAME/DEAD tepki sistemi → PHP endpoint'lere yazar
- Analytics beacon (mevcut log_df.php'ye bağlı)
- Marka kimliği coming-soon sayfasından taşındı (lacivert/kırmızı, Anton/Archivo)

## Kurulum (VS Code / D:\IT\AmericaWhat)
    npm install
    npm run dev      # localhost'ta önizleme
    npm run build    # dist/ üretir

## Deploy
`npm run build` → `dist/` klasörü → Hostinger public_html'e FTP.
`dist/analytics/` içindeki PHP dosyaları da gider (vote.php, get_votes.php).

DİKKAT: Mevcut analytics dosyaların (tracker.php, log_df.php, aw_panel_log.txt vs.)
zaten public_html/analytics/ içinde. Deploy'da onları EZMEMEK için ya:
  - FTP deploy'da analytics/ klasörünü exclude et, VEYA
  - public/analytics/ içine mevcut tüm dosyaların (tracker.php dahil) kopyasını koy
    ki her build hepsini birlikte göndersin.
Bu iskelette sadece vote.php + get_votes.php var; tracker/log_df senin sunucunda mevcut.

## İçerik ekleme (Faz 1'e kadar geçici)
`src/data/published.json` içine yeni item ekle:
    {
      "id": "aw-0005",
      "title": "...",
      "comment": "... (americawhat sesi)",
      "category": "florida-man",   // categories.js'teki anahtarlardan biri
      "source_url": "https://...",
      "source_name": "...",
      "date": "2026-07-08"
    }
Sonra npm run build + deploy.

## Kategoriler
src/data/categories.js — florida-man, bureaucracy, only-in-america,
late-stage, wait-what, crime-weird. Her biri kendi aksan rengiyle.

## Sırada (Faz 1)
İçerik girişi için PHP admin paneli (pending → onay → published akışı).
