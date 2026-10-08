import { test, expect, type Page } from '@playwright/test';

async function openForm(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Pushti kayfiyatni savatga qo‘shish' }).click();
  await page.getByRole('button', { name: 'Savatni ochish', exact: true }).click();
  await page.getByRole('button', { name: 'Buyurtma berish', exact: true }).click();
}
const phone = (page: Page) => page.getByRole('textbox', { name: 'Telefoningiz', exact: true });

test('a phone number is understood in any pasted form and shown as people read it', async ({ page }) => {
  await openForm(page);
  for (const pasted of ['901234567', '90 123 45 67', '+998901234567', '+998 (90) 123-45-67', '8 90 123 45 67', '0901234567']) {
    await phone(page).fill(pasted);
    await expect(phone(page), pasted).toHaveValue('90 123 45 67');
  }
  await expect(page.locator('.phone-prefix').first()).toHaveText('+998');
  await expect(page.locator('.phone-ok').first()).toBeVisible();
  await phone(page).fill('90 12');
  await expect(page.locator('.phone-ok')).toHaveCount(0);
});

test('the stored phone is +998 and nine digits, whatever was typed', async ({ page }) => {
  await openForm(page);
  await page.getByRole('textbox', { name: 'Ismingiz', exact: true }).fill('Dilnoza Karimova');
  await phone(page).fill('90 123 45 67');
  await page.getByRole('textbox', { name: 'Qabul qiluvchi', exact: true }).fill('Madina opa');
  await page.getByRole('textbox', { name: 'Qabul qiluvchi telefoni', exact: true }).fill('+998 91 765 43 21');
  await page.getByRole('textbox', { name: 'Urganchdagi yetkazish manzili' }).fill('Urganch, Al-Xorazmiy 12, 3-xonadon');
  await page.getByRole('radiogroup', { name: 'Sana' }).getByRole('radio').nth(2).click();
  await page.getByRole('radiogroup', { name: /Vaqt oralig/ }).locator('[role=radio]:not([disabled])').last().click();
  // only the request is inspected: no real order is created, so the demo stock other tests rely on stays untouched
  await page.route('**/api/orders', route => route.abort());
  const sent = page.waitForRequest(r => r.url().endsWith('/api/orders') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Demo buyurtmani saqlash' }).click();
  const body = (await sent).postDataJSON();
  expect(body.customer.phone).toBe('+998901234567');
  expect(body.customer.recipientPhone).toBe('+998917654321');
});

test('a mistake is explained under the field as soon as the buyer leaves it, and goes away when fixed', async ({ page }) => {
  await openForm(page);
  await phone(page).pressSequentially('9012');
  await expect(page.locator('.field-error')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Ismingiz', exact: true }).click();
  const problem = page.locator('.field-error').filter({ hasText: '9 ta raqam' });
  await expect(problem).toBeVisible();
  await expect(problem).toContainText('90 123 45 67');
  await expect(phone(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(phone(page)).toHaveAccessibleDescription(/9 ta raqam/);
  await phone(page).fill('90 123 45 67');
  await expect(page.locator('.field-error')).toHaveCount(0);
  await expect(phone(page)).toHaveAttribute('aria-invalid', 'false');
});

test('sending an empty form puts the cursor on the first field that needs attention', async ({ page }) => {
  await openForm(page);
  await page.getByRole('button', { name: 'Demo buyurtmani saqlash' }).click();
  await expect(page.getByRole('alert')).toContainText('Belgilangan maydonlarni tekshiring');
  await expect(page.getByRole('textbox', { name: 'Ismingiz', exact: true })).toBeFocused();
  await expect(page.locator('.field-error').first()).toContainText('Ismingizni yozing');
  expect(await page.locator('.field-error').count()).toBeGreaterThanOrEqual(4);
});

test('inputs are comfortable on a phone: 16 px text, tall targets, a multi-line address', async ({ page }) => {
  await openForm(page);
  const address = page.getByRole('textbox', { name: 'Urganchdagi yetkazish manzili' });
  expect(await address.evaluate(e => e.tagName)).toBe('TEXTAREA');
  for (const box of [page.getByRole('textbox', { name: 'Ismingiz', exact: true }), phone(page), address]) {
    const size = await box.evaluate(e => ({ font: getComputedStyle(e).fontSize, height: e.getBoundingClientRect().height }));
    expect(size.font).toBe('16px');
    expect(size.height).toBeGreaterThanOrEqual(48);
  }
  await expect(page.getByRole('textbox', { name: 'Ismingiz', exact: true })).toHaveAttribute('autocomplete', 'name');
  await expect(phone(page)).toHaveAttribute('autocomplete', 'tel-national');
  await expect(address).toHaveAttribute('autocomplete', 'street-address');
});
