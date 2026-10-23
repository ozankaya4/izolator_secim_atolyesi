# Özellik envanteri ve uygulama planı

23 Ekim 2026 referansı `legacy-reference/` altında SHA-256 manifestiyle sabitlenmiştir. HTML'nin sıraladığı 12 JS dosyası indirildi; referans sitede değişiklik yapılmadı.

## Gerçekte çalışan davranış

`structure.js → coupled.js → nonlinear.js → milshock.js` sırası önemlidir. `coupled.js` önceki tek yönlü esnek aktarımı karşılıklı bağlı kütle matrisiyle değiştirir. `nonlinear.js` statik ön yük etrafında SOCITEC F/d sekant modelini ve iki koşullu kompanzasyonu ekler. `milshock.js` aynı modelle bağımsız saf darbe çözümü ve sınırlı hız ön kontrolünü ekler. Son `performance.js` yürütme/önbellek/iptal katmanıdır; fizik modeli değildir.

Korunacak envanter: 175 katalog varyantı; rijit 6/esnek 7 DOF; statik reaksiyon; fazlı harmonik; ortak taban PSD; üç darbe ve ortak kompanzasyon; yönlü SOCITEC; 2–20 destek; beş yerleşim; Rz Ry Rx; tablo/sahne seçimi; v1–v4 okuma; snapshot raporu; CSV; gerçek aşama/iptal/güncellik.

## Veri modeli

- `Project`: sürüm, ad, kütle/CG/asal atalet, yük yönleri, izolatörler, esnek model, analiz girdileri, limitler, sayısal toleranslar. Sınırdaki birimler alan adlarında açık; çekirdek SI float64.
- `Catalog`: kaynakta olan bütün değerler, ayrı LORD/SOCITEC alanları, birimler, kaynak/sayfa/tarih/tutarsızlık. Eksik bilgi `null` veya kaynakta yoktur.
- `AnalysisResult`: normalize girdi snapshot'ı ve SHA-256, çözücü sürümü/tolerans, modal/statik/harmonik/PSD/şok çıktıları, beş durumlu kontroller ve ölçüm/limit/nokta/eksen.
- `Job`: aşama, iptal olayı, değişmez snapshot, tamamlandığında sonuç. Tarayıcı istek kimliğiyle yarışan yanıtı reddeder.

## Sıra

1. Pydantic şemaları, katalog ve açık v1–v4 migrasyonu.
2. NumPy/SciPy bağımsız çekirdeği; analitik, yakınsama, hata ve referans regresyon testleri.
3. FastAPI iş API'si ve OpenAPI'den TypeScript üretimi.
4. Dört adımlı React arayüzü, IndexedDB, talep üzerine Three.js, ECharts ve A4 raporu.
5. Vitest/Playwright, Docker/Nginx, ölçülmüş karşılaştırma ve kullanım belgeleri.

Eski fonksiyon yamalama veya JS fizik kopyası taşınmaz. MIL katsayıları genişletilmez; eski ±%20 hız ön kontrolü korunur, SRS/tam zarf hesaplanmaz.
