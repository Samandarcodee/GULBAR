import { test, expect } from '@playwright/test';

test('default minimal grid: filters, shop select, add and favourite', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Urganch guldastalari' })).toBeVisible();
  await expect(page.locator('.gm-item')).toHaveCount(29);
  await page.getByRole('button', { name: 'Onamga', exact: true }).click();
  await expect(page.locator('.gm-item')).toHaveCount(15);
  await page.getByRole('button', { name: 'Hammasi', exact: true }).click();
  await expect(page.locator('.gm-item')).toHaveCount(29);
  await page.locator('.gm-shops').getByRole('button', { name: 'Rayhon', exact: true }).click();
  await expect(page.locator('.gm-item')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Rayhon', exact: true })).toBeVisible();
  await page.locator('.gm-shops').getByRole('button', { name: 'Hamma do‘konlar' }).click();
  await expect(page.locator('.gm-item')).toHaveCount(29);
  await page.locator('.gm-shops').getByRole('button', { name: 'Gold Flowers', exact: true }).click();
  await expect(page.locator('.gm-item')).toHaveCount(5);
  await page.getByRole('button', { name: 'Tozalash' }).click();
  await expect(page.locator('.gm-item')).toHaveCount(29);
  await page.getByRole('button', { name: 'Oq Bulutni savatga qo‘shish' }).click();
  await expect(page.locator('.bag-count')).toHaveText('1');
  await page.getByRole('button', { name: 'Oq Bulut: sevimlilar' }).click();
  await expect(page.getByRole('button', { name: 'Oq Bulut: sevimlilar' })).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/flowrs-desktop-minimal.png', fullPage: true });
});

test('hero quotes rotate and stay still for reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const quote = page.locator('.gm-quote p');
  await expect(quote).toContainText('so‘z topilmaganda');
  await expect(quote).not.toContainText('so‘z topilmaganda', { timeout: 9000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  const first = await page.locator('.gm-quote p').innerText();
  await page.waitForTimeout(6500);
  expect(await page.locator('.gm-quote p').innerText()).toBe(first);
});

test('minimal grid has no sideways scroll on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.gm-item')).toHaveCount(29);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/flowrs-mobile-minimal.png' });
});

test('wheel (?home=wheel): order, person filter, grid, shop filter and add to cart', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?home=wheel');
  await expect(page.getByRole('heading', { level: 1, name: 'Urganch guldastalari' })).toBeVisible();
  await expect(page.locator('.gw-count')).toHaveText('01 / 29');
  await expect(page.locator('.gw-name')).toHaveText('Oq Bulut');
  await expect(page.getByRole('img', { name: /3.?000.?000 so‘m/ })).toBeVisible();
  await page.getByRole('button', { name: 'Keyingi guldasta' }).click();
  await expect(page.locator('.gw-name')).toHaveText('Pushti Tuman');
  await page.getByRole('button', { name: 'Onamga', exact: true }).click();
  await expect(page.locator('.gw-count')).toHaveText('01 / 15');
  await page.getByRole('button', { name: 'Hammasi', exact: true }).click();
  await expect(page.locator('.gw-count')).toHaveText('01 / 29');
  await page.getByRole('button', { name: 'Hamma guldastalar ro‘yxati' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Quyoshli kun/ }).click();
  await expect(page.locator('.gw-name')).toHaveText('Quyoshli kun');
  await page.getByRole('button', { name: /ni savatga qo‘shish/ }).click();
  await expect(page.locator('.bag-count')).toHaveText('1');
  await page.getByRole('button', { name: /Rayhon/ }).click();
  await expect(page.locator('.gw-count')).toHaveText('01 / 02');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/flowrs-desktop.png' });
});

test('wheel swipes with the pointer and the arrow keys on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?home=wheel');
  await page.waitForTimeout(1800);
  const box = (await page.locator('.gw-stage').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.gw-count')).toHaveText('02 / 29');
  await page.locator('.gw-stage').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.gw-count')).toHaveText('03 / 29');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.gw-count')).toHaveText('02 / 29');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/flowrs-mobile-wheel.png' });
});

test('photo feed (?home=feed): tags, person filter, price index, search and shop filter', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?home=feed');
  await expect(page.getByRole('heading', { level: 1, name: 'Urganch guldastalari' })).toBeVisible();
  await expect(page.locator('.gf-card')).toHaveCount(29);
  await expect(page.locator('.gf-tag').first()).toContainText('3');
  await page.getByRole('button', { name: 'Onamga', exact: true }).click();
  await expect(page.locator('.gf-card')).toHaveCount(15);
  await page.getByRole('button', { name: 'Hammasi', exact: true }).click();
  await expect(page.locator('.gf-card')).toHaveCount(29);
  await page.locator('.gf-ix', { hasText: 'Kichik quvonch' }).click();
  await expect(page.locator('.gf-ix.on .gf-ix-name')).toHaveText('Kichik quvonch');
  await page.getByRole('button', { name: 'Gul yoki do‘kon qidirish' }).click();
  await page.getByRole('textbox', { name: 'Gul yoki do‘kon qidirish' }).fill('no-such-flower');
  await expect(page.getByRole('heading', { name: 'Mos guldasta topilmadi' })).toBeVisible();
  await page.getByRole('button', { name: 'Qidiruvni tozalash' }).click();
  await expect(page.locator('.gf-card')).toHaveCount(29);
  await page.getByRole('button', { name: /Rayhon/ }).click();
  await expect(page.locator('.gf-card')).toHaveCount(2);
});

test('mobile price list sheet (?home=feed) jumps to a bouquet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?home=feed');
  await page.getByRole('button', { name: 'Narxlar ro‘yxati' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Quyoshli kun/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#gf-p6')).toBeInViewport();
});

test('budget picker (?home=picker) stays available', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?home=picker');
  await expect(page.getByRole('heading', { level: 1, name: 'Kimga gul olasiz?' })).toBeVisible();
  await expect(page.locator('.gb-item')).toHaveCount(29);
  await page.getByRole('button', { name: /Lola Flowers/ }).click();
  await page.getByRole('button', { name: 'Rafiqamga', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Rafiqamga gul olasiz?' })).toBeVisible();
  await expect(page.locator('.gb-item')).toHaveCount(2);
  await page.getByRole('slider').fill('300000');
  await expect(page.locator('.gb-item')).toHaveCount(1);
  await page.getByRole('slider').fill('150000');
  await expect(page.getByRole('heading', { name: 'Bu byudjetga guldasta topilmadi' })).toBeVisible();
  await page.getByRole('button', { name: /Byudjetni .* oshirish/ }).click();
  await expect(page.locator('.gb-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'Tozalash' }).click();
  await expect(page.locator('.gb-item')).toHaveCount(29);
});

test('mobile single-shop checkout, focus behavior, order tracking and merchant acceptance', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/?home=feed');
  await expect(page.locator('.gf-card')).toHaveCount(29);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/flowrs-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Pushti kayfiyatni savatga qo‘shish' }).click();
  await page.getByRole('button', { name: 'Oq orzuni savatga qo‘shish' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Hozirgi savatni saqlash' }).click();
  await page.getByRole('button', { name: 'Savatni ochish', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Lola Flowers');
  await expect(page.locator('.total')).toContainText('300');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Savatni ochish' })).toBeFocused();
  await page.getByRole('button', { name: 'Savat, 1 ta gul' }).click();
  await page.getByRole('button', { name: 'Buyurtma berish', exact: true }).click();
  await page.getByRole('button', { name: 'Demo buyurtmani saqlash' }).click();
  await expect(page.getByRole('alert')).toContainText('Belgilangan maydonlarni tekshiring');
  await page.getByRole('textbox', { name: 'Ismingiz', exact: true }).fill('Test xaridor');
  await page.getByRole('textbox', { name: 'Telefoningiz', exact: true }).fill('+998901234567');
  await page.getByRole('textbox', { name: 'Qabul qiluvchi', exact: true }).fill('Test qabul qiluvchi');
  await page.getByRole('textbox', { name: 'Qabul qiluvchi telefoni', exact: true }).fill('+998901234568');
  await page.getByRole('textbox', { name: 'Urganchdagi yetkazish manzili' }).fill('Urganch, Test ko‘chasi 12');
  await page.getByRole('button', { name: 'Demo buyurtmani saqlash' }).click();
  await expect(page.getByRole('heading', { name: 'Demo buyurtma saqlandi' })).toBeVisible();
  await page.getByRole('button', { name: 'Buyurtmani ko‘rish' }).click();
  await expect(page.locator('.order-card')).toContainText('Tasdiq kutilmoqda');
  await page.getByRole('button', { name: 'Do‘kon paneli' }).click();
  await page.getByLabel('Do‘kon ID', { exact: true }).fill('lola');
  await page.getByRole('button', { name: 'Panelni ochish' }).click();
  await page.getByRole('button', { name: 'Qabul qilindi', exact: true }).click();
  await expect(page.locator('.order-card .status')).toContainText('Qabul qilindi');
  await page.getByRole('button', { name: 'Yo‘lda', exact: true }).click();
  await page.getByRole('button', { name: 'Yetkazildi', exact: true }).click();
  await expect(page.locator('.order-card .status')).toContainText('Yetkazildi');
  await page.getByRole('button', { name: 'Gullar va narxlar' }).click();
  await page.getByRole('button', { name: 'Tahrirlash', exact: true }).first().click();
  await page.getByRole('spinbutton', { name: 'Narxi (so‘m)' }).fill('290000');
  await page.getByRole('button', { name: 'Saqlash', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.merchant-products article').first()).toContainText('290');
  expect(errors).toEqual([]);
});

test('Telegram dark theme and safe area remain usable', async ({ page }) => {
  await page.addInitScript(() => {
    const noop = () => {};
    (window as any).Telegram = { WebApp: { initData: 'theme-preview', colorScheme: 'dark', ready: noop, expand: noop,
      isVersionAtLeast: () => true, setHeaderColor: noop, setBackgroundColor: noop,
      onEvent: noop, offEvent: noop, contentSafeAreaInset: { top: 24, bottom: 20 },
      BackButton: { show: noop, hide: noop, onClick: noop, offClick: noop } } };
  });
  // The external Telegram script must not replace this deterministic test stub.
  await page.route('https://telegram.org/js/**', route => route.abort());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?home=feed');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Pushti kayfiyat haqida' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: 'test-results/flowrs-dark-detail.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('favorites persist, reduced-motion layout and landscape do not overflow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/?home=feed');
  await page.getByRole('button', { name: 'Pushti kayfiyat: sevimlilar' }).click();
  await page.reload();
  await page.locator('.mobile-nav').getByRole('button', { name: 'Sevimlilar' }).click();
  await expect(page.locator('.product-card')).toHaveCount(1);
  await page.setViewportSize({ width: 812, height: 375 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('merchant can hide products, pause shop, log out and reopen the closed shop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/merchant?shop=lola');
  await page.getByRole('button', { name: 'Panelni ochish' }).click();
  await expect(page.locator('.merchant-stats')).toBeVisible();
  await page.getByRole('button', { name: 'Gullar va narxlar', exact: true }).click();
  await page.getByRole('button', { name: 'Tahrirlash', exact: true }).first().click();
  await page.getByRole('checkbox', { name: 'Katalogda ko‘rsatish' }).uncheck();
  await page.getByRole('button', { name: 'Saqlash', exact: true }).click();
  await expect(page.locator('.merchant-products article').first()).toContainText('Katalogdan yashirilgan');
  await page.getByRole('button', { name: 'Do‘kon sozlamalari', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Do‘kon ochiq, buyurtma qabul qilaman' }).uncheck();
  await page.getByRole('button', { name: 'Sozlamalarni saqlash' }).click();
  await expect(page.locator('.page-heading')).toContainText('Vaqtincha yopiq');
  await page.getByRole('button', { name: 'Chiqish', exact: true }).click();
  await expect(page.getByLabel('Do‘kon ID', { exact: true })).toHaveValue('lola');
  await page.getByRole('button', { name: 'Panelni ochish' }).click();
  await expect(page.locator('.page-heading')).toContainText('Vaqtincha yopiq');
  await page.getByRole('button', { name: 'Do‘kon sozlamalari', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Do‘kon ochiq, buyurtma qabul qilaman' }).check();
  await page.getByRole('spinbutton', { name: 'Yetkazish haqi (so‘m)' }).fill('25000');
  await page.getByRole('button', { name: 'Sozlamalarni saqlash' }).click();
  await expect(page.getByRole('status')).toContainText('Do‘kon sozlamalari saqlandi');
  await page.getByRole('button', { name: 'Gullar va narxlar', exact: true }).click();
  await page.getByRole('button', { name: 'Tahrirlash', exact: true }).first().click();
  await page.getByRole('checkbox', { name: 'Katalogda ko‘rsatish' }).check();
  await page.getByRole('button', { name: 'Saqlash', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/gulbar-merchant-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/gulbar-merchant-desktop.png', fullPage: true });
});

const buyerId = 'e2e-reviewer-1234567890';
const placeDelivered = async (request: any, productId: string, recipient: string) => {
  const headers = { 'X-Demo-User': buyerId };
  const order = await (await request.post('/api/orders', { headers, data: { requestKey: crypto.randomUUID(), shopId: 'lola', items: [{ productId, quantity: 1 }], customer: { name: 'Dilnoza Karimova', phone: '+998901112233', recipient, recipientPhone: '+998901112244', address: 'Urganch, Al-Xorazmiy 12', deliveryTime: 'soon', anonymous: false, note: '' } } })).json();
  for (const status of ['accepted', 'delivering', 'delivered']) expect((await request.patch(`/api/merchant/lola/orders/${order.id}`, { data: { status } })).status()).toBe(200);
  return order;
};

test('product sheet opens the shop page, which shows an empty review state', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Pushti kayfiyat haqida' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Guldastani ulashish' })).toBeVisible();
  await dialog.locator('.sheet-shop').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Lola Flowers' })).toBeVisible();
  await expect(page.getByText('Hali sharh yo‘q.')).toBeVisible();
  await expect(page.locator('.shop-page .gm-item')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a buyer reviews a delivered order once and the rating shows up on the shop page', async ({ page, request }) => {
  await placeDelivered(request, 'p1', 'Madina');
  await page.addInitScript(id => localStorage.setItem('flowrs-user', id), buyerId);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?orders=1');
  await page.getByRole('button', { name: 'Baho berish' }).click();
  await page.getByRole('button', { name: 'Baho yuborish' }).click();
  await expect(page.getByRole('alert')).toContainText('yulduzchalardan');
  await page.getByRole('radio', { name: /4 yulduz/ }).click();
  await page.getByLabel('Fikringiz (ixtiyoriy)').fill('Gullar yangi edi');
  await page.getByRole('button', { name: 'Baho yuborish' }).click();
  await expect(page.getByText('Baho qoldirildi')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Baho berish' })).toHaveCount(0);
  const reviews = await (await request.get('/api/shops/lola/reviews')).json();
  expect(reviews.count).toBe(1);
  expect(reviews.items[0]).toMatchObject({ name: 'Dilnoza', rating: 4, comment: 'Gullar yangi edi' });
  await page.getByRole('button', { name: 'Gullar', exact: true }).first().click().catch(() => {});
  await page.goto('/');
  await page.getByRole('button', { name: 'Pushti kayfiyat haqida' }).click();
  await expect(page.getByRole('dialog').locator('.sheet-shop')).toContainText('4.0');
});

test('checkout remembers the buyer and offers the previous address next time', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const order = async () => {
    await page.getByRole('button', { name: 'Pushti kayfiyatni savatga qo‘shish' }).click();
    await page.getByRole('button', { name: 'Savatni ochish', exact: true }).click();
    await page.getByRole('button', { name: 'Buyurtma berish', exact: true }).click();
  };
  await order();
  await expect(page.getByRole('group', { name: 'Oldingi manzillar' })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Ismingiz', exact: true }).fill('Dilnoza');
  await page.getByRole('textbox', { name: 'Telefoningiz', exact: true }).fill('+998901112233');
  await page.getByRole('textbox', { name: 'Qabul qiluvchi', exact: true }).fill('Madina opa');
  await page.getByRole('textbox', { name: 'Qabul qiluvchi telefoni', exact: true }).fill('+998901112244');
  await page.getByRole('textbox', { name: 'Urganchdagi yetkazish manzili' }).fill('Urganch, Al-Xorazmiy ko‘chasi 12');
  await page.getByRole('radio', { name: 'Atirgul kartasi' }).click();
  await page.getByRole('radiogroup', { name: 'Sana' }).getByRole('radio').nth(2).click();
  await page.getByRole('radiogroup', { name: /Vaqt oralig/ }).getByRole('radio').and(page.locator(':not([disabled])')).last().click();
  await expect(page.locator('.chosen-time')).toBeVisible();
  await page.getByRole('button', { name: 'Demo buyurtmani saqlash' }).click();
  await expect(page.getByRole('heading', { name: 'Demo buyurtma saqlandi' })).toBeVisible();
  await page.getByRole('button', { name: 'Buyurtmani ko‘rish' }).click();
  await page.locator('.mobile-nav').getByRole('button', { name: 'Gullar' }).click();
  await order();
  await expect(page.getByRole('textbox', { name: 'Ismingiz', exact: true })).toHaveValue('Dilnoza');
  await expect(page.getByRole('radio', { name: 'Atirgul kartasi' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: /Madina opa/ }).click();
  await expect(page.getByRole('textbox', { name: 'Urganchdagi yetkazish manzili' })).toHaveValue('Urganch, Al-Xorazmiy ko‘chasi 12');
  await page.getByLabel('Gullar o‘zim uchun').check();
  await expect(page.getByRole('textbox', { name: 'Qabul qiluvchi', exact: true })).toHaveCount(0);
});

test('a closed shop shows its state and only offers next-day delivery', async ({ page, request }) => {
  const tashkent = (offsetMin: number) => { const d = new Date(Date.now() + 5 * 3600000 + offsetMin * 60000); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
  const settings = (hours: unknown) => request.patch('/api/merchant/lola/settings', { data: { name: 'Lola Flowers', subtitle: 'Nafis guldastalar va mehr', address: 'Urganch markazi · namunaviy manzil', deliveryFee: 20000, deliveryTime: '60–90 daqiqa', active: true, hours } });
  expect((await settings({ open: tashkent(120), close: tashkent(180) })).status()).toBe(200);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByText('Hozir yopiq').first()).toBeVisible();
    await page.getByRole('button', { name: 'Pushti kayfiyatni savatga qo‘shish' }).click();
    await page.getByRole('button', { name: 'Savatni ochish', exact: true }).click();
    await page.getByRole('button', { name: 'Buyurtma berish', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'hozir yopiq' })).toBeVisible();
    await page.getByRole('radio', { name: 'Bugun' }).click();
    await expect(page.getByRole('radio', { name: /Imkon qadar tezroq/ })).toBeDisabled();
    await page.getByRole('radio', { name: 'Ertaga' }).click();
    await expect(page.getByRole('radio', { name: /Imkon qadar tezroq/ })).toHaveCount(0);
    await page.screenshot({ path: 'test-results/flowrs-closed-checkout.png' });
    // the server enforces the same rule even if a client ignores it
    const direct = await request.post('/api/orders', { headers: { 'X-Demo-User': 'closed-shop-check-12345' }, data: { requestKey: crypto.randomUUID(), shopId: 'lola', items: [{ productId: 'p1', quantity: 1 }], customer: { name: 'T', phone: '+998901234567', recipient: 'R', recipientPhone: '+998901234568', address: 'Urganch, test ko‘chasi 12', deliveryTime: 'soon', anonymous: false, note: '' } } });
    expect(direct.status()).toBe(409);
  } finally {
    expect((await settings(null)).status()).toBe(200);
  }
});
