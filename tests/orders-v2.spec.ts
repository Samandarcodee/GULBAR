import { test, expect, type Page } from '@playwright/test';

async function openCheckout(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Pushti kayfiyatni savatga qo‘shish' }).click();
  await page.getByRole('button', { name: 'Savatni ochish', exact: true }).click();
  await page.getByRole('button', { name: 'Buyurtma berish', exact: true }).click();
}
async function fillBuyer(page: Page, name = 'Dilnoza') {
  await page.getByRole('textbox', { name: 'Ismingiz', exact: true }).fill(name);
  await page.getByRole('textbox', { name: 'Telefoningiz', exact: true }).fill('+998901112233');
}
async function fillRecipient(page: Page) {
  await page.getByRole('textbox', { name: 'Qabul qiluvchi', exact: true }).fill('Madina opa');
  await page.getByRole('textbox', { name: 'Qabul qiluvchi telefoni', exact: true }).fill('+998901112244');
  await page.getByRole('textbox', { name: 'Urganchdagi yetkazish manzili' }).fill('Urganch, Al-Xorazmiy ko‘chasi 12');
}
/** Picks the third day chip (always open and in range) and the last window that is not disabled. */
async function pickSlot(page: Page) {
  await page.getByRole('radiogroup', { name: 'Sana' }).getByRole('radio').nth(2).click();
  await page.getByRole('radiogroup', { name: /Vaqt oralig/ }).locator('[role=radio]:not([disabled])').last().click();
  await expect(page.locator('.chosen-time')).toBeVisible();
}

test('map point, exact window and greeting card travel to the order', async ({ page }) => {
  await openCheckout(page);
  await fillBuyer(page);
  await fillRecipient(page);
  await page.getByRole('button', { name: 'Xaritada belgilash' }).click();
  const box = page.locator('.map-box');
  await expect(box).toBeVisible();
  const rect = (await box.boundingBox())!;
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await expect(page.locator('.map-pin')).toBeVisible();
  await page.getByRole('button', { name: 'Shu nuqtani tanlash' }).click();
  await expect(page.getByText('Xaritada belgilandi')).toBeVisible();
  await pickSlot(page);
  await page.getByRole('radio', { name: 'Oltin kartasi' }).click();
  await page.getByRole('button', { name: /Tug‘ilgan kuningiz/ }).click();
  await page.getByRole('textbox', { name: /Kimdan/ }).fill('Dilnoza');
  await expect(page.locator('.gcard-gold .gcard-text').last()).toContainText('Tug‘ilgan kuningiz');
  const sent = page.waitForRequest(r => r.url().endsWith('/api/orders') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Demo buyurtmani saqlash' }).click();
  const body = (await sent).postDataJSON();
  expect(body.delivery).toMatchObject({ method: 'delivery', when: 'slot' });
  expect(body.delivery.point.lat).toBeGreaterThan(41.2);
  expect(body.delivery.point.lng).toBeLessThan(61.3);
  expect(body.customer.cardStyle).toBe('gold');
  expect(body.customer.cardFrom).toBe('Dilnoza');
  await expect(page.getByRole('heading', { name: 'Demo buyurtma saqlandi' })).toBeVisible();
  await page.getByRole('button', { name: 'Buyurtmani ko‘rish' }).click();
  await expect(page.locator('.delivery-when').first()).toContainText('–');
});

test('pickup removes the delivery fee and needs no address', async ({ page }) => {
  await openCheckout(page);
  await fillBuyer(page);
  const feeBefore = await page.locator('.order-summary').innerText();
  expect(feeBefore).toContain('20');
  await page.getByRole('radio', { name: /Do‘kondan olib ketish/ }).click();
  await expect(page.locator('.pickup-note')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Urganchdagi yetkazish manzili' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Xaritada belgilash' })).toHaveCount(0);
  await pickSlot(page);
  const sent = page.waitForRequest(r => r.url().endsWith('/api/orders') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Demo buyurtmani saqlash' }).click();
  const body = (await sent).postDataJSON();
  expect(body.delivery.method).toBe('pickup');
  expect(body.delivery.point).toBeUndefined();
  await expect(page.getByRole('heading', { name: 'Demo buyurtma saqlandi' })).toBeVisible();
  await page.getByRole('button', { name: 'Buyurtmani ko‘rish' }).click();
  await expect(page.getByText(/Do‘kondan olib ketasiz/)).toBeVisible();
});

test('buyer cancels an unconfirmed order, then writes to support and sees it in the profile', async ({ page }) => {
  await openCheckout(page);
  await fillBuyer(page);
  await fillRecipient(page);
  await pickSlot(page);
  await page.getByRole('button', { name: 'Demo buyurtmani saqlash' }).click();
  await page.getByRole('button', { name: 'Buyurtmani ko‘rish' }).click();
  const card = page.locator('.customer-orders .order-card').first();
  await card.getByRole('button', { name: 'Bekor qilish' }).click();
  await page.getByRole('button', { name: 'Yo‘q, qoldiraman' }).click();
  await expect(card.locator('.status')).toHaveText('Tasdiq kutilmoqda');
  await card.getByRole('button', { name: 'Bekor qilish' }).click();
  await page.getByRole('button', { name: 'Ha, bekor qilish' }).click();
  await expect(card.locator('.status')).toHaveText('Bekor qilindi');
  await expect(card.getByRole('button', { name: 'Bekor qilish' })).toHaveCount(0);
  await expect(card.getByText(/Siz bu buyurtmani bekor qildingiz/)).toBeVisible();

  await card.getByRole('button', { name: /Shikoyat \/ yordam/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Buyurtma #/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Yuborish' }).click();
  await expect(dialog.getByRole('alert')).toContainText('kamida 5');
  await dialog.getByRole('textbox', { name: 'Xabaringiz' }).fill('Buyurtma noto‘g‘ri vaqtga qo‘yilgan edi');
  await dialog.getByRole('button', { name: 'Yuborish' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Murojaatingiz yuborildi' })).toBeVisible();

  await page.locator('.mobile-nav').getByRole('button', { name: 'Profil' }).click();
  await expect(page.getByRole('heading', { name: 'Yordam' })).toBeVisible();
  await page.getByText('Buyurtmani qanday bekor qilaman?').click();
  await expect(page.getByText(/Bekor qilish» tugmasi/)).toBeVisible();
  await expect(page.locator('.ticket').first()).toContainText('noto‘g‘ri vaqtga');
  await expect(page.locator('.ticket-state').first()).toContainText('Ko‘rib chiqilmoqda');
});
