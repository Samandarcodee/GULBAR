import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from './app.js';
import { MAX_IMAGE_BYTES } from './images.js';

test('gallery uploads require own shop access, persist bytes and reject executable/oversized files', async t => {
  const { app, db } = createApp({ demo: true, merchantTokens: { lola: 'photo-test-key' } });
  // Disable demo's unauthenticated merchant fallback for this shop.
  db.prepare('INSERT INTO accounts VALUES (?,?,?,?,?,?,?,?)').run('photo-account', 'photo-account', 'merchant', 'lola', 'unused', 1, 0, new Date().toISOString());
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const jpeg = readFileSync(new URL('../public/images/pink-bouquet.jpg', import.meta.url));
  const upload = (body, token, type = 'image/jpeg') => fetch(`${base}/api/merchant/lola/images`, { method: 'POST', headers: { 'Content-Type': type, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body });
  assert.equal((await upload(jpeg)).status, 401);
  assert.equal((await upload(jpeg, 'wrong-shop-key')).status, 401);
  assert.equal((await upload(Buffer.from('<svg onload="alert(1)"></svg>'), 'photo-test-key')).status, 400);
  assert.equal((await upload(Buffer.alloc(MAX_IMAGE_BYTES + 1), 'photo-test-key')).status, 413);
  const saved = await upload(jpeg, 'photo-test-key');
  assert.equal(saved.status, 201);
  const { url } = await saved.json();
  const image = await fetch(base + url);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/jpeg');
  assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), jpeg);
  const product = JSON.parse(db.prepare("SELECT data FROM products WHERE id='p1'").get().data);
  const updated = await fetch(`${base}/api/merchant/lola/products/p1`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer photo-test-key' }, body: JSON.stringify({ ...product, image: url }) });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).image, url);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM images').get().n, 1);
});
