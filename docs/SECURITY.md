# Güvenlik incelemesi — 23 Ekim 2026

Kapsam: bu deponun frontend/API kodu, uygulama bağımlılıkları, Docker çalışma ayarları, CI/CD yetkileri ve yalnız ozankaya.net/izolator yayın yapılandırması. Başka sitelerde tarama yapılmadı; dosya hash'leri, konteyner kimlikleri/başlangıçları ve servis durumları yayından önce/sonra karşılaştırılır.

## Giderilen bulgular

- JSON'da NaN/Infinity, taşan üstel sayılar, yinelenen alanlar ve aşırı iç içe yapı Pydantic doğrulamasından önce reddedilir. Önceki varsayılan hata serileştirmesi NaN girdisinde 500 üretebiliyordu. Hata yanıtları ham müşteri girdisini içermez.
- Content-Length olsun/olmasın istek en fazla 256 KiB; JSON en fazla 32 derinlik/20.000 düğüm. Mutasyonlar application/json ister. Basit cross-origin form gönderimleri reddedilir; CORS açılmamıştır.
- Başlat/iptal döngüsü yürütücü kuyruğunu sınırsız büyütemez: çalışan ve bekleyen toplam en fazla dört gerçek iş. İptal edilen iş yürütücü tarafından tüketilmeden yuvası serbest bırakılmaz. Çözücü 45 saniyelik kooperatif süre sınırı uygular; geç dönen sonuç önbelleğe girmez. Bu, işletim sistemi seviyesinde zorla işlem sonlandırma değildir.
- Host Nginx yalnız iş oluşturma adresine IP başına 10 istek/dakika ve 6 ani istek payı uygular; aşım HTTP 429. Yerel gövde boyutu da 256 KiB. Küçük, geçersiz dokuz istekle 422/429 yanıtları doğrulandı; yük testi yapılmadı.
- API yanıtları Cache-Control: no-store. Arayüzde CSP, frame-ancestors none, nosniff, no-referrer ve kamera/mikrofon/konum kapatma başlıkları var.
- CSV'de metin hücrelerinin formül olarak yorumlanabilecek başlangıçları tab önekiyle etkisizleştirilir; hücre sınırları/tırnaklar kaçırılır, gerçek negatif sayılar korunur. Farklı hesap tablosu uygulamalarının tüm içe aktarma davranışları için evrensel garanti yoktur.
- API zaten yetkisiz app kullanıcısıyla çalışıyordu; ayrıca salt okunur dosya sistemi, cap_drop ALL, no-new-privileges ve boyut sınırlı tmpfs eklendi. Web salt okunur dosya sistemi ve sınırlı geçici alanlarla çalışır. Üretimde CPU/RAM/PID/log sınırları korunur; dışarı açık API portu yoktur.
- Rapor notları HTML olarak işlenmez. İçe aktarım boyutu okunmadan denetlenir; geciken doğrulama yeni geçerli veya geçersiz ham kullanıcı girişini ezemez. Bozuk yerel kayıtlar görüntülemeye alınmaz, açılan proje API migrasyonuyla tekrar doğrulanır.

## Kontroller

- `pnpm audit --json`: 280 bağımlılıkta bilinen açık 0 (geliştirme bağımlılıkları dahil).
- uv kilidinden üretim bağımlılıkları dışa aktarılarak `pip-audit --no-deps --disable-pip`: bilinen açık 0. Bu yalnız sorgulanan paket/veritabanı ve inceleme tarihi için geçerlidir.
- 10 API güvenlik/metadata regresyonu; CSV/yerel kayıt ve limit sıralama birim testleri; raporda metin olarak XSS örneği, büyük içe aktarım ve asenkron yarış uçtan uca testleri.
- Üretim Docker yapısında Nginx/FastAPI sağlık, hesap, katalog görseli, CSP, alt yol ve PDF akışları denetlenir. Salt okunur çalışma ayarlarıyla konteynerler healthy.
- CI/CD anahtarı yalnız doğrulanmış main commit'ini dağıtabilir; root'a ait gateway/Compose değiştiremez, genel SSH kabuğu/ağ yönlendirmesi açamaz. Pinned SSH host anahtarı, en az token izinleri ve main'e sınırlı production ortamı korunur. Gateway'in başarısız build, eski push, CI hatası, kısmi yayın ve geri alma için 9 regresyon testi vardır.

## Sınırlar ve veri davranışı

Bu inceleme tam penetrasyon testi, işletim sistemi/Docker taban görüntülerinin bütün CVE taraması veya güvenlik sertifikası değildir. Uygulama bilerek hesapsızdır; herkese açık adrese erişebilenler sınırlı hesap işlerini başlatabilir. İş sonuçlarına rastgele UUID ile erişilir; kimlik doğrulamalı müşteri kasası olarak tasarlanmamıştır. Sunucu belleğinde son 12 iş ve son üç sonuç tutulur, süreç yeniden başlayınca temizlenir; zaman bazlı otomatik silme sözü yoktur. Proje ve rapor bilgileri de hesap snapshot'ının parçasıdır ve sunucuya gönderilir. Yerel taslaklar/karşılaştırmalar bu tarayıcının IndexedDB alanındadır. Gizli müşteri belgeleri için ayrı erişim denetimi ve veri saklama politikası tasarlanmalıdır.

Referanslar: [OWASP API kaynak tüketimi](https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/), [OWASP CSV Injection](https://community.owasp.org/attacks/CSV_Injection).
