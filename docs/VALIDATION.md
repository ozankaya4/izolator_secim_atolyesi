# Sayısal doğrulama ve performans

23 Ekim 2026. Referans HTML ve 12 JavaScript, SHA-256 manifestiyle sabitlendi. Karşılaştırmada eski uygulamanın son çalışan yükleme sırası kullanıldı; ilk fonksiyon tanımlarıyla sınırlı kalınmadı. `worker-source.js` yalnız test VM'inde çalışır; üretim uygulamasında bulunmaz.

## Karşılaştırma kapsamı

Üç aynı proje girdisi için matris/modal, statik, harmonik frekans taraması, PSD ve şok hesaplandı. Kompanzasyon seçiliyken saf darbe de bağımsız çözüldü. Üç tekrarın medyanı; Node/CPython başlatma, HTTP ve gerçek DOM/Canvas çizimi hariç. Eski harmonik çizicinin sayısal taraması ve SVG metni hazırlaması dahildir; Python çıktı nesneleri dahildir. Bu, kullanıcı cihazından bağımsız bir hız garantisi veya tarayıcı Web Worker uçtan uca ölçümü değildir.

Ortam: macOS / Apple Silicon, Node 24.22.1, Python 3.13.16, NumPy 2.5.4, SciPy 1.18.1. Bazı ölçümler arka planda Docker derlemesiyle çakışmıştır; küçük süre farkları anlamlı hızlanma olarak yorumlanmaz.

| Senaryo | Eski JS medyan ms | Python medyan ms | En büyük PSD/şok bağıl farkı |
|---|---:|---:|---:|
| rigid | 274.7 | 270.0 | 3.12e-06 |
| flexible-compensated | 529.8 | 2092.0 | 1.38e-06 |
| socitec-directional | 3155.1 | 2985.3 | 1.89e-06 |

Rijit ve yönlü SOCITEC örneklerinde benzer süreler; esnek örnekte Python daha yavaştır. Python'un otomatik hızlı olduğu varsayılmamıştır. Esnek çözümde sık tepe değerlendirmesi, toleranslı adaptif integrasyon ve bağımsız referans çözümü korunur. Öncelik doğruluk ve bakım kolaylığıdır; performansın iyileştiği genel bir iddia yoktur.

Modal/harmonik regresyon toleransı 1e-8 veya daha sıkı, PSD/şok 1e-4 bağıl; sıfıra yakın kanallarda ayrıca mutlak tolerans kullanılır. Kayıtlı farklar bu eşiklerin içindedir. Referansla uyuşma tek başına fizik doğrulaması değildir; aşağıdaki bağımsız testler de bulunur.

## Bağımsız kontroller

- Simetrik sistemin analitik SDOF frekansı, kompleks harmonik cevabı ve fazı.
- α ile statik deplasman ve yalnız seçili yönde toplam reaksiyon dengesi.
- Rz Ry Rx dönüşümü, ortogonallik, yerel yön projeksiyonu.
- 7-DOF kütle matrisinde eklenen ikinci toplam kütle olmaması, genelleştirilmiş özvektör normalizasyonu, sönüm matrisinde korunmuş çapraz terimler.
- Uygunsuz kalan gövde kütlesi ve tekil yerleşimin hata vermesi.
- Log-log PSD ve bant dışında sıfır; düşük sönümde çözünürlük yakınsaması.
- Üç darbe × dört pozitif kompanzasyon: son hız ve konum integrallerinin sıfıra yakınlığı.
- 45° katılığın izdüşüm matrisi olması; ara açıda doğrusal dönüş; basma/çekme dalının toplam ön yükle seçimi.
- DOP853 tolerans sıkılaştırmasında şok tepe yakınsaması; tüm kuyruğun grafikte bulunması, yoğun tepe hesabının grafik örneklerinden bağımsız olması.
- İptal, değişmez snapshot, bilinmeyen/başarısız kontrolün yeşile dönmemesi.
- v1/v2/v3/v4 migrasyonları, eski kompanzasyon bildirimi, geçerli katalog/önceden verilmiş SOCITEC kabulünün korunması, hatalı dosyada atomiklik.
- API doğrulaması, katalog kabulü, kullanıcı katılığına geçiş, sonuç önbelleği ve farklı girdilerin farklı hash üretmesi.

## Tarayıcı doğrulaması

Vitest: Türkçe sayı/PSD ayrıştırma, hatalı girişin hesaplamaya geçmemesi ve ondalık yazım sırasında kullanıcının virgülünün korunması.

Playwright: hesap → girdi değişikliği → eski snapshot raporu; IndexedDB taslak kurtarma; katalog kabulü; 3B/tabloda ortak seçim; kaynak değişimi; preset geri alma; PSD ayraç/satır hatası; hatalı JSON atomikliği; güncel taslak dışa aktarımı; geciken yanıt yarışı; şok zoom/tepe bağımsızlığı; ECharts; A4 PDF; mobil yatay taşma ve klavye odağı.

`docs/benchmark.json` ham ölçüm değerleridir. `backend/tests/legacy-fixtures.json` aynı girdiler ve eski son davranışın çıktılarıdır. Fixture'lar dinamik olarak internete başvurmaz.

## Kapsam sınırları

Katalog verileri referanstan kayıpsız aktarılmıştır; üretici çalışma koşulları yeniden sertifikalandırılmamıştır. SOCITEC k_eq ve F/d tahminleri açıkça etiketlenir. SRS/f_low ve tam MIL tolerans zarfı çözülmez. İş sınırı içinde hesaplanamayan model için sıfır/olumlu sonuç üretilmez. Hedef cihazda daha geniş FEM/test kalibrasyonu bu uygulamanın dışındadır.

## Son doğrulama kaydı

- 37 pytest geçti (fizik, yakınsama, 3 sabit legacy regresyonu, migrasyon ve API).
- 5 Vitest geçti (yerel sayı/PSD ve form davranışı).
- 7 Playwright akışı Docker/Nginx/FastAPI üzerinden geçti; aynı akışlar Vite üzerinde de geçti.
- Strict TypeScript ve üretim derlemesi geçti; OpenAPI–TypeScript sözleşme eşleşmesi doğrulandı.
- `docker compose up --build -d --wait` başarılı; `web` ve `api` healthy. Nginx üzerinden sağlık yanıtı ve 175 katalog kaydı doğrulandı.
- A4 PDF, Poppler ile sayfalara render edilip gözle incelendi; Türkçe karakterler, tam grafik eksenleri ve sayfa numaraları doğrulandı. Örnek çıktı `output/pdf/ornek-rapor.pdf` içindedir.

Pytest çıktısında Starlette'in eski `httpx` test istemcisi için bir deprecation uyarısı bulunur; testler ve üretim API'si başarılıdır. Bu uyarı hesaplama çekirdeğiyle ilgili değildir.

Snapshot kimliği normalize girdinin yanında çözücü sürümünü ve katalog SHA-256'sını içerir. Kullanılan katalog ürünlerinin kopyaları sonuç içinde saklanır; rapor kaynakları güncel katalogla sonradan birleştirilmez.
