# GitHub Actions ile otomatik yayın

`main` dalına push, `.github/workflows/verify.yml` içindeki `verify` işini başlatır. Python, OpenAPI, Vitest, üretim derlemesi ve iki farklı taban yolda Playwright kontrolleri geçerse `deploy` işi `production` ortamına yayın yapar. Pull request'ler ve diğer dallar sunucuya yayın yapmaz. `workflow_dispatch` ile Actions ekranından `main` için tekrar çalıştırılabilir.

## Erişim ve sınırlar

GitHub `production` ortamı yalnız `main` dalını kabul eder. Ortamdaki `ISOLATOR_DEPLOY_KEY` secret'ı bu uygulamaya ayrılmış Ed25519 anahtarıdır. Kullanıcının kişisel SSH anahtarı GitHub'a verilmez. Şu ortam değişkenleri de tanımlıdır:

- `ISOLATOR_DEPLOY_HOST`, `ISOLATOR_DEPLOY_PORT`, `ISOLATOR_DEPLOY_USER`.
- `ISOLATOR_KNOWN_HOSTS`: mevcut güvenilir SSH oturumundan alınan sunucu Ed25519 host anahtarı. Bağlantıda `StrictHostKeyChecking=yes` kullanılır.

Sunucuda bu public key, `authorized_keys` içinde `restrict,command="/usr/local/libexec/izolator-deploy"` ile sınırlıdır. Shell, SCP, port/agent forwarding ve PTY açamaz. Gateway yalnız tam 40 karakterli commit SHA'sıyla `deploy` veya `rollback` kabul eder. Gateway ve `/etc/izolator/compose.yaml` root'a aittir; push ile kendilerini değiştirmezler. Bu iki dosyanın güncellenmesi yönetici SSH oturumu gerektirir.

Gateway kaynak kodu [gateway.py](gateway.py), sunucudaki sabit runtime tanımı [runtime.compose.yaml](runtime.compose.yaml). Docker erişimi mevcut `ubuntu` kullanıcısı üzerinden sağlanır; uygulama konteynerlerine Docker socket veya host klasörleri bağlanmaz. Sunucudaki GitHub deposu public olduğu için repo erişim token'ı gerekmez.

## Yayın sırası

1. GitHub yalnız bir production işini aynı anda çalıştırır; başlayan yayını yeni push iptal etmez. Sunucu tarafındaki `deploy.lock` ayrıca manuel/otomatik yayınları sıraya alır.
2. Gateway GitHub'dan `main` dalını alır. İstenen SHA artık dalın ucunda değilse eski yayını atlar. GitHub API'den aynı SHA için `verify` kontrolünün başarılı olduğunu doğrular.
3. Kaynağı `/opt/izolator-secim-atolyesi/releases/<tam-SHA>/` içine açar. Frontend'e bu SHA'yı içeren `release.json` ekler.
4. Oracle'ın ARM64 mimarisinde API ve web imajlarını `izolator-api:<SHA>` / `izolator-web:<SHA>` etiketleriyle derler. `izolator-builder` yalnız bu uygulamaya aittir; 1 CPU, 2 GiB RAM ve tek paralel derleme sınırı vardır. BuildKit cache GC hedefi 4 GB'dir. Aktif build ve etiketli imajlar bu cache hedefinden ayrı disk alanı kullanabilir.
5. Yeni push gelmediyse yalnız `izolator-prod` API/web servislerini günceller. Önceki imajlar korunur. Nginx, TLS, diğer Compose projeleri, veritabanları ve volume'lar değiştirilmez.
6. Konteyner sağlıkları, HTTPS API, frontend commit'i, JavaScript, katalog görseli ve `/izolator/` yönlendirmeleri kontrol edilir. Hata olursa önceki sürümün imajları ve metadata geri yüklenir.
7. Başarılıysa `current` bağlantısı ve `release.env` atomik dosya değişimleriyle yeni sürüme geçirilir. `last-deployment.json` önceki sürümü kaydeder.
8. GitHub sunucu dışından HTTPS sağlık ve commit kontrolü yapar; bu kontrol başarısızsa yalnız o commit hâlâ aktifken geri alma çağrısı yapar.

Yeni sürüm derlenirken mevcut uygulama çalışır. Konteyner değişimi sırasında kısa bir erişim kesintisi olabilir. Sıfır kesinti için ayrı bir blue/green kurulum gerekir.

## Durum ve geri alma

Actions ekranı: https://github.com/ozankaya4/izolator_secim_atolyesi/actions/workflows/verify.yml

```sh
curl -fsS https://ozankaya.net/izolator/release.json
ssh eski 'cat /opt/izolator-secim-atolyesi/last-deployment.json'
ssh eski 'docker compose -p izolator-prod --env-file /opt/izolator-secim-atolyesi/release.env -f /etc/izolator/compose.yaml ps'
```

Son başarılı yayını geri almak için, aktif commit'in tam SHA'sını kullanın:

```sh
ssh eski 'SSH_ORIGINAL_COMMAND="rollback AKTIF_40_KARAKTER_SHA" /usr/local/libexec/izolator-deploy'
```

Geri alma yeni commit yayınlamaz; sonraki `main` push'ı otomatik yayın yapar. Kalıcı düzeltme için Git'te revert/düzeltme commit'i gönderin. Sürüm dizinleri ve etiketli uygulama imajları geri alma için korunur; disk kullanımı izlenip yalnız artık gerekmeyen bu uygulama sürümleri temizlenebilir. Genel `docker system prune` kullanılmaz.

Anahtar rotasyonu: yeni bir uygulama anahtarı oluşturun, sunucuda aynı kısıtlarla ekleyin, `production/ISOLATOR_DEPLOY_KEY` secret'ını değiştirin ve başarılı bağlantıdan sonra yalnız eski uygulama anahtarını kaldırın. Private key dosyalarını repoya koymayın. Diğer sunucu anahtarları ve kullanıcının SSH girişi korunmalıdır.

Gateway geri alma ve komut sınırı testleri:

```sh
python3 -m unittest discover -s deploy/tests -v
```

Resmî kaynaklar: [GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency), [Docker BuildKit kaynak sınırları](https://docs.docker.com/build/builders/drivers/docker-container/).
