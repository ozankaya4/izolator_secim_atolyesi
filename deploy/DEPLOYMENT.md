# Oracle yayın kaydı

23 Ekim 2026 tarihinde `https://ozankaya.net/izolator/` adresine kuruldu.

## İlk manuel sürüm

- Kaynak: `5fb65f4e461e32fce2fe6925c62a3135d86270e7`.
- Sürüm etiketi: `20261023-5fb65f4`.
- Kaynak dizini: `/opt/izolator-secim-atolyesi/releases/20261023-5fb65f4`.
- Etkin bağlantı: `/opt/izolator-secim-atolyesi/current`.
- Compose projesi: `izolator-prod`.
- Web: yalnız `127.0.0.1:18180`; API yalnız Compose ağı içinde.
- Namecheap: `@ A 89.168.93.55`, TTL Automatic. Eski kök URL yönlendirmesi bu A kaydına dönüştürüldü. Diğer DNS ve e-posta kayıtları korundu.

Bu ilk kurulumun tarihsel kaydıdır. Güncel yayın commit'i `https://ozankaya.net/izolator/release.json` adresinden okunur. Otomatik yayın ve geri alma [CICD.md](CICD.md) dosyasında açıklanır. Yenileme hook'u ayrıca sunucuya kuruldu.

## HTTPS

Let's Encrypt sertifikası `ozankaya.net` için mevcut ACME hesabıyla alındı. İlk sertifikanın bitişi **21 Ocak 2027 20:40 UTC**. `certbot.timer` etkin. `/etc/letsencrypt/renewal-hooks/deploy/50-izolator-nginx`, yalnız bu sertifika yenilendiğinde `nginx -t` ve kesintisiz reload çalıştırır. Hook doğrudan çalıştırılarak doğrulandı.

`certbot renew --cert-name ozankaya.net --dry-run --no-directory-hooks --non-interactive` başarılı oldu. Deneme yalnız bu sertifikayı hedefledi; diğer alan adlarının yenileme hook'ları çalıştırılmadı.

## Doğrulama

- İki üretim konteyneri de healthy; API/web bellek ve CPU sınırları etkin.
- HTTPS sertifikası normal CA doğrulamasıyla kabul ediliyor.
- `/izolator/`, `/izolator/api/health` ve katalog fotoğrafı: 200.
- `/izolator`: 308 ile `/izolator/` adresine yönleniyor.
- HTTP: 301 ile HTTPS'e yönleniyor.
- HTTPS `/` ve `/api/health`: 404; uygulama yalnız alt dizinde sunuluyor.
- Canlı HTTPS sürümünde 8 Playwright testi geçti: hesap/snapshot, IndexedDB kurtarma, katalog ve 3B seçim, PSD doğrulaması, JSON aktarımı, gecikmiş istek, şok/A4 raporu ve mobil görünüm.
- Canlı test sırasında bilgisayarın DNS önbelleğinde eski park adresi bulunduğundan yalnız test süreçlerinde `ozankaya.net → 89.168.93.55` eşlemesi kullanıldı. TLS kontrolü kapatılmadı. Namecheap, Cloudflare ve Google DNS yeni adresi doğruladı.
- Önceki yerel kontroller: 37 Python testi, 5 Vitest testi, üretim derlemesi ve OpenAPI sözleşme kontrolü başarılı. İki proxy katmanıyla yerel `/izolator/` kurulumu ve GitHub Actions da başarılı.
- Diğer iki sitenin HTTP durumları yayın öncesiyle aynı. Ana/eski Nginx dosyalarının SHA-256 değerleri, mevcut Docker konteynerlerinin kimlikleri ve başlangıç zamanları, uygulama/PostgreSQL servislerinin başlangıç zamanları değişmedi.

Yayın öncesi/sonrası karşılaştırmalar ve Nginx yedeği yalnız sunucuda `/opt/izolator-secim-atolyesi/backups/` altında tutulur.

## İşletim

Sağlık kontrolü:

```sh
curl -fsS https://ozankaya.net/izolator/api/health
ssh eski 'docker compose -p izolator-prod --env-file /opt/izolator-secim-atolyesi/release.env -f /opt/izolator-secim-atolyesi/current/deploy/compose.yaml ps'
```

Bu ilk uygulama sürümüne geri dönmek için:

```sh
ssh eski 'cd /opt/izolator-secim-atolyesi/releases/20261023-5fb65f4 && docker compose -p izolator-prod --env-file release.env -f deploy/compose.yaml up -d --wait'
```

Sonraki yayınlarda `current` bağlantısı ve kökteki `release.env` de seçilen sürüme geçirilmelidir. Güncelleme ayrıntıları [README.md](README.md) içindedir.

Projeler kullanıcının tarayıcısında saklanır; alan adı değiştirildiğinde başka origin'deki IndexedDB verileri kendiliğinden taşınmaz. JSON dışa/içe aktarımıyla taşınabilir.
