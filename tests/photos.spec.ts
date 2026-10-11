import { resolve } from 'node:path';
import { test, expect, type Page } from '@playwright/test';

const pinkBouquet = resolve('public/images/pink-bouquet.jpg');
const lily = resolve('public/images/lily.jpg');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// the demo shop panel opens without a password. Saving is always intercepted, so no flower is added and the demo data other tests use stays as it was.
async function openForm(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/merchant?shop=lola');
  await page.getByRole('button', { name: 'Panelni ochish' }).click();
  await page.getByRole('button', { name: 'Gullar va narxlar', exact: true }).click();
  await page.getByRole('button', { name: 'Gul qo‘shish', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nomi', { exact: true }).fill('Sinov guldastasi');
  await dialog.getByLabel('Tavsifi', { exact: true }).fill('Faqat sinov uchun');
  return dialog;
}
function captureSave(page: Page) {
  const saved: { body?: any; count: number } = { count: 0 };
  void page.route('**/api/merchant/lola/products', route => {
    if (route.request().method() !== 'POST') return route.continue();
    saved.count++; saved.body = route.request().postDataJSON(); return route.abort();
  });
  return saved;
}

test('photos chosen from the gallery are stored and the first one becomes the main picture', async ({ page }) => {
  const dialog = await openForm(page);
  const saved = captureSave(page);
  await dialog.getByLabel('Galereyadan rasm tanlash').setInputFiles([pinkBouquet, lily]);
  await expect(dialog.locator('.extra-thumb')).toHaveCount(2);
  await expect(dialog.locator('.extra-thumb').first()).toContainText('Asosiy');
  await expect(dialog.getByText('(2/5)')).toBeVisible();
  await dialog.getByRole('button', { name: 'Saqlash', exact: true }).click();
  await expect.poll(() => saved.count).toBe(1);
  expect(saved.body.image).toMatch(/^\/api\/images\//);
  expect(saved.body.images).toHaveLength(1);
  expect(saved.body.images[0]).toMatch(/^\/api\/images\//);
  expect(saved.body.images[0]).not.toBe(saved.body.image);
});

test('a photo can be removed, and the next one becomes the main picture', async ({ page }) => {
  const dialog = await openForm(page);
  const saved = captureSave(page);
  await dialog.getByLabel('Galereyadan rasm tanlash').setInputFiles([pinkBouquet, lily]);
  await expect(dialog.locator('.extra-thumb')).toHaveCount(2);
  await dialog.getByRole('button', { name: '1-rasmni olib tashlash' }).click();
  await expect(dialog.locator('.extra-thumb')).toHaveCount(1);
  await expect(dialog.locator('.extra-thumb').first()).toContainText('Asosiy');
  await dialog.getByRole('button', { name: 'Saqlash', exact: true }).click();
  await expect.poll(() => saved.count).toBe(1);
  expect(saved.body.images).toEqual([]);
});

test('a picture address is not required, and saving without any picture explains what to do', async ({ page }) => {
  const dialog = await openForm(page);
  const saved = captureSave(page);
  const link = dialog.getByLabel('Rasm havolasi');
  await expect(link).not.toHaveAttribute('required', '');
  await dialog.getByRole('button', { name: 'Saqlash', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('kamida bitta rasm');
  expect(saved.count).toBe(0);
  await expect(dialog.getByLabel('Galereyadan rasm tanlash')).toBeFocused();
  await dialog.getByLabel('Galereyadan rasm tanlash').setInputFiles(pinkBouquet);
  await expect(dialog.getByRole('alert')).toHaveCount(0);
});

test('a website address is refused as a picture, a real picture address is accepted', async ({ page }) => {
  await page.route('https://pages.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Bu rasm emas</body></html>' }));
  await page.route('https://pics.test/**', route => route.fulfill({ contentType: 'image/png', body: PNG }));
  const dialog = await openForm(page);
  await dialog.getByText('Havola orqali qo‘shish').click();
  await dialog.getByLabel('Rasm havolasi').fill('https://pages.test/');
  await dialog.getByRole('button', { name: 'Qo‘shish', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('rasm emas');
  await expect(dialog.locator('.extra-thumb')).toHaveCount(0);
  await dialog.getByLabel('Rasm havolasi').fill('http://pics.test/rose.png');
  await dialog.getByRole('button', { name: 'Qo‘shish', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('https://');
  await dialog.getByLabel('Rasm havolasi').fill('https://pics.test/rose.png');
  await dialog.getByRole('button', { name: 'Qo‘shish', exact: true }).click();
  await expect(dialog.locator('.extra-thumb')).toHaveCount(1);
  await expect(dialog.getByRole('alert')).toHaveCount(0);
});

test('a flower whose picture does not open shows a quiet icon, not a broken-image mark', async ({ page }) => {
  await page.route('**/images/*.jpg', route => route.abort());
  await page.route('**/images/*.webp', route => route.abort());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/merchant?shop=lola');
  await page.getByRole('button', { name: 'Panelni ochish' }).click();
  await page.getByRole('button', { name: 'Gullar va narxlar', exact: true }).click();
  await expect(page.locator('.merchant-products .photo-missing').first()).toBeVisible();
  await expect(page.locator('.merchant-products img')).toHaveCount(0);
});
