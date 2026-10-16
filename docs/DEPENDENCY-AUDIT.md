# AmericaWhat — Bağımlılık güvenlik değerlendirmesi

Güncel sprint: aşağıdaki 21 bulguluk kayıt tarihsel başlangıçtır. Ayrı `codex/security-boss` dalında izinli yükseltme tamamlandı; temiz npm ci ve güncel audit 0 bulgu verdi. Sonuç ve sınırlar SECURITY-REMEDIATION.md’dedir. Onaylı eski dal korunur; uzak dağıtım yok.

2026-10-14 (America/Los_Angeles). Başlangıç: `design/staging-refinement` / `e7d2116`.
Bu çalışma **salt okunur audit ve planlamadır**. Paket kurulumu/yükseltmesi,
`npm audit fix`, lockfile yeniden üretimi veya altyapı değişikliği yapılmadı.

## Sonuç ve kanıt

`npm audit --json`: **21 etkilenen paket** (1 kritik, 16 yüksek, 4 orta),
45 farklı advisory. Bu sayı 21 bağımsız saldırı yolu anlamına gelmez:
Astro/Wrangler gibi üst paketler alt bağımlılıkları nedeniyle de raporlanır.
`npm audit --omit=dev --json`: **19 paket** (1 kritik, 14 yüksek, 4 orta).
Doğrudan etkilenenler `astro@4.16.19` ve `wrangler@4.147.0`; diğerleri transitiftir.

Npm etiketleri dağıtım mimarisiyle aynı şey değildir: Astro `dependencies`
altında olmasına rağmen bu projede HTML/CSS/JS **üretir**; sunucuda Astro SSR
çalışmaz. Wrangler/Miniflare `devDependencies` zincirindedir ve yerel geliştirme/
paketleme aracıdır. Gerçek Worker çalışma zamanı özel `workers/` kaynakları ve
platform API’leridir; bu ayrım açıkları yok saymak için kullanılmamalıdır.

Kanıtlar (yerel `reports/`, Git dışı):

- `audit-polish.json`, `audit-polish-prod.json`: güncel npm audit çıktıları;
  güvenlik bulguları nedeniyle beklenen çıkış kodları 1.
- `dependency-tree-polish.json`, `dependency-paths-polish.json`: `npm ls --all`
  ile gerçek kurulu zincirler; `registry-assessment-polish.json` ve
  `fix-candidates-polish.json`: salt okunur npm registry sürüm/aralık bilgileri.
- Wrangler `deploy --dry-run --metafile --outdir reports/polish-{web,boss}-bundle`
  ile **upload yapılmadan** üretilen paketler: web 8, Boss 20 girdi;
  ikisinde de `node_modules` girdisi ve etkilenen npm modülü **yok**.
- Astro’nun mevcut JavaScript build API’sine yalnızca modül listesini kaydeden
  geçici Vite kancası verilerek çıktı incelendi (`polish-bundle-module-map.json`).
  Altı tarayıcı JS çıktısında üçüncü taraf npm modülü **yok**. Astro sunucu
  renderer modülleri ara build aşamasında kullanılıyor; statik `dist/` içine
  SSR sunucusu olarak yayımlanmıyor. GA ve Buttondown gibi dış servisler bu
  lockfile audit’inin kapsamı değildir.
- `verify:static`: 308 dosya, yüklenebilir 299, dışlanan 9 eski sunucu dosyası,
  162 HTML, 124 haber, 0 hata. İki Worker’ın uzak dağıtılmış bundle’ı indirilmedi;
  çalışma zamanı kapsamı yerel kaynak/bundle üzerinden doğrulandı.

## Paket bazında envanter ve düzeltme yolu

`prod` aşağıda npm kurulum etiketidir; son sütundaki kullanım gerçek mimaridir.
Sürümler audit anındaki adaylardır; yükseltme yapılmadı ve aday ağacın tamamına
yeni audit/test uygulanmadı. “Uyumlu” mevcut ebeveyn semver aralığına sığmayı
anlatır, davranış garantisi değildir.

| Paket / kurulu sürüm | Derece; doğrudanlık; npm etiketi | Gerçek kullanım, etki ve düzeltme değerlendirmesi |
|---|---|---|
| astro 4.16.19 | Kritik; doğrudan; prod | Build/dev; 18 kendi advisory’si + alt paket etkileri. Audit 7.3.8 öneriyor: **major** geçiş. 4.x aralığında tam düzeltme yok. |
| wrangler 4.147.0 | Yüksek; doğrudan; dev | Miniflare → Sharp üzerinden. **4.151.0 minor** adayı; kök sürüm exact pin olduğu için ayrıca onaylı manifest değişikliği ister. |
| miniflare 5.20261001.0-alpha | Yüksek; transitif; dev | Yerel Worker emülatörü; Sharp aktarımı. Wrangler 4.151.0, Miniflare 5.20261012.0-beta ve Sharp 0.35.5 getirir; alpha→beta davranışı workerd testi ister. |
| sharp 0.33.5 / 0.35.4 | Yüksek; transitif; prod + dev | Astro optional görsel servisi / Miniflare. libvips/libheif/librsvg bulguları. Tüm raporlanan Sharp aralıkları için 0.35.5 adayı; Astro’nun `^0.33.3` ve Miniflare’ın exact `0.35.4` pinine sığmaz. Ebeveyn yükseltmesi gerekir; 0.x minor uyumluluğu varsayılmaz. |
| vite 5.4.21 | Yüksek; transitif; prod | Build/dev sunucusu; Windows dosya ifşası, map traversal, UNC/NTLM. Kendi advisory’leri için en erken 6.4.3; Astro’nun `^5.4.11` aralığı dışında. Desteklenen Astro/Vite çiftiyle yükseltme. |
| esbuild 0.21.5 | Orta; transitif; prod | Astro/Vite dönüştürme aracı. Advisory `serve()` CORS yolunda; bu projenin build çağrıları serve değildir. ≥0.25.0, mevcut 0.21.x aralıkları dışında. Wrangler’ın ayrı 0.28.1 kopyası bu bulgudan etkilenmez. |
| devalue 5.8.1 | Yüksek; transitif; prod | Build/SSR serileştirme kütüphanesi; bellek ifşası, CPU/bellek amplifikasyonu, rejection/prototip bulguları. Tarayıcı ve Worker paketlerinde yok. **5.9.3 minor**, `^5.1.1` içinde kendi advisory’lerini kapatan aday. |
| http-cache-semantics 4.2.0 | Yüksek; transitif; prod | Astro HTTP cache; max-stale ile kullanıcılar arası cache ifşası. Worker bu kütüphaneyi kullanmaz, kimlikli Astro HTTP cache yok. **4.3.0 minor**, `^4.1.1` içinde. |
| js-yaml 3.15.0 (iki kopya), 4.3.0 | Yüksek; transitif; prod | Frontmatter/araç config okuma; `!!omap` ve merge ile CPU DoS. Yayın verisi JSON; ziyaretçi YAML girişi yok. **3.15.2 ve 4.3.2 patch** kendi advisory’leri için uyumlu. 3.x hâlâ argparse 1 → sprintf zincirini taşır. |
| argparse 1.0.10 (iki kopya) | Orta; transitif; prod | YAML/CLI zincirinde sprintf-js aktarımı; bağımsız advisory yok. Sadece js-yaml 3 patch’i tüm zinciri kapatmaz; ebeveyn zincirin kaldırılması/güncellenmesi gerekir. 2.0.1 kopyası bu bulguya dahil değil. |
| sprintf-js 1.0.3 | Orta; transitif; prod | Kontrolsüz precision ile DoS; ziyaretçi-controlled format yok. Registry latest 1.1.3 de etkileniyor; yayımlanmış temiz aday bulunmadı. Kör override yerine eski ebeveyn zincirini kaldırma. |
| browserslist 4.28.5 | Yüksek; transitif; prod | Babel hedef çözümü; sınırsız cache/OOM, güvenilmeyen custom stats ile crash/prototip. Repo kontrollü build girdisi. **4.28.7 patch**, ebeveyn aralığında. |
| baseline-browser-mapping 2.10.42 | Orta; transitif; prod | Browserslist veri çözümü; geçersiz girdide süreç sonlandırma. **2.11.0 minor**, `^2.10.42` içinde. |
| postcss 8.5.16 | Yüksek; transitif; prod | CSS build; saldırgan CSS/sourceMappingURL ile yerel map ifşası. Ziyaretçiden CSS işlenmez. **8.5.23 patch**, mevcut aralıkta; iki advisory’yi karşılar. |
| source-map-js 1.2.1 | Yüksek; transitif; prod | PostCSS/magicast map okuma; bölüm offset’leriyle DoS. Build girdisi. **1.2.2 patch**, iki ebeveyn aralığında. |
| nanoid 3.3.15 | Yüksek; transitif; prod | PostCSS ID üretimi; sıfır/negatif boyutla döngü. Ziyaretçi boyut parametresi yok. **3.3.18 patch**, `^3.3.12` içinde. |
| braces 3.0.3 | Yüksek; transitif; prod | Glob parser; derin desenle stack DoS. Build desenleri kaynak kontrollü. Registry latest 3.0.3 de etkileniyor; temiz yayımlanmış aday yok. |
| micromatch 4.0.8 | Yüksek; transitif; prod | braces aktarımı; bağımsız advisory yok. Sırf bu paketi aynı sürüm aralığında yenilemek çözmez. |
| fast-glob 3.3.3 | Yüksek; transitif; prod | micromatch → braces aktarımı; build dosya eşleme. Astro’nun yeni glob zincirine geçişini değerlendirme. |
| find-yarn-workspace-root2 1.2.16 | Yüksek; transitif; prod | preferred-pm → micromatch → braces; exact parent pin. Üst araç zinciri değişikliği gerekir. |
| preferred-pm 4.1.1 | Yüksek; transitif; prod | Paket yöneticisi/workspace keşfi üzerinden aktarım; bağımsız advisory yok. Astro major geçişi bu eski zinciri kaldırma adayı. |

`fixAvailable: true` her paketin kendi patch’inin yeterli olduğunu **göstermez**.
Örneğin sprintf/braces için registry’de temiz sürüm yok; npm’nin çözümü üst
bağımlılık ağacının değişmesi olabilir. Buna karşılık mevcut aralıklara uyan sekiz paket grubu
(baseline mapping, browserslist, devalue, HTTP cache, YAML, nanoid, PostCSS,
source-map) yalnızca **kısmi** iyileştirme sağlar; kritik Astro, eski Vite/
esbuild ve glob/sprintf zincirlerini tek başına bitirmez. YAML için iki ana sürüm hattı ayrı güncellenmelidir.

## Astro advisory’lerinin bu projedeki erişilebilirliği

Kritik [GHSA-26w7-cxv4-gfx2](https://github.com/withastro/astro/security/advisories/GHSA-26w7-cxv4-gfx2),
güvenilmeyen AVIF’in Astro/Sharp görsel optimizasyonuyla işlenmesine bağlıdır;
upstream düzeltme Astro 7.2.8 / Sharp 0.35.4’tedir. Sonraki Sharp/librsvg
bulgusu için bu audit tarihinde 0.35.5 de gerekir. Mevcut repo `astro:assets`
servisi, uzak görsel optimizasyonu veya AVIF girişi kullanmıyor; OG üretimi
yerel Python/Pillow’dur. Public Worker’da `/_image` işleyicisi bulunmaz.
Bu nedenle mevcut web üzerinden kritik RCE yolu tespit edilmedi; paket sürümü
gerçekten etkileniyor. Gelecekte güvenilmeyen görsel build’e alınırsa geliştirici/
CI kimlik bilgileri de risk altına girebilir; kritik bulgu kapatılmalıdır.

| Astro advisory kimliği | Etki ailesi | AmericaWhat değerlendirmesi |
|---|---|---|
| 5ff5-9fcw-vg88, hr2q-hp5q-x767 | Host/header/URL doğrulama | Astro SSR request pipeline yok; Boss ayrı Worker. |
| wrwg-2hg8-v723, xr5h-phrj-8vxv | Server island XSS/replay | Server island kullanılmıyor. |
| x3h8-62x9-952g | Dev server yerel dosya okuma | Dağıtım yolu değil; Astro dev çalıştıran geliştirici için bağlama bağlı risk. |
| fvmw-cj7j-j39q | Cloudflare adapter `/_image` XSS | `@astrojs/cloudflare` kurulu değil; özel Static Assets Worker kullanılır. |
| ggxq-hp9w-j794, whqg-ppgf-wp8c, 376h-93r7-7g6f | Middleware/base-path auth bypass | Astro auth middleware yok; Boss JWT kontrolü her route’tan önce çalışır. |
| g735-7g2w-hh3f | Remote-image allowlist bypass | Uzak Astro görsel işleme yolu yok. |
| j687-52p2-xcff | `define:vars` script kapanışı XSS | Kullanılan tek yer Random slug listesi; `assignSlugs` çıktısı ve mevcut 124 slug güvenli URL segmentleri, request-derived veri yok. Build kaynak güveni yine gerekli. |
| jrpj-wcv7-9fh9, f48w-9m4c-m7f5 | Attribute-name spread XSS | Ziyaretçi kontrollü attribute adı render edilmez. |
| 7pw4-f3q4-r2p2, 4g3v-8h47-v7g6 | Transition directive/animation XSS | ViewTransitions/hydrated transition kullanılmıyor. |
| 2pvr-wf23-7pc7 | Prerender error fetch Host SSRF | İstek alan Astro server yok; runtime özel Worker. |
| 8hv8-536x-4wqp | Slot-name XSS | Slot adları sabit kaynak kodudur. |
| 26w7-cxv4-gfx2 | AVIF RCE | Yukarıdaki kritik inceleme; mevcut tetikleme yolu bulunmadı. |

Advisory kimlikleri `GHSA-` önekiyle npm audit kayıtlarıdır. Özellikle
[`define:vars` upstream raporu](https://github.com/withastro/astro/security/advisories/GHSA-j687-52p2-xcff)
statik sayfada da güvenilmeyen build verisi varsa dikkate alınmalıdır; “SSG
olduğu için bütün XSS açıkları etkisizdir” sonucu çıkarılmadı.

Geliştirme riskini de küçümsemiyoruz:
[Vite Windows advisory’si](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff)
ağa açılmış dev server ve hassas dosya koşulları taşır. Mevcut önizleme
loopback üzerinde Wrangler/workerd ile statik dosyaları sunar.
[esbuild CORS advisory’si](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99)
ise ayrı `serve()` özelliğine özgüdür; loopback tek başına bütün dev saldırılarını
engellemez. İncelenen akış bu eski serve özelliğini kullanmıyor.

## Önceliklendirilmiş, henüz uygulanmayan plan

- **P0:** İncelenen public çalışma yolunda acil uzaktan istismar kanıtı yok.
  Güvenilmeyen görsel optimizasyonu veya internete açık eski dev/SSR sunucusu
  saptanırsa bu durum P0 olur; o yol kapatılır ve etki/kimlik bilgisi incelemesi
  yapılır. Bu audit uzak sistemlerin tamamına verilmiş güvenlik garantisi değildir.
- **P1, herhangi bir merge öncesinde:** Ayrı izinli bakım dalında Wrangler
  4.151.0 minor adayı ve Astro 7.3.8 major adayı değerlendirilir. Önce araç
  zinciri temizlenir; yeni lockfile üzerinde yeniden audit, 106 test, iki
  Worker dry-run, yerel web/Boss workerd smoke ve statik/SEO/görsel parity
  gerekir. Beklenmedik transitif bulgular için sonuç tekrar sınıflandırılır.
- **P1, geçici kısmi seçenek:** Astro major daha uzun sürerse tabloda belirtilen
  mevcut aralıklara uyan patch/minor çözümler ayrı onayla seçilebilir. Kritik
  bulgu bununla kapanmış sayılmaz; kör `overrides` veya `audit fix --force`
  önerilmez. Temiz sürümü olmayan glob/sprintf zincirleri ebeveyn değiştirilerek
  çözülmelidir.
- **P2:** Tekrarlanabilir bundle kapsam kontrolü ve bağımlılık izleme/lockfile
  incelemesi bakım sürecine alınır; SSR/image/input özellikleri eklenirse bu
  erişilebilirlik analizi yenilenir. Bunlar bu görevde uygulanmadı.

## Uyumluluk ve yükseltme testi

Astro 4 → 7 üç major sınırıdır; yalnızca sürüm numarası değişikliği değildir.
[v5](https://docs.astro.build/en/guides/upgrade-to/v5/),
[v6](https://docs.astro.build/en/guides/upgrade-to/v6/),
[v7](https://docs.astro.build/en/guides/upgrade-to/v7/) geçiş rehberleri sırayla
uygulanabilirlik açısından gözden geçirilmelidir. AmericaWhat’ta content
collections, React/islands veya SSR adapter olmaması kapsamı azaltır; Vite/
compiler, statik route/paginate, inline script, sitemap entegrasyonu ve minify
çıktısı yine regresyon riski taşır. Haber URL’leri ve canonical/OG/JSON-LD,
RSS, 12’şer yükleme, JS’siz akış, reaksiyonlar ve mevcut görünüm tekrar ölçülür.

[Astro 7.3.8 registry metadata’sı](https://registry.npmjs.org/astro/7.3.8)
Node ≥22.12.0 ister; kurulu 22.23.2 uygundur fakat mevcut `>=22 <23` engine
beyanı 22.0–22.11’i de kapsar ve gelecek bakımda daraltılmalıdır.
[Wrangler 4.151.0](https://registry.npmjs.org/wrangler/4.151.0) Node ≥22 ister.
Sitemap 3.1.6’nın yeni Astro ile uyumu build/SEO testinde doğrulanmalıdır.
Denetlenen sürüm adayları test edilmedi; hiçbir yükseltmenin sorunsuz olacağı
veya yeni audit’in sıfır çıkacağı taahhüt edilmiyor.

## Değişmeme kanıtı

Başlangıç ve bitiş SHA-256 değerleri aynı:

- `package.json`: `4054C26A2655DEAC56B2E01C14B117F5ACC2F51FDDAA7651D99C4CD99E29AC90`
- `package-lock.json`: `5C924CEF2CE25709DD6A93A0C6225533760577927F4DAD136C239FF4D01A5744`

Bu rapor özel Worker kodunun tam güvenlik denetimi, üçüncü taraf servis audit’i
veya uzak production envanteri değildir. İncelenen 21 sürüm bulgusu için yanlış
paket eşleşmesi saptanmadı; birçok bulgunun **bu mimaride tetikleme yolu yoktur**.
Bu iki durum birbirinden ayrılmıştır.
