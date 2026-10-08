import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from './app.js';

const adminKey = 'test-owner-bootstrap-key-123456';
const customer = { name: 'Dilnoza Karimova', phone: '+998901234567', recipient: 'Madina', recipientPhone: '+998901234568', address: 'Urganch, Navoiy ko‘chasi 5', deliveryTime: 'soon', note: '', anonymous: false };

async function setup(t) {
  const { app, db } = createApp({ demo: true, adminToken: adminKey });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.close(); db.close(); });
  const request = async (path, { method = 'GET', body, user = 'delete-buyer-1234567890', token } = {}) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Demo-User': user, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, data: await res.json() };
  };
  return { request, db };
}
const order = request => request('/orders', { method: 'POST', body: { requestKey: randomUUID(), shopId: 'lola', items: [{ productId: 'p1', quantity: 1 }], customer, delivery: { method: 'delivery', when: 'asap' } } });

test('a shop with unfinished orders cannot be deleted; once they are done the shop and what it owned disappear, history stays', async t => {
  const { request, db } = await setup(t);
  const placed = await order(request);
  assert.equal(placed.status, 201);

  assert.equal((await request('/admin/shops/lola', { method: 'DELETE' })).status, 401, 'only an admin may delete');
  const refused = await request('/admin/shops/lola', { method: 'DELETE', token: adminKey });
  assert.equal(refused.status, 409);
  assert.match(refused.data.error, /1 ta tugallanmagan buyurtma/);
  assert.ok(db.prepare('SELECT id FROM shops WHERE id=?').get('lola'), 'nothing was removed');
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM products WHERE shop_id='lola'").get().n > 0);

  assert.equal((await request(`/orders/${placed.data.id}/cancel`, { method: 'POST' })).status, 200);
  const done = await request('/admin/shops/lola', { method: 'DELETE', token: adminKey });
  assert.equal(done.status, 200, JSON.stringify(done.data));

  assert.equal(db.prepare('SELECT id FROM shops WHERE id=?').get('lola'), undefined);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM products WHERE shop_id='lola'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM shop_private WHERE shop_id='lola'").get().n, 0);
  assert.ok(db.prepare('SELECT id FROM orders WHERE id=?').get(placed.data.id), 'the buyer keeps the order history');
  const catalog = (await request('/catalog')).data;
  assert.ok(!catalog.shops.some(s => s.id === 'lola') && !catalog.products.some(p => p.shopId === 'lola'));
  assert.equal((await request('/admin/shops/lola', { method: 'DELETE', token: adminKey })).status, 404);
  assert.notEqual((await order(request)).status, 201, 'nobody can order from a deleted shop');
  assert.ok(catalog.shops.length > 0, 'other shops are untouched');
});

test('deleting a shop also removes its owner login and signs the owner out', async t => {
  const { request, db } = await setup(t);
  const shop = { id: 'gone-shop', name: 'Gone shop', subtitle: 'Test flowers', address: 'Urganch test address', deliveryFee: 25000, deliveryTime: '30–60 daqiqa', color: '#edf3ee', initials: 'GS', active: true };
  const onboarded = await request('/admin/onboard', { method: 'POST', token: adminKey, body: { shop, login: 'gone.florist', password: 'Temporary-Password-123', phone: '+998901234567', telegramChatId: '123456789' } });
  assert.equal(onboarded.status, 201, JSON.stringify(onboarded.data));
  const login = await request('/auth/login', { method: 'POST', body: { login: 'gone.florist', password: 'Temporary-Password-123' } });
  assert.equal(login.status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE shop_id='gone-shop'").get().n, 1);

  assert.equal((await request('/admin/shops/gone-shop', { method: 'DELETE', token: adminKey })).status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE shop_id='gone-shop'").get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0, 'the owner session is gone');
  assert.equal((await request('/auth/me', { token: login.data.token })).status, 401);
  assert.equal((await request('/auth/login', { method: 'POST', body: { login: 'gone.florist', password: 'Temporary-Password-123' } })).status, 401);
});
