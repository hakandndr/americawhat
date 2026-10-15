# americawhat — Handoff

## Son devir — Boss UX ve Analytics (2026-10-15)

`codex/security-boss`, aynı `D:\IT\AmericaWhat\americawhat\tmp\security-boss`.
`3bae019` sonrası yerel commit’ler: `5cc3d13` beyaz buton, `c199b46` country/live,
`148838c` sayfa sınırları, `389c615` history, `399e823` overflow, `71879c8`
bekleyen kriter koruması/test rapor dizini. Kaynak uç `71879c8`, ardından belge commit’i.

134 test; 18 workerd; actual synthetic Germany190 ve export eşitliği. Public
kaynak ve migration/identifiers/import/retention değişmedi; audit0. İstemci
enhancement yalnızca Analytics’te authenticated script/self CSP kullanır;
JS’siz GET formlarını koru. Pagination O(N) ID metadata + bounded PK hydrate;
OFFSET yok. Snapshot append kaymasını önler, manuel silme sonrası yenile.
Günlük grafik artık tüm filtreli günleri kapsar. Tam bulgular/commit/testler:
[BOSS-UX-ANALYTICS-SPRINT.md](BOSS-UX-ANALYTICS-SPRINT.md).

Sahibi local 18828’de beyaz buton/otomatik filtre/pager/mobile/klavye kontrolünü
yapar. Önceki STAGING-PREFLIGHT.md kanıtları korunur; bu sprintte tekrarlanmadı.
Yeni main snapshot’ı + Access/AUD/secret/Git izolasyonu + tam SHA staging testi
ayrı onaylı sonraki iş; push/merge/deploy veya gerçek veri işlemi yapılmadı.

## Önceki devir — Boss renkleri ve staging preflight (2026-10-14)

`codex/security-boss` üzerinde `3730297` sonrası Boss-only renk commit’i
`0f3fe02`; sonrasında preflight belgeleri. Çalışma alanı aynı `tmp/security-boss`.
Public kaynak, backend, tablo/form/layout aynı. 117 test, 18 local workerd,
162 sayfa/parity ve audit 0. Sahibi güncel local Boss’u 18828’de inceleyebilir.

Sonraki ayrıca onaylı iş [STAGING-PREFLIGHT.md](STAGING-PREFLIGHT.md) planıdır.
Staging gerçekten `636936f`, version UUID’si kaydedildi. D1 uyumlu; migration
gerekmez. Boss Access app 0, AUD boş ve iki secret eksik; URL kapalı kalmalı.
Production repo PAT’i branch ismiyle izole olmaz; ayrı sandbox content repo
önerisi/sunucu tarafı ref koruması onaylanmadan gerçek editorial test yok.
Güncel main içerik merge’i, staging config commit’i ve tam SHA doğrulaması
henüz yapılmadı. Gerçek rollback provası da ayrı izin bekler. Push/deploy/merge
yapılmadı; Hostinger mail/legacy/manual retention kararları değişmedi.

## Önceki devir — güvenlik ve Boss sprinti (2026-10-14)

Çalışmaya `D:\IT\AmericaWhat\americawhat\tmp\security-boss` /
`codex/security-boss` üzerinde devam edilir. Onaylı `design/staging-refinement`
`16b10a4` ve deneysel `design/editorial-casefiles` `40274dc` değişmedi.
Güvenlik `d266964` ayrı commit; seçici Boss entegrasyonu sonraki ayrı commit’tir.
Public tasarım/Trending donmuş ve `src/` birebir korunmuştur. Audit 0,
115 test ve 18 yerel Boss workerd kontrolü başarılı; görsel tarayıcı testi yok.

[INTEGRATION-SPRINT.md](INTEGRATION-SPRINT.md) son sonuçları, uzak main içerik
farkını, onay sonrası merge reçetesini ve staging/production kapılarını içerir.
Sonraki iş aynı commit’in **ayrıca onaylı** gerçek Cloudflare staging doğrulamasıdır.
Uzak main `b1312bf` bu dala henüz birleştirilmedi; daha yeni RSS içeriğini koru.
Canlı staging `636936f`; Boss Access/plan/production provisioning bekler.
Final FTP log/oy dosyalarını şimdi isteme; cutover’a yakın alınır. Hostinger mail
kalır, retention manueldir, DNDR’ye tarihsel tekrar sayım yapılmaz.
Bu sprintte push, merge, deploy veya gerçek veri değişikliği yapılmadı.

## Önceki devir notu — 2026-10-14 (sprint öncesi)

Son görev `e7d2116` sonrasındaki küçük footer CSS/header polish’idir; bu dalın
HEAD’i tek yerel polish + dokümantasyon commit’idir. Footer merkezde kalır,
newsletter ikincildir. `wait, what.` bir link değil hedefsiz span olduğundan
kaldırıldı; About footer’da zaten vardı. Trending kullanıcı tarafından doğrulandı
ve değiştirilmedi. Kategori/arşivde ek işlevsel kusur bulunmadı.

Güvenlik bulguları ve sürüm/erişilebilirlik tablosu DEPENDENCY-AUDIT.md’de;
Boss’un seçilecek dokuz dosyası, Access/test/rollback planı
BOSS-INTEGRATION-PLAN.md’dedir. Bunlar uygulanmış güvenlik yükseltmesi veya Boss
entegrasyonu değildir. Paket ve lockfile aynı; yalnızca yerel test/build/dry-run
çalıştırıldı. 106 test ve 162 sayfalık çıktı doğrulaması geçti. Tarihsel log/oy
koruma kararları geçerlidir; gerçek veri üzerinde işlem yapılmadı.

Proje sahibi kamusal tasarım olarak **mevcut Cloudflare staging görünümünü**
onayladı. V1/V2/V3 kamusal yeniden tasarımları reddedildi; deneysel daldaki
önceki tasarım önerileri geçerli talimat sayılmaz.

`dev/cloudflare-native` / `4438907` temelinden oluşturulan
`design/staging-refinement` dalı ve
`D:\IT\AmericaWhat\americawhat\tmp\staging-refinement` worktree’si
sadece üç yerel iyileştirmeyi içerir: 12’şer Load More, ilk sırada kırmızı
Random? ardından Categories/Archive, sade footer. Özgün kartlar/hero/marka
stilleri ve haber URL’leri korunur. Deneysel `40274dc` ve yerel Boss
iyileştirmeleri ayrı worktree’de korunur; toplu merge yapılmadı.

Canlı staging `636936f` olarak doğrulandı; yerel başlangıçla uygulama kaynağı
aynı. 106 test, 162 sayfalık build, statik/SEO/iç bağlantı doğrulaması ve yerel
workerd reaksiyon/Load More testi geçti. Görsel tarayıcı testi yapılmadı.
Mevcut bağımlılık audit’i 21 açık bildiriyor; ayrı bakım değerlendirmesi gerekir.

**Durum yalnızca yerel:** push, merge, staging/production deploy, DNS ve veri
aktarımı yapılmadı. Üretim taşıması ayrı onay ve mevcut migration önkoşulları
ister. Başlangıç bilgileri için CURRENT-STATE; kapsam/kanıt/bağımsız görüş için
DESIGN-REDESIGN; tam önizleme komutları için OPERATIONS okunmalı. Aşağıdaki
onboarding içeriği eski işletim mimarisini anlatır.

Master onboarding document. If you are picking this project up cold, read this
file first, then `CURRENT-STATE.md` (what is live, what is only prepared), then
`EDITORIAL-GUIDE.md` (the part that actually matters), then `OPERATIONS.md`.

**Live site:** https://americawhat.com
**Repo:** https://github.com/hakandndr/americawhat
**Admin panel:** https://americawhat.com/boss/ today (password-protected PHP);
the replacement is `boss.americawhat.com` behind Cloudflare Access (prepared, not live)
**Owner:** Hakan Dundar
**Last updated:** 2026-10-14 (verification phase)

---

## What this project is

A curated feed of absurd, only-in-America news. Each item is a real news story,
hand-picked, assigned a category, and given a short dry editorial comment in the
site's own voice. It is a comedy/curation product, not a news aggregator — the
value is in what gets rejected and in the two-sentence comment.

## Architecture in one paragraph

Static Astro 4 site. **There is no database.** Content lives as JSON in the git
repo (`src/data/`). A GitHub Action fetches RSS candidates into `pending.json`
three times a day. A lightweight PHP admin panel reads and writes those JSON
files **through the GitHub Contents API**, so approving an item is literally a
git commit. That commit triggers a second Action that builds the Astro site,
generates per-item Open Graph images with Python/Pillow, and deploys `dist/` over
FTP to Hostinger. The git repository *is* the CMS.

**Migration in progress (not live):** branch `dev/cloudflare-native` contains the
Cloudflare-native replacement — the same static site served by the
`americawhat-web` Worker (Static Assets + a small API for reactions and page
views), a new `americawhat-boss` Worker on `boss.americawhat.com` behind
Cloudflare Access, and two D1 databases. Git stays the source of truth. See
`ARCHITECTURE.md`, and `CLOUDFLARE-MIGRATION.md` for the approval-gated steps.

```
fetch.yml (cron 02:00/14:00/20:00 UTC)
   └─ scripts/fetch-sources.mjs → src/data/pending.json  (+ seen_ids, fetch-status)
         └─ admin panel /boss/ → approve → published.json  (GitHub API commit)
               └─ deploy.yml → npm ci → gen-og.py → astro build → FTP → live
```

## Repo map

| Path | Purpose |
|---|---|
| `src/data/published.json` | Live content. `{ "items": [...] }` |
| `src/data/pending.json` | Fetched candidates awaiting curation. Flat array |
| `src/data/categories.js` | The 7 categories + the 4 reactions |
| `src/data/sources.json` | RSS source list (Google News queries) |
| `src/data/filters.json` | Scoring keywords, `minScore`, `recencyDays`, `maxPerSource` |
| `src/data/seen_ids.json` | Dedup ledger so the fetcher doesn't re-add items |
| `src/data/fetch-status.json` | Last-run telemetry for the fetcher |
| `src/components/Card.astro` | Feed card; derives status badge + source line |
| `src/lib/items.js` | Slug generation + status derivation. Read this before touching schema |
| `src/pages/item/[slug].astro` | Item detail page; renders `city, state` as a place line |
| `public/studio/index.php` | The admin panel (served at `/boss/`) |
| `public/analytics/` | `vote.php`, `get_votes.php` — reaction + view endpoints |
| `scripts/fetch-sources.mjs` | The RSS fetcher/scorer |
| `scripts/gen-og.py` | Per-item OG image generator (Pillow), runs at build |
| `.github/workflows/fetch.yml` | Candidate fetch cron |
| `.github/workflows/deploy.yml` | Build + FTP deploy on push to `main` |
| `workers/web/` | Cloudflare public Worker (assets + API) — prepared |
| `workers/boss/` | Cloudflare Boss Worker — prepared |
| `workers/shared/` | Time, classification, legacy/reaction importers, editorial signals |
| `migrations/app/`, `migrations/analytics/` | D1 schemas |
| `scripts/analytics/legacy-import.mjs` | Offline inventory/rehearsal of the legacy visitor log |
| `scripts/editorial/apply-curation.mjs` | Safe local curation of `pending.json` |
| `scripts/dev/boss-preview.mjs` | Real Boss in workerd, locally |
| `scripts/build/verify-static.mjs` | Static output security check |
| `tests/` | `npm test` |
| `.githooks/` | Commit guardrails (`git config core.hooksPath .githooks`) |
| `docs/` | This documentation set |

`public/studio/config.php` holds the GitHub token and panel password. It is
**git-ignored** and exists only on the server. `config.sample.php` is the template.

## Item schema

```json
{
  "id": "aw-0125",
  "title": "Headline as published by the source",
  "comment": "Our two-sentence editorial voice. This is the product.",
  "category": "florida-man",
  "source_url": "https://news.google.com/rss/articles/...",
  "source_name": "FOX 13 Tampa Bay",
  "source_domain": "fox13news.com",
  "date": "2026-09-14",
  "status": "REAL",
  "city": "Lakeland",
  "state": "Florida",
  "seen_id": "src-xxxxxxxxxxxx"
}
```

Optional: `body`, `whyAmericaWhat`, and `slug` — a pinned URL segment that Boss
sets only when a retitle, a colliding title or a deletion would otherwise move an
existing article's URL (`assignSlugs` in `src/lib/slug.js`; never edit it by hand). Both are normally left empty — the comment
carries the whole piece. Pending items additionally carry `excerpt`,
`external_url`, `score`, `fetched_at`; these are working fields, not published.

### status
Three values, defined in `src/lib/items.js` and rendered in `Card.astro`:

- **REAL** — real story with a working source link. No badge, normal appearance. *This is what we use.*
- **SUBMITTED** — reader submission. Renders a SUBMITTED badge.
- **UNVERIFIED** — no usable source link. Renders an UNVERIFIED warning badge.

If `status` is omitted the site derives it: source link present ⇒ REAL, absent ⇒
UNVERIFIED. Set it explicitly to REAL anyway.

## Where to go next

- **`EDITORIAL-GUIDE.md`** — the concept, the 7 categories, the voice, and the
  rejection rules. This is the irreplaceable part; the code can be rebuilt, the
  editorial judgment cannot.
- **`CURRENT-STATE.md`** — what is live right now, counts, known gaps, backlog.
- **`OPERATIONS.md`** — the curate → push → approve → deploy loop, local
  development, staging, and every gotcha that has actually bitten us.
- **`ARCHITECTURE.md`**, **`ANALYTICS.md`**, **`SECURITY.md`**,
  **`CLOUDFLARE-MIGRATION.md`**, **`DECISIONS.md`** — the Cloudflare-native target,
  its data, its security and the migration runbook.
