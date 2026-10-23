import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sistemi tanımlayın' })).toBeVisible();
});
test('hesap, güncellik, snapshot raporu ve taslak kurtarma', async ({ page }) => {
  await page.getByLabel('Toplam kütle kg').fill('40,5');
  await page.getByRole('button', { name: 'Hesapla', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sonuçlar', exact: true })).toBeVisible();
  await expect(page.getByText('Doğrulama gerekli').first()).toBeVisible();
  await page.getByRole('button', { name: /01 Sistem/ }).click();
  await page.getByLabel('Toplam kütle kg').fill('55');
  await expect(page.locator('.freshness')).toHaveText('Güncel değil');
  await page.getByRole('button', { name: 'Rapor', exact: true }).click();
  await expect(page.getByText('ESKİ SNAPSHOT RAPORU — Güncel taslak değişti.')).toBeVisible();
  await expect(page.locator('.report').getByText('40,5 kg', { exact: true })).toBeVisible();
  await expect(page.locator('.report').getByText('55 kg', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Raporu kapat' }).click();
  await expect(page.getByText('Taslak kaydedildi')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Toplam kütle kg')).toHaveValue('55');
  await expect(page.getByText('Son yerel taslağınız kurtarıldı.')).toBeVisible();
});
test('katalog kabulü, 3B seçim, kaynak değişimi ve yerleşim geri alma', async ({ page }) => {
  await page.getByRole('button', { name: /02 İzolatör/ }).click();
  await page.getByLabel('Üretici ailesi').selectOption('soc');
  await expect(page.getByRole('button', { name: 'Tümüne uygula', exact: true })).toBeDisabled();
  await page
    .getByLabel('Frekans ve referans yükten türetilen k_eq tahminini kabul ediyorum')
    .check();
  await page.getByRole('button', { name: 'Tümüne uygula', exact: true }).click();
  await expect(page.locator('.source-label')).toContainText('k_eq tahmini');
  await page.getByLabel('Yerleşim örneği').selectOption('base6');
  await page.getByRole('button', { name: 'Örneği uygula' }).click();
  await expect(page.locator('.project-summary')).toContainText('6 izolatör');
  await page.getByRole('button', { name: 'Son işlemi geri al' }).click();
  await expect(page.locator('.project-summary')).toContainText('4 izolatör');
  await page.locator('.mount-chips').getByRole('button', { name: /I2/ }).click();
  await expect(page.getByRole('heading', { name: 'I2 özellikleri' })).toBeVisible();
  await page.getByLabel('k1 N/mm', { exact: true }).fill('72,5');
  await expect(page.locator('.source-label')).toContainText('elle girilen katılık');
  await page.getByRole('button', { name: 'Ayrıntılı tablo', exact: true }).click();
  await expect(page.getByLabel('I2 k1 N/mm')).toHaveValue('72.5');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/yerlesim-desktop.png' });
});
test('PSD ayraç hatası atomik kalır, satır hatası gösterilir', async ({ page }) => {
  await page.getByRole('button', { name: /03 Yükler/ }).click();
  await page.getByRole('tab', { name: 'Rastlantısal / PSD' }).click();
  await page.getByLabel('PSD metnini yapıştırın').fill('5,0,01\n10,0,02');
  await page.getByRole('button', { name: 'Tabloya aktar' }).click();
  await expect(page.getByRole('alert')).toContainText('Satır 1');
  await expect(page.getByLabel('PSD satır 1 frekans Hz')).toHaveValue('5');
  await page.getByLabel('PSD metnini yapıştırın').fill('7;0,02\n30;0,05');
  await page.getByRole('button', { name: 'Tabloya aktar' }).click();
  await expect(page.getByLabel('PSD satır 1 frekans Hz')).toHaveValue('7');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
test('hatalı JSON mevcut projeyi kısmen değiştirmez ve güncel taslak dışa aktarılır', async ({
  page,
}) => {
  await page.getByLabel('Toplam kütle kg').fill('88');
  await page.locator('input[type=file]').setInputFiles({
    name: 'bozuk.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schema_version":"isolation-project-v5","mounts":[]}'),
  });
  await expect(page.getByRole('alert')).toContainText('mevcut proje korundu');
  await expect(page.getByLabel('Toplam kütle kg')).toHaveValue('88');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const file = await download;
  const stream = await file.createReadStream();
  const parts: Buffer[] = [];
  for await (const part of stream!) parts.push(Buffer.from(part));
  expect(JSON.parse(Buffer.concat(parts).toString()).system.mass_kg).toBe(88);
});
test('girdi değişince gecikmiş istek yeni modele sonuç yazmaz', async ({ page }) => {
  await page.route('**/api/jobs', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.continue();
  });
  await page.getByRole('button', { name: 'Hesapla', exact: true }).click();
  await page.getByLabel('Toplam kütle kg').fill('65');
  await expect(page.getByRole('button', { name: 'Hesapla', exact: true })).toBeEnabled();
  await page.waitForTimeout(1600);
  await expect(page.getByRole('heading', { name: 'Sistemi tanımlayın' })).toBeVisible();
  await expect(page.locator('.freshness')).toHaveText('Henüz hesaplanmadı');
  await expect(page.getByLabel('Toplam kütle kg')).toHaveValue('65');
});
test('şok tam zaman aralığı, tepe bağımsızlığı, grafikler ve A4 rapor', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('button', { name: /03 Yükler/ }).click();
  await page.getByRole('tab', { name: 'Şok', exact: true }).click();
  await page.getByLabel('Ortak ön / son kompanzasyon').selectOption('10');
  await page.getByRole('button', { name: 'Hesapla', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sonuçlar', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Şok', exact: true }).click();
  const peaks = await page.locator('.peak-cards').innerText();
  await page.getByRole('button', { name: 'Tam kayıt / sıfırla' }).click();
  expect(await page.locator('.peak-cards').innerText()).toBe(peaks);
  await expect(page.locator('.shock-chart svg').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Harmonik', exact: true }).click();
  await page.getByRole('button', { name: 'Lineer', exact: true }).click();
  await page.getByLabel('Frekans imleci').fill('100');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/sonuclar-desktop.png' });
  await page.getByRole('button', { name: 'Rapor', exact: true }).click();
  await expect(page.locator('.report .chart svg').first()).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: 'test-results/ornek-rapor.pdf', format: 'A4', printBackground: true });
  expect(errors).toEqual([]);
});
test('geçersiz sayısal giriş hesabı durdurur; mobil tek sütun ve görünür odak', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Toplam kütle kg').fill('geçersiz');
  await expect(page.getByRole('button', { name: 'Hesapla', exact: true })).toBeDisabled();
  await expect(page.getByText('Geçerli sayı girin (1,25 veya 1.25).')).toBeVisible();
  await page.getByLabel('Toplam kütle kg').fill('40');
  await expect(page.getByRole('button', { name: 'Hesapla', exact: true })).toBeEnabled();
  await page.getByLabel('Toplam kütle kg').focus();
  await expect(page.getByLabel('Toplam kütle kg')).toBeFocused();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({ path: 'test-results/sistem-mobil.png', fullPage: true });
});
