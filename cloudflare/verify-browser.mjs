import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
const url = process.argv[2] || 'http://127.0.0.1:8787';
const token = JSON.parse(readFileSync(new URL('../.cloudflare-secrets.json', import.meta.url), 'utf8')).DEMO_MERCHANT_TOKEN;
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${url}/merchant?shop=lola`);
  assert.equal(await page.title(), 'GulBar — Urganch uchun gullar');
  await page.getByRole('button', { name: 'Kalit bilan kirish', exact: true }).click();
  await page.getByLabel('Do‘kon ID', { exact: true }).fill('lola');
  await page.getByLabel('Do‘kon kirish kaliti', { exact: true }).fill(token);
  await page.getByRole('button', { name: 'Panelni ochish', exact: true }).click();
  await page.locator('.merchant-stats').waitFor();
  await page.getByRole('button', { name: 'Gullar va narxlar', exact: true }).click();
  await page.locator('.merchant-products article').first().waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'test-results/gulbar-cloudflare-merchant.png', fullPage: true });
  await page.getByRole('button', { name: 'Do‘kon sozlamalari', exact: true }).click();
  await page.getByRole('button', { name: 'Sozlamalarni saqlash' }).waitFor();
  await page.getByRole('button', { name: 'Chiqish', exact: true }).click();
  assert.equal(await page.getByLabel('Do‘kon kirish kaliti', { exact: true }).inputValue(), '');
  assert.deepEqual(errors, []);
  console.log('Public browser checks passed: GulBar title, protected merchant login, products, settings, mobile layout and logout.');
} finally { await browser.close(); }
