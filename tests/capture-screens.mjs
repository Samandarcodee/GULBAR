// Not part of the test suite: takes phone-sized screenshots of the live site for a design review.
//   node tests/capture-screens.mjs <outDir> [url]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.argv[2];
const url = process.argv[3] || 'https://gulbar.bella-rose.workers.dev/';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'uz-UZ' });
const page = await context.newPage();
const shot = async name => { await page.waitForTimeout(900); await page.screenshot({ path: `${out}/${name}.png` }); console.log('saved', name); };
const safe = async (name, fn) => { try { await fn(); await shot(name); } catch (e) { console.log('skip', name, String(e.message).split('\n')[0]); } };

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('.gm-item');
await shot('01-home-top');
await page.evaluate(() => window.scrollTo(0, 560)); await shot('02-home-grid');
await page.evaluate(() => window.scrollTo(0, 0));
await safe('03-product-sheet', async () => { await page.locator('.gm-photo-btn').first().click(); await page.waitForSelector('.sheet'); });
await safe('04-product-sheet-bottom', async () => { await page.locator('.dialog').first().evaluate(d => d.scrollTo(0, 99999)); });
await page.keyboard.press('Escape'); await page.waitForTimeout(500);
await safe('05-shop-page', async () => { await page.locator('.gm-shop-link').first().click(); await page.waitForSelector('.shop-hero, .shop-page, h1'); });
await page.goto(url, { waitUntil: 'networkidle' });
await safe('06-cart-checkout-step1', async () => {
  await page.locator('.gm-add').first().click();
  await page.getByRole('button', { name: 'Savatni ochish', exact: true }).first().click();
});
await safe('07-checkout-form-top', async () => { await page.getByRole('button', { name: 'Buyurtma berish', exact: true }).click(); });
await safe('08-checkout-form-mid', async () => { await page.locator('.dialog').first().evaluate(d => d.scrollTo(0, 700)); });
await safe('09-checkout-form-bottom', async () => { await page.locator('.dialog').first().evaluate(d => d.scrollTo(0, 99999)); });
await page.goto(url, { waitUntil: 'networkidle' });
await safe('10-orders-empty', async () => { await page.locator('.mobile-nav').getByRole('button', { name: 'Buyurtmalar' }).click(); });
await safe('11-profile', async () => { await page.locator('.mobile-nav').getByRole('button', { name: 'Profil' }).click(); });
await safe('12-shops-tab', async () => { await page.locator('.mobile-nav').getByRole('button', { name: 'Do‘konlar' }).click(); });
await context.close();

const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const d = await desktop.newPage();
await d.goto(url, { waitUntil: 'networkidle' });
await d.waitForSelector('.gm-item');
await d.waitForTimeout(1200);
await d.screenshot({ path: `${out}/13-desktop-home.png` }); console.log('saved 13-desktop-home');
await browser.close();
