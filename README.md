# İzolatör Seçim Atölyesi

Türkçe, yerelde çalışan izolatör yerleşimi ve titreşim/şok ön kontrol uygulaması. Sayısal hesapların tamamı Python/NumPy/SciPy çekirdeğindedir. React arayüzünde ikinci bir fizik motoru yoktur.

## Docker ile çalıştırma

Docker Desktop/Engine açıkken proje klasöründe:

```sh
docker compose up --build -d
```

Uygulama: **http://localhost:8080**. Nginx frontend'i sunar, `/api` isteklerini FastAPI'ye iletir. API dışarıya ayrı port açmaz. İlk derleme internet ister; sonraki hesaplar, 175 ürünlü katalog ve 14 aile görseli yerel dosyalardan çalışır.

```sh
docker compose ps
docker compose logs -f api
docker compose down
```

Projeler ve son taslak tarayıcının IndexedDB alanında saklanır; konteyneri kapatmak bu verileri silmez. Farklı tarayıcı/port ayrı kayıt alanıdır. Taşımak veya yedeklemek için JSON dışa aktarımını kullanın. Hesap işleri ve aynı girdiye ait son üç sonuç API belleğindedir; API yeniden başlayınca bu geçici sonuçlar temizlenir.

## Geliştirme

Python 3.13, Node 24 ve pnpm 11.25.0 gerekir. Tam bağımlılıklar ve transitif bağımlılıklar kilitlidir.

```sh
make install
```

İki terminalde:

```sh
make api
```

```sh
make web
```

Arayüz http://127.0.0.1:5173, API http://127.0.0.1:8000, OpenAPI http://127.0.0.1:8000/openapi.json.

## Kullanım

1. **Sistem:** kütle/CG/asal atalet ve sürekli yükü girin. Rijit varsayılandır; esnek seçilince karşılıklı bağlı 7-DOF parametreleri açılır. ζ ve α kullanıcı kabulleridir.
2. **İzolatör ve yerleşim:** aile/seri/ürün arayın. SOCITEC eşdeğer katılık tahminini açıkça kabul ederek uygulayın. 3B görünüş veya düğme/tablo ile izolatör seçin. Beş yerleşim, ortak roll ve CG Z doğrusuna yerel 2 hizalaması geri alınabilir.
3. **Yükler ve isterler:** ortak tahrik vektörü, harmonik, PSD ve şok girdilerini düzenleyin. PSD metninde ayırıcıyı seçin. Ondalık virgül veya nokta desteklenir; belirsiz satır sessizce yorumlanmaz.
4. **Hesapla:** gerçek aşamalar gösterilir; İptal yalnız çalışma sırasında etkindir. Girdi değişirse devam eden istek iptal edilir, eski sonuç “Güncel değil” olur. Eski istek yeni modele sonuç yazamaz.
5. **Sonuçlar:** katalog/statik, harmonik, PSD ve şok ayrı durum taşır. İhlallerde değer, limit, birim ve nokta/eksen bulunur. Bilinmeyen kontrol genel olumlu karara çevrilmez.
6. **Rapor:** yalnız seçili hesap snapshot'ını kullanır. Katalog revizyonu, hash'i ve kullanılan ürün kayıtları da hesap sonucuna sabitlenir. Taslak değişmişse eski snapshot uyarısı görünür. Yazdır/PDF ile A4 çıktı alın; tarayıcının yazdırma penceresindeki üst/alt URL başlıklarını kapatabilirsiniz. CSV düğmeleri ilgili tablolara/grafiklere aittir. JSON düğmesi her zaman güncel taslağı dışa aktarır.

Şok grafikleri ortak zaman ekseninde yakınlaştırılır. **Tam kayıt / sıfırla** tüm sönüm kuyruğunu açar. Grafiğin görünüşü tepe kartlarını değiştirmez. Tüm süreyi kapsayan grafik kayıtları ile çözümün yoğun tepe araması farklı çözünürlüktedir; tepe araması azaltılmış grafik örneklerinden yapılmaz.

## Test ve sözleşme üretimi

```sh
uv run --directory backend pytest -q
pnpm --dir frontend test
pnpm --dir frontend exec playwright install chromium
pnpm --dir frontend test:e2e
pnpm --dir frontend build
make check-contract
```

Çalışan Docker sürümünü aynı testlerle denetlemek için `BASE_URL=http://127.0.0.1:8080 pnpm --dir frontend test:e2e` kullanın.

Playwright yerel API ve Vite'ı gerektiğinde başlatır. Çalışan geliştirme servislerini yeniden kullanır. E2E testleri ayrı, geçici tarayıcı bağlamlarında çalışır. Test raporları `frontend/playwright-report/`, ekran görüntüleri ve örnek PDF `frontend/test-results/` altındadır.

API şeması değişince:

```sh
make types
```

`backend/openapi.json` ve `frontend/src/generated/api.ts` birlikte güncellenir. CI sözleşme eşleşmesini, strict derlemeyi, pytest/Vitest/Playwright ve Docker derlemesini denetler.

Eski son davranışla sayısal karşılaştırma ve süre ölçümü:

```sh
uv run --directory backend python ../scripts/benchmark.py
```

Bu komut referans dosyalarını değiştirmez; yalnız test fixture'larını ve ölçüm JSON'unu yeniler. Karşılaştırma eski uygulamaya canlı bağımlı değildir; sabitlenmiş kaynakları Node VM içinde çalıştırır. Python'un otomatik olarak daha hızlı olduğu varsayılmaz. Ölçülen sonuçlar ve kapsam [doğrulama notlarında](docs/VALIDATION.md) yer alır.

## Mimari ve fizik

```text
backend/isolator/
  domain/     SI sabitleri, geometri ve dönüşüm sözleşmesi
  catalog/    Sürümlü JSON, kaynak metaverisi ve ürün uygulama
  schemas/    Pydantic doğrulama, sonuç sözleşmesi, v1–v4 migrasyon
  solvers/    Bağımsız matris, harmonik, PSD, şok ve karar çekirdeği
  api/        FastAPI, sınırlı bellek kuyruğu, aşama, iptal, snapshot önbelleği
frontend/src/
  components/ Dört adım, talep üzerine 3B/ECharts, A4 rapor ve shadcn örüntüleri
  generated/  OpenAPI'den üretilen TypeScript tipleri
  lib/        API, IndexedDB, sayı/PSD girdisi ve yalnız yerleşim geometrisi
legacy-reference/  Salt referans amaçlı sabitlenmiş eski HTML + 12 JS ve manifest
```

İç hesaplar float64 ve SI; `g=9.80665 m/s²`. Birimler API alan adlarında açıktır. `R=Rz Ry Rx`, `B=[I,-[r]×]`. Statikte `K_static=K_dyn/α`; sürekli kuvvet yalnız seçilen yöndedir. Modal çözüm `scipy.linalg.eigh(K,M)` kullanır. Simetri, sonluluk, pozitiflik, tekillik ve kötü koşullanma kontrol edilir.

Esnek kütle zaten toplam kütle/ataletin içindedir. Kütle matrisindeki karşılıklı çapraz terimler ve tam sönüm matrisi korunur; kalan gövde pozitif değilse hesap reddedilir. Bağlantı referansı, CG ve sensör ayrı kavramlardır. Esnek statik yapı esnemesi raporlanmaz.

SOCITEC yönlü F/d sekant modeli yalnız 0°/45°/90° ±0.5° eşleşmede kullanılır; 45° doğrudan k3 olmaz. Toplam yerel izdüşüm statik ön yükü içerir. Ara açı/eksik veri/kullanıcı katılığında doğrusal dönüş ve gerekçesi görünür. Bu tam histerezis veya malzeme modeli değildir.

Şok DOP853 ile darbe sınırlarında bölünür; tepe araması tüm kabul edilen aralıklarda yoğun çıktı ve yerel ekstremum iyileştirmesi kullanır. Kuyruk en az 10 düşük-mod periyodu ve 12 muhafazakâr sönüm zaman sabitidir. Sayısal iş sınırı aşılırsa sonuç uydurulmaz; “Hesaplanamadı” gösterilir.

**MIL kapsamı:** Referanstaki ±%20 hız penceresi ön kontrolü korunmuştur. SRS, f_low ve tam dalga şekli tolerans zarfı hesaplanmaz. Sonuç standart uygunluk belgesi değildir. Referans katsayıları genişletilmemiştir. Üçgen darbe mühendislik seçeneğidir.

Girdi JSON'unda `isolation-project-v5` kullanılır. `isolation-layout-v1/v2/v3/v4` açık migrasyonlarla okunur. Farklı ön/son kompanzasyon ortak büyük yüzdeye dönüşür ve bildirilir. `structGain/gain` aktif parametre değildir. Tüm veri doğrulandıktan sonra taslak tek işlemde değiştirilir.

Başlangıç envanteri: [IMPLEMENTATION.md](docs/IMPLEMENTATION.md). Bağımlılık kararları ve resmî kaynaklar: [DEPENDENCIES.md](docs/DEPENDENCIES.md).

Örnek A4 çıktı: [test senaryosu raporu](output/pdf/ornek-rapor.pdf) (40 kg, 20 g / 11 ms yarım sinüs, %10 kompanzasyon).
