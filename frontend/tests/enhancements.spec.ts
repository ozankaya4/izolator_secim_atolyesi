import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function startProject(page: Page) {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Sistemi tanımlayın' })).toBeVisible();
  const response = await page.request.get(new URL('api/projects/default', page.url()).href);
  const project = await response.json();
  project.random.enabled = false;
  project.shock.enabled = false;
  await page.locator('input[type=file]').setInputFiles({
    name: 'ornek.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.getByText('Dosya doğrulandı ve proje açıldı.')).toBeVisible();
  return project;
}
async function compute(page: Page) {
  await page.getByRole('button', { name: 'Hesapla', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sonuçlar', exact: true })).toBeVisible();
}

test('proje bilgileri rapor snapshot’ına sabitlenir; notlar metin olarak kalır', async ({
  page,
}) => {
  await startProject(page);
  await page.locator('.project-details > summary').click();
  await page.getByLabel('Müşteri / kuruluş').fill('Örnek Atölye');
  await page.getByLabel('Makine / ekipman').fill('Pompa grubu');
  await page.getByLabel('Revizyon', { exact: true }).fill('A01');
  await page
    .getByLabel('Proje notları / üreticiye sorulacaklar')
    .fill('<img src=x onerror=alert(1)>\nÜretici doğrulaması bekleniyor.');
  await compute(page);
  await expect(page.locator('.utilization-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Rapor', exact: true }).click();
  await expect(page.locator('.report').getByText('Örnek Atölye', { exact: true })).toBeVisible();
  await expect(page.locator('.project-notes')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.project-notes img')).toHaveCount(0);
  await expect(
    page.locator('.report').getByRole('heading', { name: 'Yükler ve kabul sınırları' }),
  ).toBeVisible();
  const exportPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Rapor girdisi JSON' }).click();
  const exportPath = await (await exportPromise).path();
  expect(exportPath).not.toBeNull();
  const exported = JSON.parse(await readFile(exportPath!, 'utf8'));
  expect(exported.details.customer).toBe('Örnek Atölye');
  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: 'test-results/proje-bilgili-rapor.pdf',
    format: 'A4',
    printBackground: true,
  });
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Raporu kapat' }).click();
  await page.getByRole('button', { name: /01 Sistem/ }).click();
  await page.getByLabel('Müşteri / kuruluş').fill('Yeni müşteri');
  await page.getByRole('button', { name: 'Rapor', exact: true }).click();
  await expect(page.locator('.report .stale-banner')).toBeVisible();
  await expect(page.locator('.report').getByText('Örnek Atölye', { exact: true })).toBeVisible();
  await expect(page.locator('.report').getByText('Yeni müşteri', { exact: true })).toHaveCount(0);
});

test('senaryolar taslaktan bağımsız kalır, farklı yük uyarısı ve yeniden açma çalışır', async ({
  page,
}) => {
  await startProject(page);
  await page.getByLabel('Proje adı', { exact: true }).fill('Alternatif A');
  await compute(page);
  await page.getByRole('button', { name: 'Karşılaştırmaya ekle' }).click();
  await expect(page.getByRole('heading', { name: 'Senaryo karşılaştırması' })).toBeVisible();
  await page.getByRole('button', { name: /01 Sistem/ }).click();
  await page.getByLabel('Proje adı', { exact: true }).fill('Alternatif B');
  await page.getByLabel('Toplam kütle kg').fill('50');
  await page.getByRole('button', { name: /03 Yükler/ }).click();
  await page.getByLabel('Taban ivmesi g tepe').fill('3');
  await compute(page);
  await page.getByRole('button', { name: 'Karşılaştırmaya ekle' }).click();
  await expect(page.getByText(/Dinamik yükler veya kabul sınırları farklı/)).toBeVisible();
  const table = page.locator('.comparison-table');
  await expect(table).toContainText('40 kg');
  await expect(table).toContainText('50 kg');
  await page.getByLabel('Senaryo adı Alternatif B').fill('Revize alternatif');
  await page.getByRole('heading', { name: 'Senaryo karşılaştırması' }).click();
  await expect(page.getByLabel('Senaryo adı Revize alternatif')).toHaveValue('Revize alternatif');
  await page.reload();
  await page.getByRole('button', { name: /05 Karşılaştırma/ }).click();
  await expect(page.getByLabel('Senaryo adı Revize alternatif')).toHaveValue('Revize alternatif');
  await table.getByRole('button', { name: 'Taslak olarak aç', exact: true }).first().click();
  await expect(page.getByLabel('Toplam kütle kg')).toHaveValue('40');
  await expect(page.getByLabel('Proje adı', { exact: true })).toHaveValue('Alternatif A');
  await page.getByRole('button', { name: /05 Karşılaştırma/ }).click();
  await expect(page.locator('.comparison-table')).toContainText('50 kg');
  await page.screenshot({ path: 'test-results/karsilastirma-desktop.png', fullPage: true });
});

test('beşinci senaryo önceki dört kaydı sessizce silmez', async ({ page }) => {
  await startProject(page);
  for (let index = 0; index < 5; index++) {
    await page.getByRole('button', { name: /01 Sistem/ }).click();
    await page.getByLabel('Proje adı', { exact: true }).fill('Senaryo ' + (index + 1));
    await page.getByLabel('Toplam kütle kg').fill(String(40 + index));
    await compute(page);
    await page.getByRole('button', { name: 'Karşılaştırmaya ekle' }).click();
    if (index < 4)
      await expect(page.getByRole('heading', { name: 'Senaryo karşılaştırması' })).toBeVisible();
  }
  await expect(page.getByRole('alert')).toContainText('En fazla dört senaryo');
  await page.getByRole('button', { name: /05 Karşılaştırma/ }).click();
  await expect(page.locator('.scenario-header input')).toHaveCount(4);
  await expect(page.getByLabel('Senaryo adı Senaryo 1')).toHaveValue('Senaryo 1');
});

test('geçersiz alan adım ve rapor değişiminde kaybolmaz; JSON açma alanı sıfırlar', async ({
  page,
}) => {
  const project = await startProject(page);
  await compute(page);
  await page.getByRole('button', { name: /01 Sistem/ }).click();
  await page.getByLabel('Toplam kütle kg').fill('yanlış');
  await page.getByRole('button', { name: /03 Yükler/ }).click();
  await expect(page.getByRole('button', { name: 'Hesapla', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Rapor', exact: true }).click();
  await expect(page.locator('.report .stale-banner')).toBeVisible();
  await page.getByRole('button', { name: 'Raporu kapat' }).click();
  await page.getByRole('button', { name: /01 Sistem/ }).click();
  await expect(page.getByLabel('Toplam kütle kg')).toHaveValue('yanlış');
  await page.locator('input[type=file]').setInputFiles({
    name: 'gecerli.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.getByLabel('Toplam kütle kg')).toHaveValue('40');
  await expect(page.getByRole('button', { name: 'Hesapla', exact: true })).toBeEnabled();
});

test('yerleşim geri alma, daha sonra düzenlenen kütleyi değiştirmez', async ({ page }) => {
  await startProject(page);
  await page.getByRole('button', { name: /02 İzolatör/ }).click();
  await page.getByLabel('Yerleşim örneği').selectOption('base6');
  await page.getByRole('button', { name: 'Örneği uygula' }).click();
  await page.getByRole('button', { name: /01 Sistem/ }).click();
  await page.getByLabel('Toplam kütle kg').fill('65');
  await page.getByRole('button', { name: /02 İzolatör/ }).click();
  await page.getByRole('button', { name: 'Son işlemi geri al' }).click();
  await expect(page.locator('.project-summary')).toContainText('4 izolatör');
  await expect(page.locator('.project-summary')).toContainText('65 kg');
});

test('gecikmiş JSON içe aktarımı yeni girdiyi ezmez; büyük dosya okunmadan reddedilir', async ({
  page,
}) => {
  const project = await startProject(page);
  await page.route('**/api/projects/migrate', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await page.locator('input[type=file]').setInputFiles({
    name: 'eski.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByLabel('Toplam kütle kg').fill('88');
  await expect(page.getByText(/İşlem sürerken girdiler değişti/)).toBeVisible();
  await expect(page.getByLabel('Toplam kütle kg')).toHaveValue('88');
  await page.locator('input[type=file]').setInputFiles({
    name: 'buyuk.json',
    mimeType: 'application/json',
    buffer: Buffer.alloc(262145, ' '),
  });
  await expect(page.getByRole('alert')).toContainText('256 KiB');
  await expect(page.getByLabel('Toplam kütle kg')).toHaveValue('88');
});

test('rehber klavyeyle aranır ve kapanınca odak geri gelir; mobil taşma oluşmaz', async ({
  page,
}) => {
  await startProject(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const button = page.getByRole('button', { name: 'Kullanım rehberi ve terimler' });
  await button.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.getByLabel('Terim ara').fill('RMS');
  await expect(dialog).toContainText('RMS ve σ');
  await expect(dialog.getByText('Atalet · kg·m²', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('JSON doğrulaması sürerken yazılan geçersiz ham giriş de korunur', async ({ page }) => {
  const project = await startProject(page);
  await page.route('**/api/projects/migrate', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  const response = page.waitForResponse('**/api/projects/migrate');
  await page.locator('input[type=file]').setInputFiles({
    name: 'eski.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByLabel('Toplam kütle kg').fill('yanlış');
  await response;
  await expect(page.getByText(/İşlem sürerken girdiler değişti/)).toBeVisible();
  await expect(page.getByLabel('Toplam kütle kg')).toHaveValue('yanlış');
  await expect(page.getByRole('button', { name: 'Kaydet', exact: true })).toBeDisabled();
});

test('yük sekmesi değiştirilince hatalı sayısal giriş sessizce silinmez', async ({ page }) => {
  await startProject(page);
  await page.getByRole('button', { name: /03 Yükler/ }).click();
  await page.getByLabel('Taban ivmesi g tepe').fill('hatalı');
  await page.getByRole('tab', { name: 'Şok', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hesapla', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: 'Harmonik', exact: true }).click();
  await expect(page.getByLabel('Taban ivmesi g tepe')).toHaveValue('hatalı');
});
