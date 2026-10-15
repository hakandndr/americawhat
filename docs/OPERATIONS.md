# americawhat — Operations

## Güncel Boss UX/Analytics önizlemesi (2026-10-15)

`codex/security-boss` / `D:\IT\AmericaWhat\americawhat\tmp\security-boss`.
134 unit/DOM/SQL test, 18 sentetik workerd kontrolü; audit0, public aynı.
Komutlar: `npm test`; çalışan kendi preview’si durduktan sonra
`$env:BOSS_PREVIEW_PORT='18828'; npm run test:boss-preview`; test bittiğinde
`npm run preview:boss`. Aynı state/portta serve ve test aynı anda çalıştırılmaz.
Hazır preview `http://127.0.0.1:18828/analytics?country=ger` → 190 sentetik kayıt.

Text alanları 350ms sonra, select’ler hemen; tarihlerin tam/geçerli olması
gerekir. Kriter değişimi p/snapshot’ı temizler; yeni sayfa1 görünümü açılır.
Reset filtreleri temizler. First/Previous/Page/Next/Last ile doğrudan gezinilir;
Go ve Apply JS’siz çalışır. Snapshot sabit görünümü korur; yeni kayıtları
görmek için yeniden filtre uygula/Reset kullan. Manuel retention sonrasında
yeniden görünüm aç. Aynı istek sırasında veri değişmişse 409/retry olabilir.
Network/Access hatasında sonuç korunur; Apply retry veya oturum için reload.

Analytics HTML’si authenticated `/assets/analytics.js` yükler; same-origin
script/connect CSP’si yalnızca o sayfaya açıktır. Staging’de bu endpoint ve
Access oturum yenilemesi de test edilir. Gerçek Worker CPU/D1 maliyeti yerel
SQLite ms sonuçlarıyla karıştırılmaz. [Sprint raporu](BOSS-UX-ANALYTICS-SPRINT.md)
ve önceki [staging planı](STAGING-PREFLIGHT.md) geçerlidir. Bu sprintte uzak
deploy/yazım/ziyaretçi okuması yok; aşağıdaki staging kanıtları önceki tarihlidir.

## Geçerli staging ön kontrolü (2026-10-14)

Boss renk commit’i `0f3fe02`, dal/worktree `codex/security-boss` /
`D:\IT\AmericaWhat\americawhat\tmp\security-boss`. 117 test/18 workerd;
public kaynak aynı. [STAGING-PREFLIGHT.md](STAGING-PREFLIGHT.md), geçerli
Access dashboard adımları, exact version UUID’leri, content merge ve staging-only
deploy/rollback planıdır; aşağıdaki eski deploy reçetelerini doğrudan çalıştırma.
Bu sprint yalnızca yerel/salt okunur; uzak yazım onayı yoktur.

Web staging `636936f`, aktif version `02c0da48-f3a2-47ad-99e0-8358b9244ac7`.
Boss URL kapalı/Access app yok/AUD ve secrets eksik. Mevcut D1 ID/DDL uyumlu;
bu aday için migration apply/reset/seed gerekmez. Uzak rollback uygulanmadı;
önceki version hedefi ve CLI sözdizimi okundu, gerçek prova ayrı onay bekler.

Salt okunur Wrangler işlemlerinde bu makinedeki geçersiz ortam token’ı 9109
üretirse yalnızca o shell’de `Remove-Item Env:CLOUDFLARE_API_TOKEN` kullanıp
mevcut doğru OAuth oturumunu doğrula; sistem/env profiline dokunma. Secret
değerini terminale/rapora yazma. Boss token’ının repo/branch ayrımı planda
açıklanır; sahibinin production write credential’ını staging’de kullanma.

## Güncel güvenlik/Boss çalışma alanı (2026-10-14)

`D:\IT\AmericaWhat\americawhat\tmp\security-boss`, `codex/security-boss`.
Node 22.12+ / <23; Astro 7.3.8, sitemap 3.7.4, Wrangler 4.151.0.
Tam/dev hariç audit çıkışı 0; 115 test, build/statik/public parity ve
18 sentetik Boss workerd kontrolü geçti. [Sprint raporu](INTEGRATION-SPRINT.md)
güncel kanıt ve ayrı onay sonrası içerik uzlaştırma reçetesidir.

```powershell
Set-Location D:\IT\AmericaWhat\americawhat\tmp\security-boss
npm ci
npm test
npm run build
npm run verify:static
$env:BOSS_PREVIEW_PORT = '18828'
npm run test:boss-preview
# Test bittikten sonra elle incelemek için (aynı anda ikisini çalıştırma):
npm run preview:boss
```

Boss `http://127.0.0.1:18828/`; +1 workerd, +2 fake GitHub.
Windows bu makinede 8819–9018 aralığını ayırıyor; sistem ayarı değiştirilmedi.
Preview her başlangıçta yalnızca bu worktree’nin `.wrangler/boss-preview-state`
sentetik verisini yeniden kurar; başka önizlemeleri kapatmaz. Gerçek Access
JWT doğrulaması üretimde korunur; yerel imzalı kimlik yalnızca local/loopback’tedir.
Web önizlemesi `http://127.0.0.1:8817/`, ayrı `.wrangler/web-test` D1 state’i.
Web başlatma ve tekrar üretme reçetesi sprint raporundadır.

Aşağıdaki eski UI/audit/port reçeteleri önceki worktree’ye ait tarihsel kayıttır.
Bu sprintte push/merge/deploy ve gerçek veri işlemi yetkisi yoktur.

## Önceki sınırlı UI çalışması — yerel önizleme (2026-10-14)

Son polish footer CSS sıkılaştırması ve hedefsiz header tagline kaldırılmasıdır;
Trending değişmedi. Güncel görevde bağımlılık kurulmadı/yükseltilmedi; aşağıdaki
`npm ci` yalnızca yeni checkout için eski kurulum reçetesidir. Mevcut worktree’de
OG, yerel state ve test anahtarı hazırdır; `npm run build` ve aynı Wrangler
başlatma komutu yeterlidir. Çalışan başka önizleme durdurulmamalıdır.

Güvenlik kontrolü salt okunur `npm audit --json`, `npm audit --omit=dev --json`
ve `npm ls --all --json` ile yapıldı. Audit’in çıkış kodu 1 olması beklenen
mevcut açık durumudur; `audit fix` çalıştırılmadı. Modül kapsamı için iki
Worker’da yalnızca `deploy --dry-run` (upload yapmaz) ve Astro build metadata
kancası kullanıldı. 106 test, 162 sayfa, statik/URL/kart kontrolleri geçti.
Ayrıntı: DEPENDENCY-AUDIT.md. Boss hazırlığı ve ileride izinli entegrasyonun
test/geri dönüş reçetesi BOSS-INTEGRATION-PLAN.md’de; bugünkü Boss kodu alınmadı.

Onaylı görsel temel Cloudflare staging’dir; V1/V2/V3 kamusal deneyleri geçersizdir.
Uygulama yalnızca `design/staging-refinement` dalındadır. Bu görevde aşağıdaki
eski push/deploy/merge reçeteleri **uygulanmaz**. Push, merge veya herhangi bir
ortama dağıtım için ayrı izin gerekir. Boss deneysel worktree’si korunur.

`http://127.0.0.1:8797/` yerel web Worker önizlemesidir. Gerçek yayımlanmış
haberleri ve yalnızca bu worktree’deki D1 kopyalarını kullanır. Sayaçlar canlı
veri değildir. İlk kurulum/yeniden başlatma (PowerShell, Node 22):

```powershell
Set-Location D:\IT\AmericaWhat\americawhat\tmp\staging-refinement
npm ci
# OG dosyaları bu çalışma alanında hazır. Yeni kurulumda: npm run build:og
npm run build
npm run verify:static
npm run verify:refinement
$env:WRANGLER_SEND_METRICS = 'false'
$env:WRANGLER_LOG_PATH = Join-Path (Get-Location) '.wrangler/logs'
$env:CI = 'true'
npx wrangler d1 migrations apply americawhat-app-staging --local --persist-to .wrangler/refinement-state --config workers/web/wrangler.jsonc
npx wrangler d1 migrations apply americawhat-analytics-staging --local --persist-to .wrangler/refinement-state --config workers/web/wrangler.jsonc
# Sadece yerel test anahtarı; mevcut .dev.vars korunur ve Git dışındadır.
if (!(Test-Path workers/web/.dev.vars)) {
  node -e "require('node:fs').writeFileSync('workers/web/.dev.vars', 'REACTION_GUARD_SECRET=' + require('node:crypto').randomBytes(32).toString('hex') + '\n')"
}
npx wrangler dev --local --config workers/web/wrangler.jsonc --ip 127.0.0.1 --port 8797 --inspector-port 9297 --persist-to .wrangler/refinement-state --var PUBLIC_ORIGINS:http://127.0.0.1:8797 --var RELEASE_ID:local-polish
```

Sadece statik görünüm için daha kısa alternatif:

```powershell
npm run preview -- --host 127.0.0.1 --port 4327
# http://127.0.0.1:4327/ — bu alternatifte PHP/Worker API’leri çalışmaz.
```

`npm test`: 106/106. `npm run build`: 162 sayfa.
`verify:static`: 0 hata. `verify:refinement`: 124 haber, 11 parça,
3.652 iç bağlantı, kategori/arşiv, Random, metadata ve sitemap.
Karşılaştırma kanıtları hazırken geniş kontrol:

```powershell
npm run verify:refinement -- --baseline reports/baseline-dist --staging reports/staging-home.html
```

Bu `reports/` örnekleri yerel/Git dışıdır; başka checkout’ta seçenekleri
atlamak gerekir. Testler, SEO parity sonuçları, görsel sınırlar ve mevcut
21 audit bulgusu DESIGN-REDESIGN.md’de kayıtlıdır. Mevcut abonelik endpoint’i
korunmuştur; bu görevde form gönderilmedi. Manuel mobil/klavye kontrolü ve
üretim taşımasının tüm ayrı önkoşulları hâlâ gereklidir.

The content loop, the deploy chain, and every failure mode that has actually
happened. Read §4 before touching git.

---

## 1. The content loop

```
1. fetch.yml runs (02:00 / 14:00 / 20:00 UTC) and commits candidates to pending.json
2. You curate: cut pending.json down to the keepers, fill comment/city/state/status
3. You commit and push that pending.json
4. Panel at /boss/ now shows only the keepers, fields pre-filled
5. You click Approve → panel commits the item into published.json via GitHub API
   and removes it from pending.json
6. That commit triggers deploy.yml → site rebuilds and goes live in a few minutes
```

Step 3 is the one people forget: **the panel reads `origin/main` through the
GitHub API, not your working tree.** Edits that are not pushed are invisible to
the panel.

## 2. Curating a batch

Work from `origin/main`, not the local working copy, which drifts:

```bash
git fetch origin main
git show origin/main:src/data/pending.json > /tmp/p.json
```

Group by story to collapse syndication (see `EDITORIAL-GUIDE.md` §6), read the
sources for the survivors, then write a **curation file** — never rewrite
`pending.json` by hand:

```json
{
  "keep": [ { "id": "aw-p-…", "comment": "…", "city": "…", "state": "…",
              "category": "…", "source_url": "https://<original article>", "status": "REAL" } ],
  "drop": [ "aw-p-…" ]
}
```

`scripts/editorial/apply-curation.mjs` applies it to the **current**
`pending.json`: kept items get the fields, dropped items leave, every other
candidate (including any the fetcher added meanwhile) stays untouched. Dropped
items do not come back because `seen_ids.json` remembers them.

## 3. Push sequence (Windows / PowerShell)

Run from the repo root, on `main`, with a clean working tree.

```powershell
cd D:\IT\AmericaWhat\americawhat
git switch main
git fetch origin
git merge --ff-only origin/main
node scripts/editorial/apply-curation.mjs curation.json
git add src/data/pending.json
git commit -m "content(pending): curated items + comments, city/state, status"
git push origin main
```

If the push is refused because `main` moved (a fetch run or a panel approval),
do **not** merge with `-X ours` — that silently discards the other side's
candidates. Start again from the new head; the curation file is re-applied to
the fresh `pending.json`:

```powershell
git fetch origin
git reset --hard origin/main
node scripts/editorial/apply-curation.mjs curation.json
git add src/data/pending.json
git commit -m "content(pending): curated items + comments, city/state, status"
git push origin main
```

`git reset --hard` here only discards the commit you just made from the
curation file. Confirm each command succeeded before running the next one.

Once Boss is live (`CLOUDFLARE-MIGRATION.md`), curation happens in Boss →
Weekly review and this local routine is no longer needed.

## 4. Failure modes we have actually hit

### 4.1 `fatal: cannot lock ref 'HEAD'` / `Unable to create index.lock: File exists`
Stale lock files from an interrupted git process. There are **two** of them and
removing only `index.lock` is not enough:

```powershell
Remove-Item .git\index.lock,.git\HEAD.lock -Force -ErrorAction SilentlyContinue
```

### 4.2 `out-file : FileStream was asked to open a device that was not a file`
You used CMD redirection in PowerShell. `2>NUL` is Command Prompt syntax; in
PowerShell the null device is `$null`. Don't redirect at all — use
`-ErrorAction SilentlyContinue`.

### 4.3 `fatal: pathspec 'src/data/pending.json' did not match any files`
You are in the wrong repository. This has happened with `D:\IT\oc-ca`, a
different project that has `src/data/events.json` and no `pending.json`. Always
`cd D:\IT\AmericaWhat\americawhat` first.

### 4.4 `! [rejected] main -> main (fetch first / non-fast-forward)`
`origin/main` moved while you were working — either the fetch cron or the panel
committing an approval. Follow the second block of §3 (reset to the new head and
re-apply the curation file). Never use `-X ours`.

### 4.5 Cards render "Source: X · unverified"
`source_url` is empty. Put the original article URL there (`EDITORIAL-GUIDE.md` §7);
the Google News link in `external_url` is not a source.

### 4.6 `ENOSPC: no space left on device` / workspace fails to start
The local development workspace (a desktop tool's virtual machine, not this
repository) ran out of disk space. Not a repo problem. Fixes, in order: restart
the tool; clear its cache; free several GB on `C:`; if it still fails, let the
tool rebuild its workspace from scratch, as its own documentation describes.
A built-in "reinstall" that keeps the old workspace files often does not help.

## 5. Deploy chain

`deploy.yml` on push to `main`:

```
actions/checkout → setup-node 22 → npm ci
  → python scripts/gen-og.py     (Pillow, one OG image per item)
  → astro build                  (static output to dist/)
  → FTP deploy dist/ → Hostinger
```

FTP credentials are GitHub Secrets. Never in the repo. A content-only commit is
enough to trigger a full rebuild; there is no incremental path.

## 6. Local development

```bash
npm ci
git config core.hooksPath .githooks   # once per clone: commit guardrails
npm run dev                           # http://localhost:4321
npm test                              # node:test suite (Workers, Boss, importers, signals)
npm run build:og                      # OG images (needs Pillow: python -m pip install pillow==11.3.0)
npm run build                         # writes dist/
npm run verify:static                 # fails if PHP, config, logs or secrets would be uploaded
```

Git identity for this repository: `Hakan Dundar <hakan@dndr.net>`
(`git config user.name/user.email` in the repository). The hooks refuse
co-author trailers, tool signatures and private files.

### Boss locally

```bash
npm run test:boss-preview   # runs the real Boss in workerd, smoke-checks it, stops
npm run preview:boss        # keeps it running at http://127.0.0.1:8788 (local only)
```

The preview uses a locally signed identity, its own local D1 state
(`.wrangler/boss-preview-state`, emptied at every start) and an in-memory copy
of GitHub holding the public content files (25 current candidates); nothing
leaves the machine and no write reaches GitHub or a Cloudflare database. It
seeds synthetic analytics (a legacy corpus older than 90 days plus 20 days of
native rows, documentation-range addresses only) and synthetic reaction counts,
so every section can be reviewed: Weekly review, Published, approvals,
Reactions (try `tests/fixtures/votes/aw_votes-sample.json`), Analytics, Legacy
import (try `.wrangler/preview-legacy-log-delta.ndjson`), Export, Delete Before
Date, Audit and Health. `npm run test:boss-preview` runs 18 checks over all of
them. If it reports that port 8789 is in use, an earlier preview is still running.

### Web Worker locally

```bash
npx wrangler d1 migrations apply americawhat-app-staging --local --config workers/web/wrangler.jsonc
npx wrangler d1 migrations apply americawhat-analytics-staging --local --config workers/web/wrangler.jsonc
npx wrangler dev --config workers/web/wrangler.jsonc --var PUBLIC_ORIGINS:http://127.0.0.1:8787 --var REACTION_GUARD_SECRET:local
```

If a `CLOUDFLARE_API_TOKEN` environment variable is set but invalid, wrangler
fails with code 9109; unset it to use the logged-in account.

### Staging (americawhat-web-staging)

```bash
npm run build:og && npm run build && npm run verify:static
npx wrangler deploy --config workers/web/wrangler.jsonc
AW_STAGING_TEST_KEY=$(cat private/staging-test-key) npm run smoke -- https://americawhat-web-staging.hakan-c89.workers.dev --write
curl -s https://americawhat-web-staging.hakan-c89.workers.dev/api/health   # "release" must equal the deployed commit
```

Deploy with `--var RELEASE_ID:$(git rev-parse --short HEAD)` so `/api/health`
names the exact source revision. Staging is `noindex` and stores a page view
only when the request carries the staging test key (`private/staging-test-key`,
git-ignored; the Worker secret `STAGING_TEST_KEY`). The Boss staging Worker
has no route; it must not get one before an Access application protects it.
Production deploys follow `CLOUDFLARE-MIGRATION.md` and need owner approval.

### Read-only checks against the live site

```bash
npm run parity:live                  # sitemap URL set, canonical, title, og:image, JSON-LD, 301
node scripts/release/ftp-diff.mjs    # what an FTP deploy of dist/ would upload, replace or delete
```

### Keeping the development branch current

```bash
git fetch origin
git switch dev/cloudflare-native
git merge --no-ff origin/main        # conflict-free: the branch never edits src/data
```

Never rebase or force-push it; never push it to `main`.

### Legacy log import (offline SQL)

```bash
npm run analytics:legacy -- inventory <log>
npm run analytics:legacy -- sql <log> --out private/<name>.sql
npx wrangler d1 execute <database> --remote --file private/<name>.sql --config workers/web/wrangler.jsonc
```

The second execution of the same file must add nothing. Delete the .sql file
afterwards: it contains visitor data.

## 7. Secrets and safety

- `public/studio/config.php` — GitHub token + panel password. Git-ignored, lives
  only on the server. Template: `config.sample.php`.
- FTP credentials — GitHub Secrets only.
- The panel sits behind a server-side password with a constant-time comparison.
- If you reuse this project, rename `public/studio/` to a path of your own; the
  live panel is served from `/boss/`.
- The Cloudflare Boss, its secrets and the Access requirements are described in
  `SECURITY.md`.
