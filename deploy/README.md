# ozankaya.net/izolator — Oracle yayını

Üretim adresi `https://ozankaya.net/izolator/` olur. `/izolator` sonuna `/` eklenerek yönlendirilir. Alan adının kökü uygulamayı sunmaz.

`main` push'larında testlerden sonra otomatik yayın etkindir. Güncel akış, sınırlar ve geri alma komutları [CICD.md](CICD.md) içindedir. Aşağıdaki derleme komutları ilk manuel kurulum içindir; otomatik yayın `/etc/izolator/compose.yaml` dosyasını kullanır.

## Yol ve servis ayrımı

Vite `/izolator/` tabanıyla derlenir. API ve katalog görselleri `import.meta.env.BASE_URL` kullanır. Host Nginx yalnız yeni `ozankaya.net` sanal sunucusunu yönetir; `/izolator/` önekini kaldırıp `127.0.0.1:18180` portuna iletir. İç web konteyneri `/api/` çağrılarını API'ye geçirir. Böylece alan adının `/api` veya `/assets` yolları uygulama tarafından işgal edilmez.

`deploy/compose.yaml`, yerel `compose.yaml` dosyasından bağımsızdır. Üretim proje adı `izolator-prod`; diğer Compose projelerinin konteyner/ağ/volume'larını kullanmaz. API portu dışarı açılmaz. API 1 CPU / 1536 MiB, web 0.25 CPU / 128 MiB ile sınırlandırılır. Loglar döndürülür. Haricî veritabanı veya kalıcı sunucu verisi yoktur; projeler tarayıcı IndexedDB'sinde kalır.

## Kaynak ve sürüm

Sunucu klasörü `/opt/izolator-secim-atolyesi/`:

- `releases/<sürüm>/`: belirli Git commit'inden alınan kaynak.
- `current`: etkin sürüme sembolik bağlantı.
- `release.env`: `ISOLATOR_RELEASE=<sürüm>` ve `ISOLATOR_PORT=18180`.
- `backups/`: ilk Nginx yedeği, eski sitelerin dosya hash'leri/konteyner kimlikleri/servis başlangıçları ve önceki sürüm kayıtları.

Güncelleme aynı proje adıyla, yeni sürüm dizininden yapılır:

```sh
docker compose -p izolator-prod --env-file /opt/izolator-secim-atolyesi/release.env \
  -f /opt/izolator-secim-atolyesi/current/deploy/compose.yaml up --build -d --wait
```

Önce yeni sürümü derleyip test edin; mevcut `current` bağlantısı ile `release.env` dosyasını yedekleyin. `ISOLATOR_RELEASE` değişince önceki etiketli imajlar yerinde kalır. Geri almak için önceki kaynak dizini ve sürüm etiketiyle aynı `up -d --wait` komutunu çalıştırın. Başka projelerin `docker compose down`, `docker system prune`, veritabanı veya volume komutlarını kullanmayın.

## Nginx ve TLS

Yalnız `/etc/nginx/sites-available/ozankaya.net.conf` ve bunun `sites-enabled` bağlantısı eklenir. Önce `nginx-http.conf` ile HTTP / ACME doğrulanır. Namecheap `@ A 89.168.93.55` yönlendirmesi yayıldıktan sonra mevcut Certbot ile:

```sh
sudo certbot certonly --webroot -w /var/www/ozankaya-acme \
  -d ozankaya.net --cert-name ozankaya.net --non-interactive
```

Sunucunun önceden kayıtlı ACME hesabı kullanılır; mevcut hesap/iletişim tercihleri değiştirilmez.

Sertifika alındıktan sonra yalnız bu alan adına `nginx-https.conf` uygulanır. Her değişiklikte önce `sudo nginx -t`, sonra `sudo systemctl reload nginx` kullanılır. Nginx yeniden başlatılmaz; mevcut bağlantılar korunur. `renewal-hook.sh`, `/etc/letsencrypt/renewal-hooks/deploy/50-izolator-nginx` konumuna 755 izniyle kurulur; yalnız `ozankaya.net` sertifikası başarıyla yenilendiğinde doğrulanmış Nginx reload yapar. Mevcut alan adlarının sertifika ve renewal dosyaları değiştirilmez.

## Doğrulama

Önekli kurulum yerelde aynı iki proxy katmanıyla test edilebilir:

```sh
docker compose -p izolator-subpath-check -f deploy/compose.yaml -f deploy/compose.test.yaml up --build -d --wait
BASE_URL=http://127.0.0.1:18181/izolator/ pnpm --dir frontend test:e2e
docker compose -p izolator-subpath-check -f deploy/compose.yaml -f deploy/compose.test.yaml down
```

Canlı sürüm:

```sh
curl -fsS https://ozankaya.net/izolator/api/health
BASE_URL=https://ozankaya.net/izolator/ pnpm --dir frontend test:e2e
```

Yayın öncesi/sonrası mevcut sitelerin HTTP durumları, Nginx yapılandırma hash'leri, eski konteyner kimlikleri ve servis başlangıçları karşılaştırılır. İlk kurulumun sonuçları `DEPLOYMENT.md` dosyasına kaydedilir.

Resmî referanslar: [Vite public base path](https://vite.dev/guide/build#public-base-path), [Nginx proxy URI eşlemesi](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass), [Certbot webroot ve yenileme](https://eff-certbot.readthedocs.io/en/stable/using.html).

## Güvenlik ayarları

HTTPS vhost kurulmadan önce `nginx-limits.conf`, `/etc/nginx/conf.d/izolator-limits.conf` olarak kurulmalıdır; `nginx-https.conf` bu HTTP bağlamındaki bölgeyi kullanır. Yalnız `/izolator/api/jobs` için IP başına 10 istek/dakika ve 6 istek ani yoğunluk payı uygulanır. Sonundaki `/` biçimi 308 ile aynı sınırlı adrese yönlenir. API/proje gövdesi en fazla 256 KiB. `nginx -t` başarılı olmadan reload yapılmaz.

`runtime.compose.yaml` ve `compose.yaml` API'yi salt okunur dosya sistemi, tüm Linux yetkileri düşürülmüş ve ayrıcalık artışı kapalı olarak çalıştırır. Web salt okunurdur; Nginx geçici alanları boyut sınırlı tmpfs kullanır. Root'a ait `/etc/izolator/compose.yaml` değişiklikleri normal push ile kurulmaz; yönetici SSH oturumunda ayrıca doğrulanıp kurulmalıdır.
