// Not part of the test suite: screenshots of the order form states for a design review.
//   node tests/serve.js &   then   node tests/capture-forms.mjs <outDir>
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.argv[2];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
const shot = async name => { await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${name}.png` }); console.log('saved', name); };
await page.goto('http://127.0.0.1:3107/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Pushti kayfiyatni savatga qo‘shish' }).click();
await page.getByRole('button', { name: 'Savatni ochish', exact: true }).click();
await page.getByRole('button', { name: 'Buyurtma berish', exact: true }).click();
await page.locator('.dialog').first().evaluate(d => d.scrollTo(0, 150));
await shot('f1-empty');
await page.getByRole('textbox', { name: 'Telefoningiz', exact: true }).pressSequentially('9012');
await page.getByRole('textbox', { name: 'Ismingiz', exact: true }).click();
await page.locator('.dialog').first().evaluate(d => d.scrollTo(0, 150));
await shot('f2-blur-error');
await page.getByRole('button', { name: 'Demo buyurtmani saqlash' }).click();
await page.locator('.dialog').first().evaluate(d => d.scrollTo(0, 150));
await shot('f3-submit-errors');
await page.getByRole('textbox', { name: 'Ismingiz', exact: true }).fill('Dilnoza Karimova');
await page.getByRole('textbox', { name: 'Telefoningiz', exact: true }).fill('+998 90 123 45 67');
await page.getByRole('textbox', { name: 'Qabul qiluvchi', exact: true }).fill('Madina opa');
await page.getByRole('textbox', { name: 'Qabul qiluvchi telefoni', exact: true }).fill('917654321');
await page.getByRole('textbox', { name: 'Urganchdagi yetkazish manzili' }).fill('Urganch, Al-Xorazmiy ko‘chasi 12, 3-xonadon, Anor do‘koni yonida');
await page.locator('.dialog').first().evaluate(d => d.scrollTo(0, 150));
await shot('f4-filled');
await browser.close();
