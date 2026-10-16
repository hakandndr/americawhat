# AmericaWhat — Boss renk uyumu ve staging preflight

## Yeni geçerli karar — owner doğrulamasıyla deployment hazırlığı (2026-10-15)

Access dashboard'da owner tarafından doğrulandı; aşağıdaki eski API izni
bekleme kapısı artık geçerli değildir. Aynı403 isteği tekrarlanmaz, app/policy
yeniden oluşturulmaz. **[STAGING-DEPLOYMENT.md](STAGING-DEPLOYMENT.md)** güncel
config/secret/immutable artifact/versions upload/activation/rollback prosedürüdür.
Staging Git allowlist'i yanlış repo/ref'te ağ isteği göndermeden reddeder;
runtime PAT ayrıca sandbox-only olmalıdır. JWT kontrolleri zayıflatılmadı.
139 test/18 workerd; owner-only offline secret aracı ve yayımlanmamış version
yöntemi hazırdır. Canonical manifest reports/predeploy-release-manifest.json.
Upload/deploy/URL açılışı bu sprintte yapılmaz. Eski bölümdeki ordinary deploy/
secret yöntemleri ve API403 kapısı tarihsel kayıttır; yeni prosedür esas alınır.

## Güncel altyapı kaydı — 2026-10-15, açık sahip onayı sonrası

Önceki "sandbox yok / Access uygulaması yok / AUD boş" kayıtları eski gözlem
ve hazırlık aşamasıdır. **Access uygulamasının mevcut olduğu sahibi tarafından
doğrulandı; mevcut API oturumunun liste cevabı yokluk kanıtı değildir.**

- GitHub sandbox private/fork değil, **yalnız dört JSON** ile başlatıldı;
  production eaef194 snapshot'ındaki bütün blob/SHA256 değerleri aynı.
  main ve content-staging: **58cedb3e4b265ffec44d0394072b226fbd5285e9**.
  Actions **disabled**, workflow/fetch/FTP yok. Dört seed commit'i owner
  author/committer kullanır; geçmiş değiştirilmedi, production main aynı.
- Access app **932d247c-4d98-479e-a8c8-50da8a0550d1**, hesap
  **c8999b29b2123e2f9634248c58f43f14**; team **dndrnet.cloudflareaccess.com**;
  worker americawhat-boss-staging; policy **dndr-staging-owner-only**, yalnız
  **hakan@dndr.net**, **All traffic**. Bunlar sahibinin doğruladığı değerlerdir.
  Yerel staging AUD:
  `f750490dc8657f942cf2eb7af70137e0f00bd19c9b437e7d82b0f0f2fd8b194b`.
  API policy içeriği henüz bağımsız doğrulanamadı.
- `GET /accounts/{account}/access/apps/932d247c-4d98-479e-a8c8-50da8a0550d1`
  ve aynı app'in `/policies` GET'i **HTTP403, code1010, auth.forbidden**.
  Organization GET'i **HTTP403, code10000, Authentication error**.
  Mevcut Wrangler OAuth tokenPermissions listesinde Access scope yok.
  App/policy için gereken minimum izin **Access: Apps and Policies Read**;
  org için **Access: Organizations, Identity Providers, and Groups Read**.
  Write/admin izin genişletmesi gerekmez. Yeni token bu sprintte oluşturulmadı.
  [App izinleri](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/methods/get/),
  [Organization izinleri](https://developers.cloudflare.com/api/go/resources/zero_trust/subresources/organizations/methods/list/).
- Uygulama/policy yeniden oluşturulmadı, Cloudflare hesap ayarı değişmedi.
  Yerel/uzak Boss workers.dev ve previews **kapalı**. Local origin doğru;
  uzak origin/repo/AUD vars eski hâlinde; güncelleme bu onayın kapsamında değil.
  APP_DB ve ANALYTICS_DB mevcut doğru staging ID'leriyle aynı; veri/şema yok.
- GitHub PAT sahibi oluşturdu, bitiş2026-11-14; değer alınmadı/yazdırılmadı.
  Runtime PAT seçilmiş repo/izinleri bağımsız doğrulanmadı. Provisioning için
  kullanılan mevcut owner gh yönetim oturumu staging PAT değildir ve Worker'a
  kurulmadı. Production GET200 veya yönetim oturumu repo.permissions.push
  runtime PAT scope kanıtı sayılmaz. Production negatif yazma testi yapılmaz.
  **GITHUB_TOKEN ve BOSS_CSRF_SECRET uzakta hâlâ yok**; secret kurulumu ayrı,
  güvenli işlem gerektirir. Secret değeri sohbete/rapora/Git'e konmaz.

OG125 + orijinal zip hash'i **25b1d8cb08c0f923b544944ae1f1d0e13805cdb5a1962d06d4d60aa514c1d52a**
doğrulandı. İkinci byte/hash eşit backup, repo dışındaki
`C:\Users\Hakan\.codex\visualizations\2026\10\15\01a13de0-e293-7e11-b729-33732ac6f77e\AmericaWhat-RC-backup`
dizininde; `.gitignore=*`, Git'e alınmaz. OG yeniden üretilmedi.

Config AUD değiştiğinden yeni yerel commit/tam SHA ve artifact manifest üretimi
zorunludur; güncel kayıt **reports/infra-release-manifest.json**, statik envanter
**reports/infra-static-manifest.json**. Önceki4ba890c raporları ve backup korunur.
Uygulama/public kaynak/lock/migration aynı: gereksiz npm ci/audit/full136/workerd18
tekrarı yok; auth/CSRF/release regresyonu, config guard/types, RC build iki tur,
static/approved parity ve staging dry-run yeni tam SHA için kaydedilir.

Sonraki işler: mevcut app/policy için gerekli Read erişimiyle API doğrulaması
veya sahibi dashboard incelemesinin kaydı; PAT ekranında yalnız sandbox /
Contents RW / Metadata read kapsam kanıtı; güvenli bağımsız CSRF ve PAT secret
hazırlığı; uzak vars uyumu. **Bu sprint Web/Boss deploy veya URL açma izni yok.**
Vars/secret yönteminin yeni sürüm/deployment yaratıp yaratmadığı uygulanmadan
kontrol edilir; `wrangler secret put` doğrudan çalıştırılmaz. Sonraki ayrıca
onaylı deploy gerçek tamamlanmış config/yeni tam SHA ile yapılır; şu anki
kapalı Worker config'i üretime açık Boss RC'si sayılmaz. D1/retention/oy/log,
Hostinger/mail/DNS ve diğer projeler korunur.

## Geçerli kayıt — staging release candidate hazırlığı (2026-10-15)

Bu bölüm aşağıdaki eski "merge yapılmadı", b1312bf, config origin/repo ve
117/134 test kayıtlarının yerine geçer; tarihsel bölümler silinmedi. Kapsam
**yalnızca yerel RC ve salt okunur uzak doğrulama**. Uzak yazım/deploy/rollback,
repo/token/Access/DNS/Hostinger/mail ve gerçek veri işlemleri yapılmadı.

### Git ve içerik uzlaştırması

Başlangıç temiz73bc5cc08dd131235ba22e7f45ec215a68c18f5a; aynı worktree'de
yeni **codex/staging-rc**. Fetch edilen ve uzlaştırılan main
**eaef1940d66843a2062e59d59e0eb7753d9dac1c**. Incoming yalnızca pending/
seen_ids/fetch-status değiştiriyordu. Normal `merge --no-ff --no-commit`,
çakışma0, kayıp kontrolü ve test/build/parity sonrası owner kimliğiyle merge
**4a28f69aeef598fcfb926e4cc52e4897458b26e8**. Parent'lar başlangıç ve incoming;
rebase/reset/force yok. Güvenlik/Boss kabul dalı73bc5cc ve onaylı16b10a4
değişmedi. Production/Actions kaynaklarına dokunulmadı.

| Dosya | Önce → sonra | Incoming SHA256 (Git LF blobu) |
|---|---|---|
| published.json | 124 →124, birebir aynı | `2f70e7e67bdbb871e689c36f92455cb39003a21c21a6128fa455423c1db9b3da` |
| pending.json | 130 →134, kayıp0 | `e3d27c6c55e5fde9486a939a6da9aa04173b7845b6cbdd401e336cea1725ac33` |
| seen_ids.json | 11348 →11404, kayıp0 | `acf38c978db5025b57f4ce75fff6e1e3e3aeb4649dbfe1b55f5e14f6ec04b8b6` |
| fetch-status.json | güncel,5 üst anahtar | `7d9325118fc109ca0ecc580693fc49b06dd6cd83b6fe9f342504e5f4e16df297` |

Dört index/checkout clean-filter blobu incoming ile aynı; Windows CRLF
checkout ham byte hash'i Git LF hash'iyle karıştırılmaz. Yayınlar byte aynı
olduğu için yeni sayfa farkı yok:162 HTML/124 story/11 feed parçası. Onaylı
baseline'e göre tüm URL/metadata/kart/DOM/CSS aynı; public src data hariç
16b10a4 ile aynı. Production salt okunur40 URL örnekleminde metadata farkı0,
live'dan eksilen sitemap URL0;151 local vs131 production farkı daha önce
onaylanmış20 kategori/arşiv URL'sidir, yeni yayın farkı değildir.
`reports/rc-content-reconciliation.json` sayım/blob/hash kanıtını içerir.

### Yerel config ve gerçek staging'in ayrımı

Staging config/RC build commit'i **0497c8d7910c03e412f37f833d86ebab2a790578**.
Son belge/onaylı OG hash koruması commit'i dahil final tam SHA ve artifact envanteri
**reports/rc-release-manifest.json** içinde; deployed kaynak olduğu iddia edilmez.

| Ayar | Yerel aday / doğrulanan uzak durum |
|---|---|
| Public URL | `https://americawhat-web-staging.hakan-c89.workers.dev` |
| Boss origin | yerelde `https://americawhat-boss-staging.hakan-c89.workers.dev`; uzak eski custom origin değişmedi |
| Boss Git target | yerelde önerilen `hakandndr/americawhat-staging-content` / `content-staging`; uzak hâlâ production repo, **uzak token ekleme kapısı kapalı** |
| İzinli kimlik | sadece `hakan@dndr.net` |
| AUD | boş, Access app yok; gerçek değer sahibi kurulumundan sonra |
| Team domain | config `dndrnet.cloudflareaccess.com`; organization GET403, doğrulanmış sayılmaz |
| Boss route | yerelde/uzakta workers_dev=false, preview_urls=false; public route yok |
| Boss secrets | uzakta GITHUB_TOKEN ve BOSS_CSRF_SECRET yok; değer üretilmedi/okunmadı |
| Web secrets | REACTION_GUARD_SECRET/STAGING_TEST_KEY isimleri mevcut, değerler okunmadı |
| APP_DB | americawhat-app-staging / `a3c9ff1f-05c2-4ed6-bb9e-4ca41f4cc9e2` |
| ANALYTICS_DB | americawhat-analytics-staging / `306b9ee6-2529-4f95-b43c-c7cd9dbf0a3c` |

2026-10-15 08:03 UTC salt okunur GET: Access total_count0, Boss workers.dev/
preview kapalı; web açık/preview kapalı, health636936f/124/test-only/DB OK.
İki Worker version binding'i yukarıdaki aynı iki staging DB'yi gösteriyor;
D1 metadata isim/ID'leri doğrulandı. Migration kaynakları636936f ile aynı;
önceki9+20 DDL eşleşmesi korunur, yeni migration gerekmiyor. Bu sprintte gerçek
visitor/vote gövdeleri okunmadı; schema/gerçek veri seed/import/export/delete yok.
Production Boss env bloğu Git LF içeriğinde aynı, hedef boss.americawhat.com.

Aktif web deployment **462bbac6-da4a-48ba-87ee-a631a71a312e**, version
**02c0da48-f3a2-47ad-99e0-8358b9244ac7**, %100. Boss deployment
**2004d44f-c78a-4d6c-b1ab-29800d4ab491**, version
**85119d25-bc70-4871-a5f2-f9dcb3dbf896**, %100. İkisi de RELEASE_ID636936f;
rollout öncesi yeniden okunur. OAuth yalnızca GET için kullanıldı; geçersiz
ortam token'ı yalnızca alt süreçten kaldırıldı, profil değişmedi.

### Doğrulama ve yeniden üretme

| Kontrol | RC sonucu |
|---|---|
| npm ci / tam audit / dev hariç audit | lock ile kuruldu;0/0 açık |
| npm test | **136/136**; önceki134 +2 artifact determinism/fail-closed testi |
| Boss local workerd | **18/18**; auth/CSRF/atomik Git/import/retention yalnızca sentetik local state |
| Public build/statik | 162 HTML,309 dosya,300 upload/9 excluded,0 hata |
| Onaylı public parity | 162 body/CSS,124 story/card/metadata,11 parça,3652 iç link aynı |
| Derlenmiş client | homepage/detail tek beacon; ilk12+10 yükleme ile124 benzersiz story; ilk/eklenmiş kart oyları |
| Trending | gerçek derlenmiş module, sentetik totals: doğru top5; <3 sinyalde hidden |
| Boss gerçek local render/script | 6 bölüm200; authenticated script kaynakla aynı/CSP self |
| Analytics | ger190, limit25 Last8, CSV190/NDJSON190; diğer country/date/device/summary/day/top/history/debounce kontrolleri unit/DOM/SQL'de |
| Büyük local corpus | 10000/200 sayfa eksiksiz, Last4,59ms; tüm sayfalar888ms; Cloudflare CPU değildir |
| Worker dry-run + metafile | Web8/Boss21 input; npm runtime girdisi0, upload yok |
| Git hygiene | Yeni commit'ler owner author+committer; AI/coauthor trailer yok; eski tarihçe korunur |

`npm run build:rc` sadece iki build-time değişkenini çıktı aşamasında sabitler:
Random'ın geçerli statik fallback href'i content blob/path ile, RSS build tarihi
HEAD commit zamanı ile. Browser random script/public kaynak aynı; beklenen
sözleşme değişirse build durur. Aynı pinlenmiş HEAD/toolchain/OG girdileriyle iki
Astro build'in309 dosyasının tamamı byte/hash eşitliğiyle karşılaştırılır.
OG girdisi onaylı125 PNG'dir; scripts/release/approved-og.json zorunlu hash
korumasıdır. Arşiv reports/rc-approved-og.zip, SHA256
`25b1d8cb08c0f923b544944ae1f1d0e13805cdb5a1962d06d4d60aa514c1d52a`;
yeniden üretimde bu arşiv gerekir. Mevcut Python3.12.14/Pillow12.3.0 ile tam
üretimde125 PNG'de metin piksel farkı görüldü; aday görseller reddedildi,
orijinal125 dosya önceki hash'leriyle geri yüklendi. Eski renderer attestation'ı
yoktur; mevcut gen-og.py bu RC recipe'sinde çalıştırılmaz. Public overwrite
denemesi aynı dosyada bekledi; durdurulup tam üretim yalnız reports içinde
tamamlandı. Hiçbir farklı PNG release'e alınmadı. Yeni yayın/OG için ayrı
render review gerekir; mevcut RC'de içerik aynı olduğundan arşiv sabit girdidir.
Tam recipe OPERATIONS'ta; hash farklıysa build durur, test gevşetilmez.

Beklenen Worker index.js SHA256'ları:

- Web: `f43d08794c133aa3557cf960a157fb92261f542ac6435c3dfbe66bc800a6ddfe`
- Boss: `459158ebc448ccdd53306a64ed9ec6131caa4dd6f64c96c16edac93768ba4bab`

Config/env/secret/asset manifest'i Worker JS hash'inden ayrıdır; JS hash'i tek
başına dağıtım kanıtı değildir. Final head, config/lock/content ve her statik
dosya hash'i reports/rc-release-manifest.json + rc-static-manifest.json'da.
Ham raporlar reports/rc-*; Git dışındadır, secret/visitor içeriği içermez.
Grafik/gerçek cihaz/ekran okuyucu veya gerçek Cloudflare CPU testi yapılmadı.

### Sahibi için bekleyen işlemler ve sandbox önerisi

Ayrı **private, fork olmayan** hakandndr/americawhat-staging-content hâlâ en
basit etkili izin sınırıdır. GET404 (mevcut oturumca görünmüyor); oluşturulmadı.
Uzak production content-staging ref'i de yok. Bu sprint repo/token oluşturma
izni vermez. Onay sonrası yalnızca dört src/data JSON (opsiyonel README),
eaef194'ün yukarıdaki hash'leriyle başlangıç snapshot'ı; default branch ve
ayrı content-staging aynı başlangıç. .github/workflows/FTP/fetch/Actions yok,
prod deploy bağı yok. Sentetik editorial değişiklikler yalnızca sandbox dalına.

Fine-grained PAT: resource owner hakandndr, kısa expiry, **Only select
repositories = yalnızca sandbox**, Contents RW, Metadata read; diğer izinler
yok. Branch ismi PAT scope'u değildir. Token oluşturma ekranı/ayrıntısı ve
seçilmiş repo/permission envanteri sahibiyle incelenir; production repo
seçili olmadığı kaydedilir. Public production GET200 yazma yetkisi kanıtı
değildir; GET repo.permissions.push tek başına PAT kapsam kanıtı sayılmaz.
Prod ref'ine negatif yazma denemesi bile yapılmaz. İzolasyon kanıtlanamıyorsa
publishing kapalı kalır; production yazma token'ı staging'e kurulmaz.
Gelecek sandbox commit'leri de owner name/email kullanır; eski RSS workflow
aw-bot kimliği bu sprintte değiştirilmedi, fetch.yml hiçbir daldan tetiklenmez
(main'e push eder). Tarihçe yeniden yazılmaz.
[GitHub PAT izin modeli](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

### Bir sonraki açık onaydan sonra kesin uygulama sırası

1. Sahibi sandbox oluşturma/seed/PAT, yalnızca AmericaWhat staging Access/
   secrets/config/URL/deploy, sentetik test ve rollback provası kapsamını
   onaylar. Free/Paid planını dashboard'dan doğrular; usage_model=standard
   kanıt değildir. Mevcut D1 kayıtları/oylar korunur; reset/migration/restore yok.
2. Workers & Pages → americawhat-boss-staging → Access → Protect this Worker
   behind Access → All traffic. Ayrı Allow/Include Emails=hakan@dndr.net;
   Everyone/domain/bypass/service-auth yok; mevcut SSO/OTP, önerilen1h session.
   Account-wide Protect all uygulanmaz. URL henüz açılmaz. Zero Trust → Access
   controls → Applications'tan gerçek staging AUD ve team domain doğrulanır.
   Config'e gerçek değerler ayrı review commit'iyle alınır, issuer/JWKS eşleşir.
3. Sandbox repo/branch/izin kanıtını tamamla. Production repo'yu gösteren eski
   uzak Boss'a önce token ekleme. URL kapalıyken onaylı staging vars ayarlarını
   sandbox repo/branch/origin/gerçek team/AUD ile hizala; etkin version GET'inde
   doğru Git hedefini doğrula. Ayrı ≥32-byte BOSS_CSRF_SECRET ve sandbox GITHUB_TOKEN güvenli secret
   girişinden kurulur; değerlere rapor/CLI argümanı yok. BOSS_DEV_JWKS/API_BASE
   uzak ortama kurulmaz; iki mevcut D1 binding'i korunur.
4. Access policy/AUD/team/secrets/sandbox doğrulandıktan sonra kaynak staging
   config'inde workers_dev=true, preview_urls=false için ayrı review commit'i
   yap (uzak URL hâlâ kapalıdır). Bu yeni **tek** config HEAD'ini pinle ve local doğrulama/
   build:rc/dry-run/hash üretimini yenile. Şimdiki boş AUD kapalı hazırlık adayı
   gerçek dağıtım adayı yerine kullanılamaz. Hash review'su ve owner onayı aynı
   tam SHA/config içindir. Önce aktif UUID'leri/secret isimlerini tekrar oku.
5. **Web önce**: staging kök config ve tam RELEASE_ID ile deploy; --env production
   yok. Health release, version metadata %100, noindex, sitemap/RSS/301/404,
   kategori/arşiv/Load More/metadata ve static güvenlik kontrolü. Başarısızsa dur.
6. Boss'u adım4'te pinlenmiş **aynı tam SHA** ile, Access policy/AUD/team/
   sandbox/secret/D1 son GET kontrolünden sonra deploy et. Bu onaylı config
   workers.dev'yi Access arkasında açar; previews kapalıdır. Dashboard/config
   drift bırakma; arada başka config commit'i yaparsan web/Boss aynı yeni SHA
   için yeniden review edilir. Önce Access, sonra URL. Anonim login/deny, başka email deny, owner
   altı bölüm; asset endpoint dahil forged/wrong-aud/expired JWT ve CSRF negatifleri.
   [Workers Access sırası](https://developers.cloudflare.com/workers/configuration/cloudflare-access/).
7. Yalnızca onaylı sentetik yazı: test-key beacon/idempotency/origin/oy/rate,
   sandbox approval/reject/duplicate tek atomik commit ve yalnız content-staging
   ref'i; prod main önce/sonra aynı. Yeni native örnekler yalnız onaylı test
   kimlikleriyle; mevcut staging visitor/reaction satırlarına import/delete yok.
   Export/retention testleri mevcut gerçek corpus'a uygulanmaz. smoke.mjs normal
   modu da POST gönderir; bu hazırlıkta uzakta çalıştırılmadı.
8. Ölçümler: Worker Metrics/Observability'de endpoint ve sürüm/zaman penceresiyle
   CPU p50/p95/p99, cold/warm ayrımı yapılabildiğinde ayrı, errors/1102; istemcide
   elapsed/TTFB/response bytes. D1 yalnız staging DB filtresiyle rowsRead/query
   latency/response bytes, query count ve rowsWritten beklenen sentetik hacmi.
   Düşük trafik penceresinde önce/sonra farkını kaydet; DB toplamı endpoint
   ölçümüyle aynı değildir. Mevcut response helper meta.rows_read döndürmez;
   tam query attribution gerekirse ayrı review edilen staging-only ölçüm, ham
   SQL parametresi/IP/UA loglamadan uygulanır. CPU plan bütçesi ve ürün latency
   kabul sınırları rollout öncesi sahip ile belirlenir; Node ms kanıt sayılmaz.
   [Worker metrics](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/),
   [D1 rowsRead/latency](https://developers.cloudflare.com/d1/observability/metrics-analytics/).
9. Büyük corpus için **mevcut D1'ye seed yok**. Ayrı ayrıca onaylı izole geçici
   staging test DB/Worker bindings ile10k→100k→beklenen retained hacim; aynı
   source/config/gates, all/ger/date/device, First/Last/sparse/page-size100 ve
   CSV/NDJSON eşitliği. Toplam/filtre/daily/top tutarlılığı, rows_read eğimi,
   CPU/latency/HTML page-option boyutu kaydedilir. Doğrusal metadata/contains
   taraması yüksek maliyetliyse production kararı durur. İzole kaynak onayı yoksa
   hacim testi local kalır, gerçek platform hacim doğrulaması eksik işaretlenir.
10. Tam SHA/version/secret isimleri/bindings ve hash'leri kaydet; sonra ayrı
    onaylı **yeni→eski→aynı yeni** staging rollback provası. Web eski version
    02c0da48-f3a2-47ad-99e0-8358b9244ac7; Boss eski
    85119d25-bc70-4871-a5f2-f9dcb3dbf896 (güncel GET ile tekrar pinlenir).
    Boss için önce workers.dev/preview kapat, Access'i açık tut; eski kodun
    production repo hedefini yeniden yazılabilir hale getirme, sandbox token'ı
    scope'lu kalır. Rollback config vars/secret uyumunu gözden geçir; eski Boss
    eski kapalı erişim durumuna dönmeli. Web health636936f/HTTP/assets/D1 ID ve
    test sayımları; sonra review edilmiş yeni config/version ile aynı kontroller.
    D1/oy/log/Git/Access/DNS/settings rollback ile geri alınmış sayılmaz;
    test kaydı/geçmiş silinmez. Gerçek prova henüz yapılmadı.
    [Rollback sınırları](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

Öneri: yerel RC'yi kabul edip önce izole Git credential ve Access kurulumunu
onaylamak; gerçek değerler girilince yeni tam SHA'yı yeniden pinlemek. Web için
schema/API migration riski düşük; Boss'un güvenlik ve gerçek platform maliyet
kapıları tamamlanmadan production hazır kararı verilmez. Yeni fark: olağan
Astro build byte-reproducible değildi; RC-only normalize adımı ve onaylı OG
arşiv/hash koruması bu riski kontrol eder. Renderer sapması yeni risk olarak
kaydedilir; arşivin korunması/teslimi gerekir. Son main snapshot'ı freeze edilir; daha yeni
fetch varsa sessizce değiştirmek yerine yeniden reconciliation/review gerekir.
Tam legacy log/oy final dosyaları şimdi istenmez; cutover'a yakın. Manuel-only
retention90gün, Hostinger EMAIL/MX/SPF/DKIM/DMARC ve DNDR çift saymama aynı.

2026-10-15 takip notu: [Boss UX/Analytics sprinti](BOSS-UX-ANALYTICS-SPRINT.md)
beyaz metinli buton, country contains, authenticated canlı filtreleme ve
doğrudan snapshot sayfalaması ekledi; kaynak uç `71879c8`, 134 test/18 workerd.
Bu değişiklikler henüz dağıtılmadı. Aynı schema/config korunur; Analytics’e
özgü response CSP’si yeni script/connect self izni verir. Sonraki staging
doğrulamasına canlı filtre, history, /assets/analytics.js Access ve yeni sorgu
rows_read/CPU ölçümü eklenmelidir. Aşağıdaki tarihli uzak preflight/UUID’ler
bu sprintte yeniden sorgulanmadı; rollout öncesi güncel durum tekrar okunur.

2026-10-14 America/Los_Angeles; API okumaları 2026-10-15 UTC.
**Yerel uygulama ve salt okunur preflight tamamlandı; dağıtım yapılmadı.**
Başlangıç `codex/security-boss` / `3730297705ee50fc4692e63b89311462be6a28df`.
Renk commit’i **`0f3fe0281f20ec30ed8416cb0f4b28663d96c04d`**; sonraki commit
yalnızca bu preflight/devir belgeleridir. Çalışma alanı
`D:\IT\AmericaWhat\americawhat\tmp\security-boss`.

## Yerel adayın sınırı ve doğrulaması

Onaylı public tasarım dondurulmuştur; `git diff 3730297 -- src` ve
`git diff 16b10a4 -- src` boştur. Reddedilmiş V1/V2/V3 kaynakları alınmadı.
Boss yerleşim/font/spacing/tablo/form/navigation davranışı aynı; yalnızca
`workers/boss/src/html.mjs` renkleri ve theme-color değişti. Exact eşleme,
kontrast istisnaları ve kanıt [BOSS-THEME.md](BOSS-THEME.md) içinde.

| Son çalıştırılan kontrol | Sonuç |
|---|---|
| `npm test` | **117/117**, iki yeni public token/kontrast testi dahil |
| `BOSS_PREVIEW_PORT=18828` ile `test:boss-preview` | **18/18** local workerd; altı bölüm, JWT/CSRF negatifleri, atomik approve/reject, legacy/reaction import ve manuel retention |
| Build / verify:static | 162 HTML; 309 dosya, 300 upload, 9 dışlanan; 0 hata |
| verify:refinement | 124 haber, 11 parça, 3.652 iç bağlantı; metadata/kart sözleşmeleri aynı |
| verify:public-parity | 162 body DOM, CSS ve public kaynak aynı |
| test:web-client | Gerçek derlenmiş modüller, yerel web/D1; Load More 124 benzersiz haber, ana/detayda tek beacon ve oylar başarılı; uzak istek 0 |
| Tam / dev hariç npm audit | **0 / 0**, lockfile değişmedi |
| Web/Boss deploy --dry-run --metafile | Upload yok; 8/20 girdi, npm runtime girdisi 0 |
| Boss renk dışı CSS/HTML karşılaştırması | `3730297` ile aynı; mobile media/sticky-submit ve typography/radius aynı |
| Gerçek D1 şema karşılaştırması | App 9 + Analytics 20 uygulama tablo/index DDL’si, yerel migration ile aynı |

Grafik/gerçek cihaz/ekran okuyucu testi yapılmadı; görünümü sahibi inceler.
Önceki preview’dan kalan yalnızca local/sentetik `.dev.vars` dosyası silinmeden
Git dışı `.wrangler/boss-preview-vars-before-theme.dev.vars` konumuna korundu;
workerd testi bundan sonra geçti. Kimlik değerleri raporlanmadı; gerçek
ziyaretçi/oy içeriği okunmadı.
Yerel sentetik testler kendi state’ini kullanır; gerçek staging verisi değişmedi.

Kaynak sürümü `0f3fe02` olan engineering adayı hazırdır. Henüz güncel main ile
uzlaştırılmadığı ve Boss staging konfigürasyonu eksik olduğu için **dağıtılabilir
nihai RC değildir**. Bir sonraki sprintte uzlaştırma ve onaylı staging config
commit’inden sonra yeni tam SHA pinlenip aynı kontroller tekrar çalıştırılır.
Belge commit’leri de dahil gerçek yerel uç `git rev-parse codex/security-boss`;
üretilen artifact manifest’i `reports/theme-release-manifest.json` içindedir.

## Gerçek Cloudflare sürüm farkı

Mevcut Wrangler OAuth oturumuyla yalnızca AmericaWhat kaynakları okundu.
Ortamdan gelen geçersiz `CLOUDFLARE_API_TOKEN` ilk GET’i 9109 ile reddetti;
yalnızca alt süreçte kaldırılarak mevcut oturum kullanıldı. Sistem/env profili
ve hesap ayarı değiştirilmedi. Secret değerleri çıktı/rapora yazılmadı.

| Kaynak | Doğrulanan mevcut durum |
|---|---|
| Web staging health + etkin version binding | `RELEASE_ID=636936f`; Git karşılığı `636936f73d3faac901877347d53c902929324a4b` |
| Web aktif deployment | **`462bbac6-da4a-48ba-87ee-a631a71a312e`**, 2026-10-14T19:08:31.565173Z |
| Web aktif version, %100 trafik | **`02c0da48-f3a2-47ad-99e0-8358b9244ac7`** |
| Boss aktif deployment / version | `2004d44f-c78a-4d6c-b1ab-29800d4ab491` / **`85119d25-bc70-4871-a5f2-f9dcb3dbf896`**, RELEASE_ID `636936f` |
| Web URL | workers.dev açık, previews kapalı; health OK, 124 yayın, visit_collection test-only |
| Boss URL | workers.dev ve previews **kapalı**; mevcut adayda da public route yok |
| Access uygulamaları | API 200, total_count **0**; bu hesapta uygulama henüz yok |
| Zero Trust team domain | Config `dndrnet.cloudflareaccess.com`; organization GET 403/10000, gerçek auth_domain bu oturumla doğrulanamadı |
| Boss auth/credentials | Etkin version’da AUD boş; `GITHUB_TOKEN` ve `BOSS_CSRF_SECRET` secret binding’i **yok** |
| Web secret adları | REACTION_GUARD_SECRET, STAGING_TEST_KEY mevcut; değerler okunmadı/değişmedi |

Health ile deployed binding aynı kısa SHA’yı bildiriyor; Cloudflare version UUID
de bağımsız olarak kaydedildi. Bu kaynak etiketi doğrulamasıdır; health tek
başına kriptografik artifact/source attestation değildir.

Eski staging **bozuk sayılmıyor**. HTTP/HTML ve Git farkı şu ayrımı doğruladı:

| Özellik | Eski staging `636936f` | Yerel aday |
|---|---|---|
| Ana liste | 124 kart doğrudan HTML’de | İlk 12 + Load More / JS’siz parça bağlantıları |
| Kategori/arşiv | `/category/`, `/archive/`, `/feed/2/` 404 | Gerçek statik sayfalar; 11 feed parçası |
| Menü/footer | random? / About / Contact; eski footer | Onaylı Random? → Categories → Archive ve kompakt footer |
| Trending ve reaksiyonlar | **Zaten mevcut** | Korunur; parça yüklemeyle oy/beacon bağlantısı uyarlanmış |
| Public Worker API/native analytics | Mevcut ve health sağlıklı | Kaynak aynı, istemci Load More uyarlaması yeni |
| Astro/sitemap/Wrangler | Eski araç zinciri | 7.3.8 / 3.7.4 / 4.151.0; güvenlik audit’i 0 |
| Boss | Önceki UI; ulaşılmaz | Seçici altı bölüm UI + hizalanmış public renkler |

`git diff 636936f 0f3fe02 -- workers/web migrations` boş. Web/Boss config’leri,
compatibility_date `2026-09-01`, assets binding/handling, API ve iki D1 ID’si
aynı. Astro hâlâ statik `dist` üretir; SSR adapter/Pages migration yok.
Yeni HTML/CSS/JS asset hash’leri ve sayfa sayısı değişir; `_astro` immutable
cache ve Worker-first/noindex kuralları korunur. CSS minification kapalıdır;
görsel değerler korunur, staging’de transfer maliyeti ölçülür.

## D1 ve staging verisinin korunması

Yeniden kullanılabilir mevcut kaynaklar:

- `americawhat-web-staging` ve `americawhat-boss-staging` Worker’ları.
- APP_DB `americawhat-app-staging`, **a3c9ff1f-05c2-4ed6-bb9e-4ca41f4cc9e2**.
- ANALYTICS_DB `americawhat-analytics-staging`, **306b9ee6-2529-4f95-b43c-c7cd9dbf0a3c**.
- Web’in mevcut iki server-side secret’ı ve noindex/test-only ayarı.

Uzak SELECT yalnızca sqlite_master ve d1_migrations metadatasındaydı; gerçek
analytics/reaction satırları okunmadı veya export edilmedi. Uzakta
`0001_app_core.sql`, `0001_analytics_core.sql` uygulanmış; DDL aynı.
Bu aday için **yeni migration veya web ortam değişkeni gerekmiyor**.
Yeni RELEASE_ID tam SHA olmalı. Boss’un eksikleri aşağıdadır.

Static asset/Worker upload’u D1 reset/import/delete gerektirmez. Aynı ID’leri,
secret’ları ve şemayı korumak mevcut staging test verisini korur. Deploy planında
migration apply/create/drop/seed ve D1 restore yok. Boss aynı staging DB’lerini
gördüğünden destructive/import testleri mevcut kayıtları etkileyebilir:
ilk uzak turda yalnızca read ve delete-preview; gerçek Delete/Import için
ayrıca onaylı sentetik corpus ve öncesi/sonrası inventory gerekir. Var olan
3 visitor/2 test dışı vote hakkında eski karar beklemesi korunur; temizlenmez.

## Git içerik uzlaştırması ve RSS kimliği — henüz yapılmadı

Son fetch/ls-remote: main **b1312bfff52279c9a74058e51fb3e3a4f15aacb5**;
`content-staging` ref’i yok. `4438907` geliştirme tabanından sonraki tek main
commit’i `b1312bf` fetch güncellemesi. Ortak ata `302549b`.

| Veri | Yerel | Son main |
|---|---|---|
| published | 124 | 124; byte/hash aynı |
| pending | 130 | 131 |
| seen IDs | 11.348 | 11.373 |
| fetch-status | Eski durum, 5 üst anahtar | Yeni fetch durumu, 5 üst anahtar |

Blob hash’leri Git dışı `reports/theme-content-reconciliation.json` içinde.
[INTEGRATION-SPRINT.md](INTEGRATION-SPRINT.md) C bölümündeki kesin PowerShell
reçetesi bu dalın yeni ucundan da geçerlidir: temiz ağaç, yeniden fetch,
gelen SHA kontrolü, yeni `codex/reconcile-main` dalı, **ordinary
`merge --no-ff --no-commit`**, dört veri dosyasının incoming snapshot ile
eşitliği, public kaynak (data hariç) korunumu, test/build/parity, sahibi adına
merge commit’i. Uç değişmişse plan yeniden incelenir. Çakışmalar körlemesine
çözülmez; rebase/reset/force-push/`-X ours` yok. Bu sprintte merge yapılmadı.

RSS kimliği halen aw-bot / actions@users.noreply.github.com; API commit’i
`actions` hesabına bağlıyor. Contributors API yalnızca hakandndr (324) gösteriyor.
Onay sonrası yalnızca gelecekteki fetch commit’leri için workflow’daki iki git
config değeri `Hakan Dundar` / `hakan@dndr.net` yapılmalı; sahibi GitHub Emails
ekranında adresin doğrulanmış olduğunu kontrol eder. Ayrı yerel bakım commit’i
ve review gerekir; bu sprintte workflow veya tarihçe değiştirilmedi.
`fetch.yml` manuel olarak başka daldan çalıştırılsa da **main’e push** eder;
staging editör testinde kesinlikle tetiklenmez. `deploy.yml` main push’u
Hostinger’ı etkiler; bu sprintte veya staging rollout’ta main’e push/merge yok.

## Boss staging: sahibi için kesin hazırlık adımları

Bu bölüm **sonraki ayrıca onaylı sprintte** uygulanır; henüz hiçbir ayar yok.
Production hedefi `boss.americawhat.com` kalır. DNS/mail cutover’ı olmadan
staging için önerilen URL:
`https://americawhat-boss-staging.hakan-c89.workers.dev`.
Mevcut `BOSS_ORIGIN=https://boss-staging.americawhat.com` bu seçimle uyuşmaz;
sonraki staging config commit’inde gerçek HTTPS origin’e birebir ayarlanmalıdır.

1. Cloudflare Dashboard → **Workers & Pages → americawhat-boss-staging →
   Access → Protect this Worker behind Access → All traffic**. Yalnızca bu
   Worker seçilir; hesap genelindeki Protect all Workers kullanılmaz.
2. Authentication policy: ayrı AmericaWhat Boss staging Allow policy;
   **Include → Emails → hakan@dndr.net**. Everyone/email-domain, Bypass veya
   Service Auth kuralı eklenmez. Session duration önerisi 1 saat; yalnızca
   sahibinin kullanacağı doğrulanmış e-posta sağlayıcısı/OTP veya mevcut SSO
   seçilir. Başka uygulamaların policy/IdP ayarları değiştirilmez. Apply Access.
3. **Zero Trust → Access controls → Applications** içinde bu Worker’ın yeni
   uygulamasını aç; Application Audience (AUD) Tag’i al. AUD bir secret değildir;
   production app AUD’sinden ayrı olmalıdır. Team domain’i doğrula. Mevcut
   config’e göre beklenen issuer `https://dndrnet.cloudflareaccess.com`, JWKS
   `https://dndrnet.cloudflareaccess.com/cdn-cgi/access/certs`; org GET 403
   nedeniyle gerçek domain doğrulanana kadar bu değer varsayım olarak kalır.
   `BOSS_ACCESS_TEAM_DOMAIN` yalnızca hostname, AUD yalnızca bu staging app tag’i.
4. Worker **Settings → Variables and Secrets**: `ENVIRONMENT=staging`,
   izinli email tek kişi, staging origin/team/AUD ve staging Git repo/branch
   değerlerini planla. Kaynak config’te de aynı değerleri ayrı commit’te tut;
   dashboard ile dosyanın çelişmesine izin verme. Bu sonraki config commit’inde
   yalnızca staging kökünde `workers_dev:true`, `preview_urls:false` olacak;
   production env/route bloğu aynı kalır. `BOSS_CSRF_SECRET` için ayrı
   rastgele ≥32-byte secret ve aşağıdaki staging-only `GITHUB_TOKEN` ekle;
   değerleri Git’e, komut argümanına, loga veya rapora yazma.
5. Worker **Bindings**: yukarıdaki iki staging D1 ID’sini doğrula; production
   ID’si veya DNDR production binding’i ekleme. BOSS_DEV_JWKS ve
   BOSS_GITHUB_API_BASE yerel seam’lerini uzak secret/var olarak kurma.
6. Access policy/AUD/secrets/config doğrulandıktan sonra **Domains (bazı
   ekranlarda Settings → Domains & Routes) → workers.dev → Enable**.
   Önce Access korunumu, sonra URL açılışı. Preview URLs kapalı kalır.
   Bu değişiklik de ayrıca onay ister; güvensiz geçici route açılmaz.
7. Oturum açmadan 302/login veya 403, yetkisiz email için deny; oturumlu
   sahibi altı bölüme erişir. Worker hâlâ RS256 signature/kid, issuer,
   audience, expiry/nbf ve email doğrular. Sahte header/JWT, yanlış AUD,
   süresi geçmiş JWT ve eksik secret negatifleri sınanır. Access’i bypass
   ederek test etmek için açık alternatif URL kurulmaz.

Access cookie/session Cloudflare’a aittir; uygulama ek session cookie tutmaz.
Her POST tam `Origin=BOSS_ORIGIN`, varsa `Sec-Fetch-Site=same-origin`, imzalı
kimlik/subject ve mevcut/önceki 12 saat penceresine bağlı HMAC CSRF ister.
Access session süresi bu form token ömründen bağımsızdır; Access/JWT geçersizse
form token’ı erişim sağlamaz. No-store/CSP/frame koruması kaynakta aynı.
[Güncel Worker Access adımları](https://developers.cloudflare.com/workers/configuration/cloudflare-access/),
[JWT doğrulama](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

### GitHub credential izolasyonu: branch adı izin sınırı değildir

[Fine-grained PAT](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
repo + permission bazında kısıtlanır; yalnızca `content-staging` branch’ine
scope verilemez. Mevcut Worker non-production bağlamında main/master’ı reddeder,
ancak token’ın repo düzeyindeki erişimini daraltmaz. Production repo’ya yazabilen
sahibi token’ını yalnızca branch var’ını değiştirerek kullanmak yeterli değildir.

En güvenli öneri, **ayrı onayla** yalnızca AmericaWhat’a ait bağımsız staging
içerik deposu (önerilen ad `hakandndr/americawhat-staging-content`, henüz yok)
ve içinde `content-staging` dalıdır. GitHub → + → New repository → bu ad,
Private, yalnızca README ile initialize; Create repository. Repo branch
menüsü → View all branches → New branch → `content-staging`, source main.
Pinlenen son production main snapshot’ındaki `src/data/published.json`,
`pending.json`, `seen_ids.json`, `fetch-status.json` bu dalda aynı yollarla
seed edilir ve hash’leri karşılaştırılır. `.github/workflows`/FTP/deploy/fetch
otomasyonu kopyalanmaz; repo fork edilmez.
Sahibi GitHub → Settings → Developer settings → Personal access tokens →
Fine-grained tokens → Generate new token; Resource owner hakandndr, kısa expiry,
Only select repositories **yalnızca bu sandbox repo**, Contents read/write ve
zorunlu Metadata read; Actions/Workflows/Administration yok.
`BOSS_GITHUB_REPOSITORY` bu repo, branch `content-staging` olur. Böylece yanlış
branch seçimi production repo’ya yazamaz; app guard da korunur. Token prod
içeriğe public read yapabilse bile production write izni yoktur.

Asıl `hakandndr/americawhat/content-staging` zorunlu tutulursa server-side
ruleset/branch korumasıyla staging aktörünün **tüm production ref güncellemeleri**
engellenmeli ve owner/admin bypass kalmadığı kanıtlanmalıdır. Sahibinin PAT’i
aynı kullanıcı kimliğini taşıdığından bu ayrım güvenilir olmayabilir; ayrı
GitHub App/aktör tasarımı ve branch koruma review’su gerekir. Bu sprintte
depo/App/ruleset oluşturulmadı ve koruma kanıtlanmadı. Bu durumda Boss
publishing kapısı kapalı kalır; owner’ın production PAT’iyle deneme yapılmaz.

## Bir sonraki ayrıca onaylı rollout: hazırlık → deploy → doğrulama

1. İçeriği yukarıdaki normal merge prosedürüyle uzlaştır. Staging Git izolasyonu
   ve Access yolunu sahibi onaylar; gereken staging config’ini ayrı commit’te
   tamamla. Production env bloğuna/Hostinger/workflow’a dokunma.
2. Temiz ağaçtaki **tam SHA** `$rc` olur. npm ci/audit/test, OG/build/static,
   URL/SEO/public parity, Boss token/kontrast, workerd ve derlenmiş istemci
   kontrolleri çalışır. Yeni yayınlar varsa OG ve beklenen sayfa seti hesaplanır;
   test geçsin diye baseline gevşetilmez. Secret adları/scopelarını doğrula.
3. Mevcut iki deployment/version UUID’sini tekrar oku; yukarıdaki uçlar değiştiyse
   rollback hedefini güncelle ve yeniden review et. Staging-only D1 inventory/
   güvenli yedek gereksinimi sahibiyle belirlenir; bu sprintte export/backup yok.
   Yeni migration gerekmediğinden migration apply/reset/seed **çalıştırılmaz**.
4. Onaylı kesin config ve SHA ile aşağıdaki komutlar kullanılır; burada çalıştırılmadı:

```powershell
Set-Location D:\IT\AmericaWhat\americawhat\tmp\security-boss
if (git status --porcelain) { throw 'Temiz ağaç gerekli.' }
$rc = git rev-parse HEAD
# $rc, review edilen tam SHA ile birebir karşılaştırılır; config/dry-run review tamamlanmış olmalı.
$env:WRANGLER_SEND_METRICS = 'false'
# Geçersiz ortam token'ı varsa yalnızca bu shell'de kaldır; mevcut doğru oturumu doğrula.
Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue
node node_modules/wrangler/bin/wrangler.js deploy --dry-run --config workers/web/wrangler.jsonc --var RELEASE_ID:$rc
if ($LASTEXITCODE -ne 0) { throw 'Web dry-run başarısız.' }
node node_modules/wrangler/bin/wrangler.js deploy --dry-run --config workers/boss/wrangler.jsonc --var RELEASE_ID:$rc
if ($LASTEXITCODE -ne 0) { throw 'Boss dry-run başarısız.' }
# Aşağıdaki iki komut UZAK YAZIMDIR: yalnızca sonraki ayrı rollout onayıyla.
node node_modules/wrangler/bin/wrangler.js deploy --config workers/web/wrangler.jsonc --name americawhat-web-staging --var RELEASE_ID:$rc
if ($LASTEXITCODE -ne 0) { throw 'Web deploy başarısız; Boss ile devam etme.' }
# Web health, read smoke ve $rc/version doğrulaması burada tamamlanır.
node node_modules/wrangler/bin/wrangler.js deploy --config workers/boss/wrangler.jsonc --name americawhat-boss-staging --var RELEASE_ID:$rc
if ($LASTEXITCODE -ne 0) { throw 'Boss deploy başarısız.' }
```

`--env production`, main push/merge, Pages/FTP deploy veya account-wide ayar
yoktur. Boss config’te AUD boşken veya credential/Access izolasyonu eksikken
bu komut bloğuna geçilmez. Secrets deploy komutuna argümanla verilmez.

5. Web `/api/health.release == $rc`; Cloudflare deployment/version `%100`
   metadata’sında da aynı RELEASE_ID görülür. Boss health ekranı sürüm etiketi
   göstermediğinden Boss version metadata RELEASE_ID’si ayrıca karşılaştırılır.
6. Önce GET: ana/detay/about301/404, RSS/sitemap/robots/security headers,
   Load More sırası/124 benzersiz haber, JS’siz sayfalama, category/archive,
   menu/footer ve manuel public görünüm. Trending yeniden tasarlanmaz; mevcut
   sayaç görünümü kontrol edilir. PHP/config/log/static-secret sızıntısı yok.
7. **Ayrıca izinli sentetik staging yazılarıyla** tek beacon/test-key, origins,
   native event idempotency, tekrar oy/rate-limit ve counts API doğrulanır.
   Mevcut gerçek/test dışı satırlar veya oylar silinmez. `smoke.mjs --write`
   staging reaction ve beacon yazar; bu sprintte çalıştırılmadı. Script’in normal
   modu bile negatif POST gönderir; mevcut preflight sadece GET/SELECT kullandı.
8. Access owner/unauthorized/JWT/CSRF testleri; altı Boss bölümü/filtre/export
   yalnızca onaylı sentetik veriyle; approval/reject/duplicate bir Git commit’i
   ve yalnızca sandbox content-staging ref’i değiştirir. Gerçek main önce/sonra
   aynı kalmalı. Audit/error loglarında token/IP/UA gereksiz sızıntısı aranır.
9. Cloudflare Worker **Metrics / Observability** üzerinden cold/warm CPU,
   errors ve latency; D1 query latency/rows_read ölçülür. Hesap planı Billing /
   Workers plan ekranında sahibi tarafından doğrulanmalı; `usage_model=standard`
   tek başına Paid kanıtı değildir. Review/Analytics günlük SELECT ve tam geçmiş
   import yükü ölçülür; LIMIT 60 sadece çıktı sınırıdır. Free HTTP 10ms bütçesi
   gerçek Worker CPU’suyla değerlendirilir; eski Node zamanları ölçüm sayılmaz.
   [Güncel limitler](https://developers.cloudflare.com/workers/platform/limits/).

## Rollback hedefi ve doğrulama sınırı

Yukarıdaki mevcut version UUID’leri API ile okundu; CLI rollback argümanları
kurulu Wrangler 4.151.0 `--help` ile doğrulandı. Web Worker kaynakları/29 DDL
tanımı aynı olduğundan eski kod yeni şema gerektirmez. **Gerçek Cloudflare
rollback çalıştırılmadı/prova edildiği iddia edilmez**; izinsiz deploy/rollback
bu sprintte mümkün değildir. Tam uzak geri dönüş provası sonraki rollout
onayının parçası olmalı: yeni staging → önceki version → health/GET → aynı
pinlenmiş yeni version; D1 veya production geri yüklenmez.

```powershell
# Yalnızca ayrıca onaylı rollback anında; güncel hedef UUID tekrar doğrulanır.
node node_modules/wrangler/bin/wrangler.js rollback 02c0da48-f3a2-47ad-99e0-8358b9244ac7 --name americawhat-web-staging --config workers/web/wrangler.jsonc
node node_modules/wrangler/bin/wrangler.js rollback 85119d25-bc70-4871-a5f2-f9dcb3dbf896 --name americawhat-boss-staging --config workers/boss/wrangler.jsonc
```

Dashboard alternatifi: Workers & Pages → **ilgili staging Worker → Deployments**
→ hedef version’ın üç nokta menüsü → Rollback. Sonra web health `636936f`,
HTTP/asset davranışı, bindings ve D1 ID’leri doğrulanır. Access/credential sorunu
varsa önce Boss workers.dev/preview URL’lerini kapat; Access’i açık tut.
Önceki Boss zaten erişime kapalıydı: version rollback tek başına URL/Access
durumunu eski haline getirmiş sayılmaz.

[Cloudflare rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
kod/asset/binding sürümünü değiştirir; D1 kayıtlarını, Git commit’lerini, DNS,
Access policy’sini veya yapılan editorial testleri geri almaz. Yeni secret ve
route/settings durumları ayrıca kontrol edilir. Bu aday şema değiştirmediğinden
DB restore gerekmez; gelecekte şema değişirse ayrıca backward-compatibility/
backup planı gerekir. Geri dönüş için test verisi veya geçmiş silinmez.

## Bekleyen sahip karar/onayları ve değerlendirme

Yerel renk görünümünü inceleme; content merge; staging Git repo/credential
izolasyonu; yalnızca Boss staging Access/AUD/origin/secrets/URL değişiklikleri;
tam SHA staging upload’u ve sentetik yazı/rollback provası ayrı onay ister.
Şu an final FTP log/oy snapshot’ı istenmez. Hostinger web/PHP daha sonra
emekli olur, EMAIL/MX/SPF/DKIM/DMARC kalır. Tam legacy log ve votes korunur;
90 gün raw IP/UA hedefi ve yalnızca manuel silme geçerlidir. Privacy vaadi
üretim öncesi gerçeğe uymalı; otomatik silme/DNDR tarihsel tekrar sayım yoktur.

Mühendislik önerisi: web’in aynı API/şema ve izolasyonla güncellenmesi düşük
migration riski taşır; Boss için asıl kapı UI değil Access + Git credential
sınırıdır. En güçlü ve basit izolasyon ayrı staging içerik deposudur. Free/Paid
kararı ve Analytics tam geçmiş sorgu maliyeti gerçek ortamda ölçülmeden
production hazır denmez. CSS minification kapalı aktarım boyutu ayrıca ölçülür.
İlk rollout sentetik ve geri dönüş provasıyla sınırlı tutulmalıdır.

Ham kanıtlar Git dışı `reports/theme-*`, `tests-theme.tap`, `boss-theme.log`,
`audit-theme*.json`, `web-client-theme.json` altındadır. Diğer projeler,
Cloudflare kaynakları, DNS, Hostinger, production içerik/oy/analytics değişmedi.
