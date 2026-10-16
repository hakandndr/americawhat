# AmericaWhat — Boss seçici entegrasyon hazırlığı

2026-10-14 güncellemesi: aşağıdaki dokuz dosya whitelist’i `codex/security-boss`
üzerinde **yerel olarak uygulandı**, `8da9839` dar ekran düzeltmesi dahil.
Ek Published router testleri ve preview state dizini koruması eklendi.
115/115 test ve 18/18 sentetik workerd kontrolü başarılı. Auth/JWT/CSRF,
Git yayınlama, retention/import çekirdeği, şemalar ve public `src/` değişmedi.
Ayrıntı: [INTEGRATION-SPRINT.md](INTEGRATION-SPRINT.md).
Gerçek Access/D1/uzak Boss yapılandırması veya dağıtımı yapılmadı.

Aşağıdaki analiz ve gelecek uygulama sırası ilk hazırlığın tarihsel kaydıdır;
uzak merge/deploy/Access/D1 işlemlerine izin değildir.

## Doğrulanmış dal ilişkisi

- Cloudflare tabanı: `dev/cloudflare-native` / `4438907`.
- Kamusal UI başlangıcı: `design/staging-refinement` / `e7d2116`.
- Boss ve reddedilmiş kamusal deneyler: `design/editorial-casefiles` /
  `40274dc979c4d57966bf7754e782282c256d9ebf`.
- Ortak ata `4438907c26ac00180571a76a4bea7edac6f02c72`.
  Bu oturumun başlangıcında ayrışma refinement tarafında 1, deney tarafında 5
  commit’ti. Refinement’ın `workers/` ağacı tabanla **aynı**; mevcut UI polish de
  Worker kodunu değiştirmiyor. Boss dosyalarında şu an içerik çakışması yok.

Boss’u getiren asıl commit:
`72689b479317baf586c626aeb38163837eeecb65` — navy/kırmızı kimlik, sakin review,
tablo merkezli Analytics, Published filtre/sayfalama, Reactions/Audit/Health
düzeni ve yapılandırılabilir yerel preview portları.

`8da9839499be87d5557dda0b7b3ca3ba6c1ce124` ağırlıkla deneysel dokümantasyondur,
ancak **Boss `html.mjs` içinde ≤760 px’te `.sticky-submit` öğesini statik yapan
bir CSS düzeltmesi de içerir**. Bu küçük düzeltme kaçırılmamalıdır.
`3ec77e0`, `185d162`, `40274dc` kamusal tasarım commit’leri alınmamalıdır.
Boss’un `72689b4` sonrasındaki tek kaynak farkı bu `8da9839` CSS düzeltmesidir.

## Dosya sınırı ve bağımlılıklar

| Kaynak dosya | Tür ve gerekli kapsam |
|---|---|
| `workers/boss/src/html.mjs` | Sunum/HTML escape/CSS/helpers; son `40274dc` halinden alınırsa dar ekran düzeltmesi dahil. Header/CSP yardımcılarını korumak gerekir. |
| `workers/boss/src/pages/analytics.mjs` | Sunum; metrik → filtre/export → olay tablosu → kırılımlar → veri işlemleri. Yeni `bars` helper’ı ve `days` verisine bağımlıdır. |
| `workers/boss/src/pages/misc.mjs` | Sunum; Reactions/Audit/Health tablo ve durum etiketleri. Mevcut import/retention formlarının endpoint/adları/onay alanları korunur. |
| `workers/boss/src/pages/review.mjs` | Karma modül: değişen kısımlar render/sinyal/form yerleşimi; `parseReviewForm`, `reviewCompute`, `reviewSummary`, `describeResults` işlevleri değişmiyor. Skip varsayılanı ve tek-commit onayı korunur. |
| `workers/boss/src/pages/published.mjs` | Karma modül: form görünümü + salt okunur kategori filtresi/40’lık pagination. Alan parsing helper’ları aynı; URL pinleme/yazma işlemleri ayrı backend’dedir. |
| `workers/boss/src/index.mjs` | **Salt CSS değildir:** `envBar`, `daily` importları, Published `cat`/`p` query aktarımı, Analytics `days` sorgu/prop bağlantısı. Bu küçük route wiring hunks’ları olmadan UI eksik kalır. |
| `workers/boss/src/analytics-db.mjs` | **Salt sunum değildir:** filtreye bağlı, LA günüyle `daily()` SELECT eklenir. Şema/yazma/silme değişikliği yok; 60 dönen gün sınırı tüm tarama maliyetini sınırlamaz. |
| `tests/boss-analytics-layout.test.mjs` | Dört mevcut deneysel test; günlük toplam/filtreler, sayfa sırası, export ve escape/silme-preview davranışı. |
| `scripts/dev/boss-preview.mjs` | Test desteği: `BOSS_PREVIEW_PORT`, proxy portu +1 workerd ve +2 fake GitHub. Çalışan başka Boss önizlemesine müdahale etmeden test edebilmek için alınması önerilir. |

Bu dokuz dosya yeterli whitelist’tir. Commit’teki `.gitignore` ekran görüntüsü
istisnası zorunlu değildir. Deneysel `src/styles`, `Base.astro`, `StoryCard`,
`FeedPost`, `editorial.js`, public route’lar veya tasarım belgeleri alınmaz.
Boss kaynakları kamusal Astro bileşenlerini/CSS’yi import etmez; mevcut ortak
`workers/shared` modülleri zaten refinement dalında bulunur. Yeni npm paketi
veya D1 migration gerekmiyor.

`auth.mjs`, `csrf.mjs`, `github.mjs`, `editorial.mjs`, `workers/shared`,
`migrations` ve `workers/boss/wrangler.jsonc` deneysel dal ile taban arasında
değişmemiştir. Mevcut refinement bu Cloudflare backend’ini zaten içerir.
Onaylı kamusal görünümle Boss’un eski sarı/gri yerel teması bu aşamada ayrı
kalır; navy/kırmızı Boss henüz bu dala entegre edilmiş sayılmaz.

## Önerilen gelecek uygulama sırası

1. Önce ayrı onaylı bağımlılık güvenlik bakımını bitir; test edilmiş güncel
   refinement HEAD’inden yeni bir **yerel entegrasyon dalı** oluştur.
2. `4438907..40274dc` farkını bu dokuz dosya için yeniden kontrol et. O zamana
   kadar backend değişmişse dosyaları körlemesine kopyalama; sadece incelenen
   hunks’ları uygula. Bugünkü kaynak durumunda whitelist’in `40274dc` sürümleri
   tüm Boss iyileştirmelerini ve mobil düzeltmeyi taşır.
3. Tek ayrı yerel Boss UI commit’i hazırla. Alternatif olarak `72689b4` yalnız
   Boss ağırlıklıdır fakat `.gitignore` dahil ek kapsam içerir ve `8da9839`
   mobil hunk’ını ayrıca gerektirir. **Deneysel dalı toplu merge etmek veya
   `8da9839` belgesel commit’ini bütünüyle almak önerilmez.**
4. Diff whitelist’ini doğrula: public `src/`, içerik/slug, Access/JWT/CSRF,
   GitHub yazma kuralları ve D1 şemalarında fark olmamalı. Onay alınana kadar
   push/merge/deploy yok.

## Gelecek test kapısı

- Mevcut `npm test` ve dört Analytics layout testi birlikte; yanlış issuer,
  audience, e-posta, süre/imza ve staging’de dev seam reddi korunmalı.
- Published `q` + `cat` + `p` kombinasyonları, geçersiz kategori/sayfa, boş
  sonuç, pagination bağlantılarında filtre taşıma, tüm kayıtların erişilebilirliği
  ve sabit slug’lar için anlamlı yeni route testleri eklenmeli. Deneysel dört
  Analytics testi bu Published davranışını tek başına kapsamaz.
- Weekly review’da Skip varsayılanı, Approve/Reject onayı, CSRF, atomik tek
  Git commit’i, eşzamanlı fetch’in korunması, URL pinleme ve XSS escape testleri.
- Sadece sentetik yerel D1 + fake GitHub ile Boss workerd smoke:
  `$env:BOSS_PREVIEW_PORT='8808'; npm run test:boss-preview` (entegrasyondan
  **sonra**, çünkü bugünkü preview script’i bu değişkeni henüz desteklemiyor).
  Portlar 8808/8809/8810 boş seçilmeli; başka çalışan süreç durdurulmamalı.
- Analytics stream/ALL #/TODAY #/IP VISITS; günlük sorguda aynı filtreler,
  CSV/NDJSON escape; retention preview, typed date, stale-preview ve idempotent
  legacy/reaction import testleri. Gerçek veri kullanılmamalı.
- `daily()` sorgusunun büyüyen geçmişte CPU/D1 maliyeti ölçülmeli; mevcut
  Workers planı kararı hâlâ önemlidir.
- İki Worker dry-run, Astro build, static/SEO/Load More parity ve public
  görünümün korunması. Grafik kontrol ancak ayrı izinle veya proje sahibi
  tarafından yapılır; Boss mobil tabloları/submit bar ayrıca incelenir.

Bu oturumda 106 mevcut test geçti; deneysel dört test **alınmadı/çalıştırılmadı**,
Boss preview çalıştırılmadı ve gelecekteki entegre durum test edilmiş sayılmaz.

## Access ve sunucu tarafı kimlik bilgileri

Hedef yalnızca `boss.americawhat.com` olmalıdır. Cloudflare Access uygulaması ve
policy yalnızca `hakan@dndr.net` kimliğine izin vermeli; Worker’da da aynı
allowlist, gerçek issuer/team domain ve uygulama AUD değeri bulunmalıdır.
`Cf-Access-Authenticated-User-Email` tek başına yetki sağlamaz; mevcut Worker
RS256 JWT imzasını JWKS ile, issuer/audience/exp/nbf/iat ve e-postayı doğrular.
Eksik yapılandırma fail-closed’dur. Tüm Boss route’ları bu kontrolden geçer.

`GITHUB_TOKEN` yalnızca Boss Worker secret’ı olarak, `hakandndr/americawhat`
Contents yetkisi ve süre sınırıyla tutulur. Public Worker’a, `dist/` veya istemci
JS’sine taşınmaz. `BOSS_CSRF_SECRET`, doğru `BOSS_ORIGIN` ve existing POST
Origin/CSRF kontrolleri gereklidir. Yerel fake GitHub/JWKS seam’leri yalnızca
`ENVIRONMENT=local` ve loopback’te geçerlidir; staging/production’da kapalı kalır.

Yerel config’te staging `workers_dev:false`, `preview_urls:false`, AUD boş;
production D1 kimlikleri `PRODUCTION_NOT_PROVISIONED`. Gerçek Access uygulaması,
host/DNS/secret/plan sağlanmadan production hazırlığı tamamlanmış sayılmaz.
Bu oturum uzak Boss Worker/Access/D1 durumunu yeniden envanterlemedi ve hiçbir
ayarını değiştirmedi. Public web’e ayrıcalıklı Boss endpoint’i eklenmez.

## Geri dönüş ve migration sınırı

Yeni entegrasyonun ayrı commit olması yerel geri dönüşü `git revert` ile
incelemeye açık tutar; geçmişe reset/force-push gerekmez. D1 şeması veya gerçek
veri taşınmadığından bu UI entegrasyonu veri rollback’i gerektirmez. Gelecekte
izinli bir staging dağıtımı yapılırsa önceki Worker version ID’si kaydedilip
yalnızca ayrı onayla geri alınabilir; bu oturumda dağıtım/rollback yapılmadı.

Üretim taşıması bağımsızdır: Hostinger envanter/yedek ve son log/oy snapshot’ları,
reconciliation, Access, production D1/secret/plan hazırlığı, DNS ve **Hostinger
mail’i koruma** kontrolleri, gizlilik metninin manuel retention ile tutarlılığı,
DNDR tarafında tarihsel tekrar sayımı olmadan kimliklendirme ve ayrı cutover
onayı gerekir. Tam legacy geçmişin/oyların korunması ve manuel silme kararı
yeniden tartışmaya açılmıyor; final snapshot henüz teslim edilmiş sayılmıyor.
