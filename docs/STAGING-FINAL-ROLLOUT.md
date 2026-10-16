# AmericaWhat staging — footer, Global/Day # ve edge Trending

15 Ekim 2026. Yalnız iki staging Worker'ı güncellendi; production, DNS,
Hostinger, D1 verisi/şeması, Access ve başka proje değişmedi.

| Alan | Değer |
|---|---|
| RELEASE_ID | c08cdfc62eb4483ea1356c35ce7a2a5989c99407 |
| Web version | 1346af78-327b-434d-8cd1-294d0bf39dc3 (%100) |
| Boss version | 58dfdaf4-87b3-41f6-a7f0-0f68215bcd44 (%100) |
| Rollback hedefleri | Web 09efe0f7-3384-49ae-a627-7c15c34f2ba5, Boss 3c28937a-44fd-4f46-b39b-c59d71587d50 (38096fa) |
| Paket | reports/final-candidate, reports/final-release-manifest.json (SHA256 a4c269476379f928eb3386d51fca92afe35a9c75f33e8c036b4e177369f53f0c, 321 dosya) |

Prosedür [STAGING-DESIGN-ROLLOUT.md](STAGING-DESIGN-ROLLOUT.md) ile aynı:
build:rc → dry-run frozen bundle → verify-staging-candidate → versions upload
--no-bundle (secret adları miras) → Web, sonra Boss versions deploy UUID@100%.

## Footer

Footer yeniden doğal yüksekliğinde. body sütununda main kalan yüksekliği alır
ve tek .page-body'yi dikeyde ortalar; footer içeriği kısa sayfalarda viewport'un
altında, uzun sayfalarda doğal akışta. Canlı 1920/1440/390 ekran görüntüleri:
About, Disclaimer ve 404 kısa; Categories, Terms, Privacy ve ana sayfa uzun.

## Global # ve Day #

Staging analytics D1 salt-okunur kontrol: 13 kayıt, id 1–22 (silme boşlukları),
AUTOINCREMENT; 4 PT günü; id sırası ile zaman sırası şu an gün içinde aynı
(uyuşmazlık 0). Day # artık id değil zaman sırasıdır (occurred_at, sonra id),
gün toplamıyla gösterilir; legacy import ile eklenen eski kayıtlar da doğru
sırada sayılır. Kayıt ve id değişmedi, migration yok. Olay akışında ayrı
sütunlar, tooltip'ler ve kısa açıklama; ülke kodu, şehir/bölge, referrer URL,
tarayıcı/OS/cihaz, sınıf/kaynak/agent ve event türü görünür. 1240 px altında
etiketli 4 sütunlu, 900 px altında 2 sütunlu kartlar.

## Edge Trending

Worker ana sayfa HTML'ine Trending'i HTMLRewriter ile yerleştirir (tek sınırlı
APP_DB okuması, 300 ms zaman aşımı). Isolate 30 sn taze sonucu D1'a gitmeden
kullanır, eşzamanlı okumaları birleştirir; okuma hata verir/zaman aşarsa son
başarılı listeyi (24 saate kadar) sunar. Hiç başarılı sonuç yoksa
data-trending="unavailable" ile sayfa listeyi tarayıcıda eskisi gibi kurar.
ETag kaldırıldı, koşullu istek başlıkları asset katmanına iletilmez; HEAD D1'a
gitmez.

## Ölçümler (gerçek Chrome, soğuk profil)

- Ana sayfa CLS: önce 1440 px 0.078 / 390 px 0.184; sonra 10/10 koşuda 0.
  About her iki durumda 0.
- TTFB (tarayıcı): ana sayfa 100–353 ms, çoğunluk 100–180 ms.
- curl, 20 istek: / p50 104 ms, p90 143 ms; /about/ p50 107 ms, p90 114 ms.
- 164/164 test, 19/19 workerd Boss smoke, 21/21 canlı HTTP smoke; Boss 5 yolda
  anonim 302→Access.

Doğrulanamayan: owner oturumlu canlı Boss görünümü (oturum yok, giriş
denenmedi; aynı frozen kod yerel workerd ve tarayıcıyla test edildi).
Kanıtlar reports/final-visual/ (Git dışı).
