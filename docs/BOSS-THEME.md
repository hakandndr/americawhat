# Boss — public renk uyumu

2026-10-14, `3730297` sonrası yalnızca yerel renk düzeltmesi. Kaynak referans
onaylı `src/styles/global.css`; public dosyalar değiştirilmedi. Boss’un ayrı
server-rendered Worker CSS’si korunur; Astro’ya import/bağımlılık eklenmez.

| Rol / Boss token | Önce | Public ile hizalanan değer |
|---|---|---|
| Sayfa `--bg`, input `--sunk` | #0b1426 / #0e192e | `--night` #0b1120 |
| İkincil yüzey `--bg-2`, hover `--panel-2` | #111d34 / #1f3153 | `--night-2` #0f1830 |
| Kart/tablo `--panel` | #192845 | `--card` #111c34 |
| Header `--header` | Opaque #111d34 | Public `.site-head` rgba(11,17,32,.82) |
| Ayraç `--line` / `--line-2` | rgba(168,184,208,.14/.26) | rgba(142,160,201,.16/.28) |
| Ana metin `--text` | #edf2f8 | `--ink` #eef2ff |
| İkincil/küçük etiket `--muted`, `--faint` | #a8b8d0 / #8b9dba | `--dim` #8ea0c9 |
| Marka `--accent`, buton `--accent-strong` | #df4d66 / #c93a55 | `--red` #e23b4e |
| Link/vurgu/hover | #f27d90 / #d4445f | `--red-hot` #ff5468 |
| Focus `--focus` | Bilgi mavisi | Public focus #ff5468 |
| Satır hover | rgba(168,184,208,.05) | Public hover rgba(142,160,201,.08) |

Yalnızca renk eşlemesinde gereken erişilebilirlik istisnaları:

- Public `--dim-2` #6d7ea6 kartta 4,18:1; küçük Boss etiketinde kullanılmaz.
  Aynı public paletteki `--dim` kartta 6,47:1 ve tüm küçük etiketlerde korunur.
- Beyaz yazı public kırmızıda 4,23:1; buton yazısı `--on-accent:#000` ile
  kırmızıda 4,97:1, coral hover’da 6,78:1 olur. Buton boyutu/yazı tipi aynı.
- Ayraçlar ince public tonlarında kalır; form/secondary button/choice sınırları
  `--control-line:var(--muted)` ile ≥3:1, focus coral ile ≥3:1 olur.
- Yeşil başarı, amber uyarı, mavi bilgi renkleri korunur. Hata/destructive
  metin coral, dolgu public error rgba(226,59,78,.10) olur; metin ve işlem
  etiketleri anlamı taşır. Her öğe kırmızıya dönüştürülmedi.

`tests/boss-theme.test.mjs` gerçek public/Boss token eşlemesini, normal/hover
butonları, küçük metinleri, semantic badge dolgularını ve focus/control
kontrastını hesaplar. Beyaz yazıyı veya soluk etiketi körlemesine kopyalamaz.
[Metin](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) ve
[metin dışı kontrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
eşikleri kullanılır; tüm WCAG uyumu/grafik test iddiası yoktur.

Sonuç: **117/117 test**, **18/18 sentetik local workerd kontrolü**; altı bölüm,
JWT/CSRF negatifleri, approval/rejection, atomik publish, import/retention geçti.
Public build 162 sayfa, statik hata 0, 162 body/CSS eşdeğer, 3.652 iç bağlantı;
tam/dev hariç audit 0. İki Worker dry-run başarılı, upload yok.

`3730297` ile CSS’nin renk değerleri çıkarılarak yapılan karşılaştırmada renk
dışı deklarasyonlar, typography/radius token’ları ve HTML (theme-color hariç)
aynı. Desktop/mobile media kuralları ve ≤760px sticky-submit düzeltmesi aynı.
Kaynak/backend/tablo/form işlevi değişmedi. Kanıtlar Git dışı
`reports/theme-parity-preflight.json`, `tests-theme.tap`, `boss-theme.log`.
Sahibi görünümü yerel `http://127.0.0.1:18828/` üzerinden inceleyebilir.
