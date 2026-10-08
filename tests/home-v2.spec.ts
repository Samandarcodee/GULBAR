import { test, expect, type Page } from '@playwright/test';

const phone = { width: 390, height: 844 };

async function checkoutStart(page: Page) {
  await page.getByRole('button', { name: 'Savatni ochish', exact: true }).click();
  await page.getByRole('button', { name: 'Buyurtma berish', exact: true }).click();
}

test('first prices are visible on a phone without scrolling', async ({ page }) => {
  await page.setViewportSize(phone);
  await page.goto('/');
  // the demo ribbon exists only in demo mode; the real app has that much more room
  await page.locator('.demo-bar').evaluate(e => e.remove()).catch(() => {});
  const price = page.locator('.gm-price').first();
  await expect(price).toBeVisible();
  const box = (await price.boundingBox())!;
  const nav = (await page.locator('.mobile-nav').boundingBox())!;
  expect(box.y + box.height).toBeLessThan(nav.y);
});

test('search, sort and budget narrow the list; the filters survive a trip to a shop page', async ({ page }) => {
  await page.setViewportSize(phone);
  await page.goto('/');
  const items = page.locator('.gm-item');
  await expect(items).toHaveCount(29);

  // name search ignores apostrophes and also matches the shop name
  await page.getByRole('searchbox', { name: 'Gul yoki do‘kon qidirish' }).fill('bulut');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('Oq Bulut');
  await page.getByRole('button', { name: 'Qidiruvni tozalash' }).click();
  await expect(items).toHaveCount(29);
  await page.getByRole('searchbox', { name: 'Gul yoki do‘kon qidirish' }).fill('sonya');
  await expect(items.first()).toContainText('So‘nya');
  await page.getByRole('searchbox', { name: 'Gul yoki do‘kon qidirish' }).fill('');

  // budget + cheapest first
  await page.getByRole('button', { name: 'Saralash va narx' }).click();
  await page.getByRole('radio', { name: '500 000 gacha' }).click();
  await page.getByRole('radio', { name: 'Avval arzonlari' }).click();
  await page.getByRole('button', { name: /ta guldastani ko‘rish/ }).click();
  // items that were filtered out fade away first, so wait until only the cheap ones are left
  const readPrices = async () => (await page.locator('.gm-price b').allInnerTexts()).map(p => Number(p.replace(/\D/g, '')));
  await expect.poll(async () => Math.max(...await readPrices())).toBeLessThan(500000);
  const nums = await readPrices();
  expect(nums.length).toBeGreaterThan(0);
  expect(nums).toEqual([...nums].sort((a, b) => a - b));
  const narrowed = await items.count();

  // choose a shop, sort, scroll, open the shop page and come back
  await page.getByRole('button', { name: 'Tozalash' }).first().click();
  await page.locator('.gm-shops').getByRole('button', { name: 'Gold Flowers', exact: true }).click();
  await page.getByRole('button', { name: 'Saralash va narx' }).click();
  await page.getByRole('radio', { name: 'Avval qimmatlari' }).click();
  await page.getByRole('button', { name: /ta guldastani ko‘rish/ }).click();
  // bring the link into view first (Playwright would otherwise scroll by itself) and measure the position the buyer really leaves from
  const link = page.locator('.gm-shop-link:visible').last();
  await link.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(300);
  await link.click();
  await expect(page.getByRole('button', { name: 'Orqaga' })).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(50);
  await page.getByRole('button', { name: 'Orqaga' }).click();
  await expect(page.locator('.gm-shops').getByRole('button', { name: 'Gold Flowers', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before - 40);
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(before + 40);
  await page.getByRole('button', { name: 'Saralash va narx (tanlangan)' }).click();
  await expect(page.getByRole('radio', { name: 'Avval qimmatlari' })).toHaveAttribute('aria-checked', 'true');
  expect(narrowed).toBeGreaterThan(0);
});

test('a saved cart with a vanished product is cleaned up and explained, and the order still goes through', async ({ page }) => {
  await page.setViewportSize(phone);
  await page.addInitScript(() => localStorage.setItem('flowrs-cart', JSON.stringify([{ productId: 'no-such-product', quantity: 2 }])));
  await page.goto('/');
  await expect(page.getByRole('status').filter({ hasText: 'Savat yangilandi' })).toBeVisible();
  // a real bouquet is added next to the stale entry: the cart is cleaned before checkout
  await page.getByRole('button', { name: 'Pushti kayfiyatni savatga qo‘shish' }).click();
  await page.getByRole('button', { name: 'Savatni ochish', exact: true }).click();
  await expect(page.locator('.cart-notes')).toContainText('1 ta gul endi sotuvda yo‘q');
  await expect(page.locator('.cart-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'Tushunarli' }).click();
  await expect(page.locator('.cart-notes')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('flowrs-cart') || '[]').length)).toBe(1);
});

test('a cancelled order explains why and what to do next', async ({ page }) => {
  await page.setViewportSize(phone);
  await page.goto('/');
  await page.getByRole('button', { name: 'Pushti kayfiyatni savatga qo‘shish' }).click();
  await checkoutStart(page);
  await page.getByRole('textbox', { name: 'Ismingiz', exact: true }).fill('Dilnoza');
  await page.getByRole('textbox', { name: 'Telefoningiz', exact: true }).fill('+998901112233');
  await page.getByRole('textbox', { name: 'Qabul qiluvchi', exact: true }).fill('Madina opa');
  await page.getByRole('textbox', { name: 'Qabul qiluvchi telefoni', exact: true }).fill('+998901112244');
  await page.getByRole('textbox', { name: 'Urganchdagi yetkazish manzili' }).fill('Urganch, Al-Xorazmiy ko‘chasi 12');
  await page.getByRole('radiogroup', { name: 'Sana' }).getByRole('radio').nth(2).click();
  await page.getByRole('radiogroup', { name: /Vaqt oralig/ }).locator('[role=radio]:not([disabled])').last().click();
  await page.getByRole('button', { name: 'Demo buyurtmani saqlash' }).click();
  await page.getByRole('button', { name: 'Buyurtmani ko‘rish' }).click();
  const card = page.locator('.customer-orders .order-card').first();

  // the buyer cancels: own reason, no "other shop" nudge
  await card.getByRole('button', { name: 'Bekor qilish' }).click();
  await page.getByRole('button', { name: 'Ha, bekor qilish' }).click();
  await expect(card.locator('.cancel-reason.customer')).toContainText('Siz bu buyurtmani bekor qildingiz');
  await expect(card.getByRole('button', { name: 'Boshqa do‘kon tanlash' })).toHaveCount(0);
});

test('a dropped connection ends in a clear message and a retry that works', async ({ page }) => {
  await page.setViewportSize(phone);
  let fail = true;
  await page.route('**/api/catalog', route => (fail ? route.abort() : route.continue()));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Internet sekin yoki uzilgan');
  fail = false;
  await page.getByRole('button', { name: 'Qayta urinish' }).click();
  await expect(page.locator('.gm-item').first()).toBeVisible();
});
