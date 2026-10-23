import { expect, test } from '@playwright/test';

test('yayın kökü: JavaScript, API ve katalog görselleri aynı alt yolu kullanır', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Sistemi tanımlayın' })).toBeVisible();
  const base = new URL(page.url());
  const health = await page.request.get(new URL('api/health', base).href);
  expect(health.ok()).toBe(true);
  expect((await health.json()).status).toBe('ok');
  const scripts = await page
    .locator('script[src]')
    .evaluateAll((nodes) => nodes.map((node) => (node as HTMLScriptElement).src));
  for (const src of scripts) expect(new URL(src).pathname.startsWith(base.pathname)).toBe(true);
  await page.getByRole('button', { name: /02 İzolatör/ }).click();
  const photo = page.locator('.product-picture img');
  await expect(photo).toBeVisible();
  await expect
    .poll(() => photo.evaluate((node) => (node as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  expect(
    new URL((await photo.getAttribute('src')) as string, base).pathname.startsWith(base.pathname),
  ).toBe(true);
  if (base.pathname !== '/') {
    expect((await page.request.get(new URL('/', base).href)).status()).toBe(404);
    expect((await page.request.get(new URL('/api/health', base).href)).status()).toBe(404);
    const withoutSlash = await page.request.get(base.href.replace(/\/$/, ''), { maxRedirects: 0 });
    expect(withoutSlash.status()).toBe(308);
    expect(withoutSlash.headers().location).toMatch(/\/izolator\/$/);
  }
});
