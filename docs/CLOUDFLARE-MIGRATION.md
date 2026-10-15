# americawhat — Cloudflare migration and release runbook

> **2026-10-15:** Güncel sıra, kaynak durumu ve bu belgenin güncelliğini
> yitiren bölümleri [PRODUCTION-MIGRATION-PLAN.md](PRODUCTION-MIGRATION-PLAN.md)
> içindedir. Merge kaynağı artık `codex/staging-rc` (uzak yedek
> `backup/cloudflare-staging-2026-10-15`); cutover'dan önce main'e merge yapılmaz.

2026-10-15 RC hazırlığı: geçerli dal codex/staging-rc; main eaef194 normal
yerel merge4a28f69 ile uzlaştırıldı (published124/pending134/seen11404).
136 test/18 local workerd, public162 sayfa/parity ve audit0 başarılı.
En güncel kapılar/config/OG arşiv bağımlılığı ve staging-only sıra
[STAGING-PREFLIGHT.md](STAGING-PREFLIGHT.md) en üstündedir. Web uzakta hâlâ
636936f; Boss Access/AUD/secret/sandbox kapıları eksik, URL kapalıdır.
Bu hazırlıkta uzak yazım/deploy yoktur; aşağıdaki eski uzlaştırılmadı/sürüm
notları tarihsel kayıttır. Gerçek rollout ve rollback provası ayrıca onay ister.

Goal: move the **web hosting** (static site, PHP endpoints, Studio panel, FTP
deploy) from Hostinger to Cloudflare. **Email stays on Hostinger** (owner
decision): MX, SPF, DKIM, DMARC, mailboxes and forwarding are not changed, and
no Hostinger subscription is cancelled while it provides email.

Every step below that touches production, DNS or real data needs its own owner
approval. Nothing in this document has been executed in production.

## 0. Status of the preparation

En son preflight: Boss renk commit’i `0f3fe02`, 117/18 yerel kontroller başarılı;
web staging hâlâ `636936f`, aktif version UUID ve D1 uyumu gerçek API/SELECT
ile doğrulandı. Boss Access app 0/AUD boş/secret eksik ve URL kapalıdır.
[STAGING-PREFLIGHT.md](STAGING-PREFLIGHT.md) bu durumun kanıtı ve sonraki
ayrı onaylı staging-only rollout/rollback reçetesidir. Migration gerekmiyor;
üretim/DNS/Hostinger/mail/final dosyalar bu adımın kapsamında değildir.

2026-10-14 güvenlik/Boss sprinti: araç zinciri ve navy/kırmızı Boss yalnızca
`codex/security-boss` üzerinde entegre/test edildi. Canlı staging hâlâ
`636936f`; production dağıtımı yapılmadı. Güncel salt okunur kanıt/bilinmeyenler
ve sonraki onay kapıları [INTEGRATION-SPRINT.md](INTEGRATION-SPRINT.md) içindedir;
aşağıdaki eski kaynak envanteri yeniden hesap düzeyinde doğrulanmış sayılmaz.

2026-10-14 güncel karar notu: Hostinger web/PHP ileride emekli olur, EMAIL
kalır. Tam legacy log geçmişi ve oylar korunur; final snapshot cutover’a yakın
sağlanacaktır. Manuel retention/90 gün hedefi ve gizlilik doğruluğu geçerlidir;
otomatik analytics silme yoktur. Eski legacy import seçeneklerini yeniden
karara açmak yerine final dosyalar, reconciliation, manuel işlem planı ve ayrı
üretim izinleri tamamlanır. DNDR’ye tarihsel tekrar aktarım/çift sayım yapılmaz.
Son UI polish/güvenlik audit’i/Boss hazırlığı yalnızca yereldir; bu runbook’un
üretim adımları bu oturumda uygulanmadı.

See `CURRENT-STATE.md` for the exact deployed versions. In short: implementation
on branch `dev/cloudflare-native` (never merged; `origin/main` merged into it,
not the reverse); `americawhat-web-staging` on
`https://americawhat-web-staging.hakan-c89.workers.dev` (noindex; stores page
views only from requests with the staging test key); `americawhat-boss-staging`
uploaded with **no route**; D1 `americawhat-app-staging` and
`americawhat-analytics-staging`. Production resources: **none created.**

### Branch reconciliation rule

`dev/cloudflare-native` never changes `src/data/*.json`, so `origin/main`
(fetch and panel commits) is merged **into** the development branch whenever
needed — conflict-free, every candidate kept. The branch is never rebased or
force-pushed. The final step is a reviewed pull request from the development
branch to `main`, after the pre-merge checks below.

## 1. Hostinger inventory and backup (owner, read-only)

Download `public_html` (hPanel → File Manager → compress → download) and the
private relay configuration's *existence* to an encrypted folder outside the
repository and outside any synced folder. Never paste file contents, addresses
or secrets into a chat, issue or commit.

| Class | Item | Why |
|---|---|---|
| Source code (server-only) | `public_html/boss/` (all files), `analytics/log_df.php`, `analytics/dndr-relay.php`, `analytics/tracker.php` (if present), the relay backup directory DNDR mentions | Not in `main`; needed for comparison and rollback |
| Source code (deployed from Git) | `analytics/vote.php`, `analytics/get_votes.php`, `.htaccess`, `analytics/.htaccess` | Verify they equal the repository |
| Secrets | `boss/config.php`, `/domains/americawhat.com/dndr-relay.config.php` | Record existence and date only; revoke at retirement |
| Reaction counts | `analytics/aw_votes.json` | The only copy of the vote counts |
| Visitor history | `analytics/aw_panel_log.txt` and any rotated/older log | Legacy analytics; personal data |
| Deployment artifacts | everything else, `.ftp-deploy-sync-state.json` | Rebuildable from Git; hash manifest only |
| Hosting configuration | hPanel cron jobs, PHP version, redirects, SSL, **full DNS zone list**, email accounts and forwarders (names only), domain registrar and renewal dates | Needed for the DNS move and for keeping email |

Safe summaries (print counts, dates and hashes only; `<A>` is the unpacked archive):

```powershell
Get-ChildItem -Recurse -File <A> | Get-FileHash -Algorithm SHA256 | Export-Csv <A>\..\manifest.csv
```
```bash
npm run analytics:legacy -- inventory "<A>/analytics/aw_panel_log.txt"
```
```bash
node -e "const v=JSON.parse(require('fs').readFileSync(process.argv[1]));let t=0;for(const r of Object.values(v))for(const n of Object.values(r))t+=n;console.log({keys:Object.keys(v).length,total:t})" "<A>/analytics/aw_votes.json"
```
```bash
git hash-object "<A>/boss/index.php"
```

Compare the last with `git rev-parse origin/main:public/studio/index.php`, and the
log inventory's first 1,032 lines with DNDR's snapshot SHA `33fadc4f…89468`.

### Pre-merge checks (before `dev/cloudflare-native` goes into `main`)

Merging ships the new `tracking.js` (POST beacon) and the shared slug function
to Hostinger through the FTP deploy. Production-only PHP files are **not**
assumed to match the repository copies.

| # | Check | How | Done by |
|---|---|---|---|
| 1 | The server's `analytics/log_df.php` reads `path` and `referrer` from POST | Open the downloaded copy and look for `$_POST['path']` and `$_POST['referrer']` (the reviewed copy on `staging/dndr-analytics` has `$_GET['path'] ?? ($_POST['path'] ?? '-')`). Do **not** test against production: a test POST writes a real log line | owner |
| 2 | A POST from the new beacon reaches the PHP logger (same-origin, form encoded) and DNDR still receives the relay | After merge: one visit, then the newest log line and the DNDR count for `site_americawhat` (read-only) | owner + engineer |
| 3 | The FTP deploy would not touch PHP, `.htaccess`, the vote store or the log | `node scripts/release/ftp-diff.mjs` on the build to be merged. Result on 2026-10-14 (`6453ff2`): no PHP or `.htaccess` change, nothing sensitive uploaded, only two renamed `_astro/hoisted.*.js` bundles deleted | engineer |
| 4 | Server-only files stay: `log_df.php`, `dndr-relay.php`, `tracker.php`, `boss/`, `aw_panel_log.txt`, `aw_votes.json`, private configuration | They are not in the deploy's sync state (it only replaces/deletes files it uploaded) and `aw_votes.json`, `config.php`, `studio/`, `boss/` are excluded in `deploy.yml` | verified by check 3 |
| 5 | No secret or configuration is published | `npm run verify:static` (0 failures) and the `.assetsignore`/`_headers` exclusions in `deploy.yml` | CI |
| 6 | A rollback is possible | The backup of §1 exists; the previous `main` commit can be redeployed with the manual `deploy.yml` run | owner |

## 2. DNS requirements (separate operation, later)

Worker custom domains need the zone on Cloudflare (full setup). Current public
records (read 2026-10-14):

| Record | Value | On Cloudflare |
|---|---|---|
| NS | `hermes.dns-parking.com`, `artemis.dns-parking.com` | replaced by the Cloudflare pair at the registrar |
| A `americawhat.com` | Hostinger CDN (two IPv4) | keep, **DNS only**, until the app cutover |
| AAAA `americawhat.com` | Hostinger CDN (two IPv6) | same |
| CNAME `www` | `www.americawhat.com.cdn.hstgr.net` | same |
| MX | `mx1.hostinger.com` (5), `mx2.hostinger.com` (10) | **identical, DNS only** |
| TXT SPF | `v=spf1 include:_spf.mail.hostinger.com ~all` | identical |
| CNAME DKIM | `hostingermail-a/b/c._domainkey` | identical, **DNS only** (never proxied) |
| TXT `_dmarc` | `v=DMARC1; p=none` | identical |
| anything else in the hPanel zone list | — | copy exactly; the public lookup above is not a complete list |

Order: (a) add the zone to the Cloudflare account and import the full hPanel
zone list; (b) compare record by record; (c) change nameservers at the
registrar; (d) verify mail delivery both ways and that the site is unchanged
(`server: hcdn`). Rollback: put the Hostinger nameservers back. The site does
not move in this step.

## 3a. Boss staging behind Access (owner action, no DNS change)

Cloudflare can protect a Worker's own `workers.dev` address with Access in one
step; this needs no zone and no DNS record. It creates a **new** Access
application (and a policy named `americawhat-boss-staging - Production`) in the
account's Zero Trust organisation, which my credentials cannot do and which is
a change to a shared organisation — so it is the owner's action.

1. Dashboard → Workers & Pages → `americawhat-boss-staging` → Settings →
   Domains & Routes: turn on the `workers.dev` route **and** click
   *Enable Cloudflare Access*. Until step 4 the Worker answers 503 to every
   request (no audience configured), so there is no unprotected window.
2. *Manage Cloudflare Access*: allow only `hakan@dndr.net`; copy the
   application's **AUD tag**.
3. Secrets for the staging Worker: `BOSS_CSRF_SECRET` (random) and, only if
   GitHub writes should be tested, a fine-grained `GITHUB_TOKEN` for this
   repository. The staging Boss refuses to write `main`; create a branch
   `content-staging` from `main` for it to write to.
4. In `workers/boss/wrangler.jsonc` (top level): `"workers_dev": true`,
   `"preview_urls": false`, `BOSS_ACCESS_AUD` = the AUD tag,
   `BOSS_ORIGIN` = `https://americawhat-boss-staging.hakan-c89.workers.dev`;
   deploy. Verify: anonymous → Access login; another identity → 403; owner →
   Health green.

Rollback: disable the `workers.dev` route (Cloudflare then answers 1042) and
disable Access on it, which also removes its policy.

## 3. Production provisioning (owner-approved, before cutover)

0. Confirm the Workers plan. On the Free plan a request has 10 ms of CPU; the
   Weekly review page measured about 11 ms warm and 31 ms cold for 130
   candidates (Node, 2026-10-14). The paid plan (30 s default) removes the risk;
   on Free, the review page may intermittently fail with a CPU limit error. The
   full legacy import does not depend on this (it runs as a .sql file).

1. Create D1 `americawhat-app-production` and `americawhat-analytics-production`;
   put their ids into `env.production` of both wrangler configs; apply
   `migrations/app` and `migrations/analytics` (`--remote --env production`),
   after recording a Time Travel bookmark.
2. Create the Access application for `boss.americawhat.com` (allow
   `hakan@dndr.net` only); put its AUD tag into `BOSS_ACCESS_AUD`.
3. Secrets: `GITHUB_TOKEN` (new fine-grained PAT, this repository only,
   Contents read/write, expiry noted), `BOSS_CSRF_SECRET`, `REACTION_GUARD_SECRET`.
4. Deploy `americawhat-boss --env production` (custom domain
   `boss.americawhat.com`); verify Access blocks other identities and Health is green.
5. CI: add a production deploy job behind a GitHub Environment `production` with
   required reviewer `hakandndr`, using a Cloudflare API token limited to Workers
   scripts and D1 for this account. Until then deploy by hand.

## 4. App cutover (owner-approved window)

Önkoşullar: §1 tamam; DNS Cloudflare’da (§2); §3 tamam; aynı commit üzerinde
staging smoke ve `npm run parity:live` başarılı; final log/oy snapshot’ları ile
reconciliation/manuel retention planı hazır (ANALYTICS.md §6).

1. **Reaction baseline S1:** download `aw_votes.json`; Boss → Reactions →
   upload, check the plan, apply with the SHA prefix (baseline).
2. **Legacy log S1:** download `aw_panel_log.txt`;
   `npm run analytics:legacy -- inventory <file>`, then
   `npm run analytics:legacy -- sql <file> --out private/legacy-s1.sql` and
   `npx wrangler d1 execute americawhat-analytics-production --remote --env production --file private/legacy-s1.sql --config workers/web/wrangler.jsonc`
   (run it twice: the second run must add nothing). Check the reconciliation in
   Boss. Tam geçmiş korunur; retention silmesi ayrı manuel operatör işlemidir.
   Geçici .sql dosyası doğrulama sonrasında kaldırılır (ANALYTICS.md §6).
3. Deploy `americawhat-web --env production` (custom domains `americawhat.com`
   and `www.americawhat.com`). This replaces the Hostinger A/AAAA/CNAME answers.
4. Smoke: `npm run smoke -- https://americawhat.com` (read checks only),
   `npm run parity:live`, a manual reaction and page view from a browser, Boss
   Analytics shows the native row.
5. Keep the FTP deploy running during observation so Hostinger stays current.
6. After 72 h: download S2 of both files; import them (reactions: delta, refused
   if any count decreased; log: only new lines are inserted). Repeat at
   retirement.

## 5. Rollback

- **Site:** detach the custom domains from `americawhat-web-production` and
  restore the recorded Hostinger A/AAAA/CNAME records (DNS only). Hostinger is
  current because FTP deploys continued.
- **Reactions:** Boss → Reactions → *Export current counts as aw_votes.json*;
  upload over the Hostinger file (votes cast on Cloudflare are preserved).
- **Analytics:** native rows stay in D1; on rollback the PHP logger resumes.
  Nothing is double counted because each view reached only one origin.
- **Content:** unaffected (Git).
- **D1:** forward-fix preferred; Time Travel restore only as a last resort
  (rewinds ALL # numbering, see ANALYTICS.md).

## 6. Hostinger web retirement (later, separate approval)

- 30 days stable on Cloudflare; at least two weekly review cycles done in Boss.
- Final S3 imports of `aw_votes.json` and `aw_panel_log.txt`.
- Remove the FTP job and `FTP_*` secrets; revoke the Studio PAT; ask DNDR to
  retire `aw-prod-2026-10` / `prd_americawhat_relay`.
- Remove the web files from `public_html` (owner, after the archive is verified).
- **Do not cancel the Hostinger plan while it provides email for
  americawhat.com** (MX/SPF/DKIM point to Hostinger mail).

## 7. Approvals required, in order

1. Run the Hostinger inventory/backup (§1).
2. Enable Access on the Boss staging `workers.dev` address (§3a) and review Boss
   on staging; decide on the 3 real visitor rows found in staging (ANALYTICS.md §4).
3. Merge `dev/cloudflare-native` into `main` after the pre-merge checks (§1)
   (ships the POST beacon and the new slug function to Hostinger; no visible change).
4. DNS move (§2).
5. Production provisioning (§3), including the plan check and the Access application.
6. Final log/oy snapshot’ları, reconciliation ve ayrı izinli gerçek importlar (§4.1–4.2); tam geçmişi koruma kararı verilmiştir, retention yalnızca manueldir.
7. App cutover (§4.3).
8. DNDR-side: gap import, native producer, retention of the AmericaWhat copy (separate project).
9. Privacy page update (ANALYTICS.md §6).
10. Hostinger web retirement (§6).
