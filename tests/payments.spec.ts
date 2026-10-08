import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const CARD = { number: '8600 1234 5678 9012', holder: 'Madina Karimova', bank: 'Uzum Bank' };
const phone = { width: 390, height: 844 };

const setPayment = (request: APIRequestContext, body: object) => request.put('/api/merchant/lola/payment', { data: body });
// the demo server keeps its data for the whole run, so every test puts Lola back the way it found her
const reset = (request: APIRequestContext) => setPayment(request, { acceptsCard: false, delivery: 'own' });

// the demo shop panel opens without a password: pick the shop and press the button
async function openPanel(page: Page) {
  await page.goto('/merchant?shop=lola');
  await page.getByRole('button', { name: 'Panelni ochish' }).click();
  await expect(page.locator('.merchant-stats')).toBeVisible();
}
async function openCheckout(page: Page) {
  await page.setViewportSize(phone);
  await page.goto('/');
  await page.getByRole('button', { name: 'Pushti kayfiyatni savatga qo‘shish' }).click();
  await page.getByRole('button', { name: 'Savatni ochish', exact: true }).click();
  await page.getByRole('button', { name: 'Buyurtma berish', exact: true }).click();
}
async function fillForm(page: Page) {
  await page.getByRole('textbox', { name: 'Ismingiz', exact: true }).fill('Dilnoza');
  await page.getByRole('textbox', { name: 'Telefoningiz', exact: true }).fill('+998901112233');
  await page.getByRole('textbox', { name: 'Qabul qiluvchi', exact: true }).fill('Madina opa');
  await page.getByRole('textbox', { name: 'Qabul qiluvchi telefoni', exact: true }).fill('+998901112244');
  await page.getByRole('textbox', { name: 'Urganchdagi yetkazish manzili' }).fill('Urganch, Al-Xorazmiy ko‘chasi 12');
  await page.getByRole('radiogroup', { name: 'Sana' }).getByRole('radio').nth(2).click();
  await page.getByRole('radiogroup', { name: /Vaqt oralig/ }).locator('[role=radio]:not([disabled])').last().click();
}

test('card transfer: the card appears after the shop accepts, "I paid", the shop confirms, then delivery unlocks', async ({ page, request }) => {
  expect((await setPayment(request, { acceptsCard: true, delivery: 'own', card: CARD })).status()).toBe(200);
  try {
    await openCheckout(page);
    await fillForm(page);
    await page.getByRole('radio', { name: /Kartaga o‘tkazma/ }).click();
    // other tests edit this bouquet's price, so read it instead of assuming it
    const price = (await (await request.get('/api/catalog')).json()).products.find((p: { id: string }) => p.id === 'p1').price as number;
    await expect(page.locator('.pay-explain')).toContainText(new RegExp(`${Math.floor(price / 1000)}[\\s,]000`));
    await expect(page.locator('.order-summary .split').first()).toContainText('Kartaga (gullar)');
    await expect(page.locator('.order-summary .split').nth(1)).toContainText('Taksiga naqd');

    const sent = page.waitForResponse(r => r.url().endsWith('/api/orders') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Demo buyurtmani saqlash' }).click();
    const response = await sent;
    expect(response.request().postDataJSON().payment).toEqual({ method: 'card' });
    const order = await response.json();
    expect(order.payment).toEqual({ method: 'card', status: 'unpaid' });
    await page.getByRole('button', { name: 'Buyurtmani ko‘rish' }).click();
    await expect(page.locator('.pay-block')).toContainText('Kartaga o‘tkazma bilan to‘lanadi');
    await expect(page.locator('.pay-number')).toHaveCount(0);

    expect((await request.patch(`/api/merchant/lola/orders/${order.id}`, { data: { status: 'accepted' } })).status()).toBe(200);
    await page.getByRole('button', { name: 'Yangilash', exact: true }).click();
    await expect(page.locator('.pay-number')).toHaveText('8600 1234 5678 9012');
    await expect(page.locator('.pay-card')).toBeVisible();
    await expect(page.locator('.pay-meta')).toContainText('Madina Karimova');
    await expect(page.locator('.pay-cash')).toContainText('naqd');
    await page.getByLabel(/Qaysi kartadan/).fill('4521');
    await page.getByRole('button', { name: 'To‘ladim', exact: true }).click();
    await expect(page.locator('.pay-block')).toContainText('Do‘kon to‘lovni tekshirmoqda');

    // the shop's panel: delivery is locked until the money is confirmed
    await openPanel(page);
    const card = page.locator('.order-card', { hasText: `#${order.id.slice(0, 8)}` });
    await expect(card).toContainText('«To‘ladim» dedi');
    await expect(card).toContainText('karta 4521');
    await expect(card.getByRole('button', { name: 'Yo‘lda', exact: true })).toBeDisabled();
    await card.getByRole('button', { name: 'Pul tushdi' }).click();
    await expect(card).toContainText('To‘lov tasdiqlandi');
    await expect(card.getByRole('button', { name: 'Yo‘lda', exact: true })).toBeEnabled();
    await card.getByRole('button', { name: 'Yo‘lda', exact: true }).click();
    await expect(card.locator('.status')).toContainText('Yo‘lda');

    await page.goto('/?orders=1');
    await expect(page.locator('.order-card').first().locator('.pay-block')).toContainText('To‘lov tasdiqlandi');
  } finally { await reset(request); }
});

test('the shop rejects the transfer: the buyer is asked again with the shop phone at hand', async ({ page, request }) => {
  expect((await setPayment(request, { acceptsCard: true, delivery: 'own', card: CARD })).status()).toBe(200);
  try {
    await openCheckout(page);
    await fillForm(page);
    await page.getByRole('radio', { name: /Kartaga o‘tkazma/ }).click();
    const sent = page.waitForResponse(r => r.url().endsWith('/api/orders') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Demo buyurtmani saqlash' }).click();
    const order = await (await sent).json();
    await page.getByRole('button', { name: 'Buyurtmani ko‘rish' }).click();
    await request.patch(`/api/merchant/lola/orders/${order.id}`, { data: { status: 'accepted' } });
    await page.getByRole('button', { name: 'Yangilash', exact: true }).click();
    await page.getByRole('button', { name: 'To‘ladim', exact: true }).click();
    await expect(page.locator('.pay-block')).toContainText('tekshirmoqda');
    expect((await request.post(`/api/merchant/lola/orders/${order.id}/payment`, { data: { action: 'reject' } })).status()).toBe(200);
    await page.getByRole('button', { name: 'Yangilash', exact: true }).click();
    await expect(page.locator('.pay-warn')).toContainText('to‘lovni ko‘rmadi');
    await expect(page.getByRole('button', { name: 'To‘ladim', exact: true })).toBeVisible();
  } finally { await reset(request); }
});

test('taxi shop: cash is not offered for delivery, only the ride is cash; picking up allows cash again', async ({ page, request }) => {
  expect((await setPayment(request, { acceptsCard: true, delivery: 'taxi', card: CARD })).status()).toBe(200);
  try {
    await openCheckout(page);
    await expect(page.getByRole('radio', { name: /Naqd/ })).toBeDisabled();
    await expect(page.getByRole('radio', { name: /Kartaga o‘tkazma/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Bu do‘kon taksi bilan yetkazadi')).toBeVisible();
    await page.getByRole('radio', { name: /Do‘kondan olib ketish/ }).click();
    await expect(page.getByRole('radio', { name: /Naqd/ })).toBeEnabled();
  } finally { await reset(request); }
});

test('shop settings: the card is checked, saved privately and the shop starts taking card orders', async ({ page, request }) => {
  try {
    await page.setViewportSize(phone);
    await openPanel(page);
    await page.getByRole('button', { name: 'Do‘kon sozlamalari' }).click();
    const form = page.locator('.merchant-pay');
    await expect(form.getByRole('heading', { name: 'To‘lov va yetkazish usuli' })).toBeVisible();
    await form.getByRole('checkbox', { name: /Kartaga o‘tkazmani qabul qilaman/ }).check();
    await form.getByLabel('Karta raqami').fill('8600123456789013');
    await form.getByLabel('Karta egasi').fill('Madina Karimova');
    await form.getByRole('button', { name: 'To‘lov sozlamalarini saqlash' }).click();
    await expect(form.getByRole('alert')).toContainText('Karta raqami');
    await form.getByLabel('Karta raqami').fill('8600123456789012');
    await form.getByRole('button', { name: 'To‘lov sozlamalarini saqlash' }).click();
    await expect(form.getByRole('status')).toContainText('saqlandi');
    const catalog = JSON.stringify(await (await request.get('/api/catalog')).json());
    expect(catalog).toContain('"acceptsCard":true');
    expect(catalog).not.toContain('8600123456789012');
    expect(catalog).not.toContain('Madina Karimova');
  } finally { await reset(request); }
});
