import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
const base = 'https://gulbar.bella-rose.workers.dev';
const credentials = JSON.parse(readFileSync(new URL('../.gulbar-admin-login.json', import.meta.url), 'utf8'));
const secrets = JSON.parse(readFileSync(new URL('../.cloudflare-secrets.json', import.meta.url), 'utf8'));
const unauthorized = await fetch(`${base}/api/admin/workspace`);
assert.equal(unauthorized.status, 401);
const workspace = await fetch(`${base}/api/admin/workspace`, { headers: { Authorization: `Bearer ${secrets.ADMIN_TOKEN}` } });
assert.equal(workspace.status, 200);
assert.ok(Array.isArray(await workspace.json()));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/admin`);
  await page.getByRole('heading', { name: 'Admin paneli', exact: true }).waitFor();
  await page.getByLabel('Login', { exact: true }).fill(credentials.login);
  await page.getByLabel('Parol', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Kirish', exact: true }).click();
  await page.getByRole('heading', { name: 'O‘zingizga yangi parol qo‘ying', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'test-results/gulbar-public-admin-first-login.png', fullPage: true });
  // Preserve the owner's temporary password; they choose their own password at first login.
  await page.getByRole('button', { name: 'Kirishga qaytish', exact: true }).click();
  await page.getByRole('button', { name: 'Kirish', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Public admin verified: protected workspace, owner login, required password change and mobile layout. Owner password preserved.');
} finally { await browser.close(); }
