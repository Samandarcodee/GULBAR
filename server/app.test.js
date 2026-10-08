import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createApp } from './app.js';
import { validateTelegram } from './auth.js';
const demoUser = 'test-user-1234567890';
const customer = { name: 'Test', phone: '+998901234567', recipient: 'Test recipient', recipientPhone: '+998901234568', address: 'Urganch, test ko‘chasi 12', deliveryTime: 'soon', note: '', anonymous: false };
async function setup(t, config = {}) {
  const { app, db } = createApp({ demo: true, ...config });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.close(); db.close(); });
  async function request(path, { method = 'GET', body, user = demoUser, token } = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Demo-User': user, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  }
  return { request, db };
}
const input = (items = [{ productId: 'p1', quantity: 1 }]) => ({ requestKey: randomUUID(), shopId: 'lola', items, customer });

test('order totals are server-authoritative; retries are idempotent; customers isolated', async t => {
  const { request } = await setup(t);
  const body = { ...input(), total: 1, price: 1 };
  const first = await request('/orders', { method: 'POST', body });
  assert.equal(first.status, 201); assert.equal(first.data.total, 300000); assert.equal(first.data.status, 'pending');
  const second = await request('/orders', { method: 'POST', body });
  assert.equal(second.data.id, first.data.id);
  assert.equal((await request('/catalog')).data.products.find(p => p.id === 'p1').stock, 7);
  assert.equal((await request('/orders')).data.length, 1);
  assert.equal((await request('/orders', { user: 'different-user-123456' })).data.length, 0);
});
test('mixed shops and aggregated over-stock quantities fail and roll back reservations', async t => {
  const { request } = await setup(t);
  const mixed = await request('/orders', { method: 'POST', body: input([{ productId: 'p1', quantity: 1 }, { productId: 'p2', quantity: 1 }]) });
  assert.equal(mixed.status, 400);
  assert.equal((await request('/catalog')).data.products.find(p => p.id === 'p1').stock, 8);
  const duplicates = await request('/orders', { method: 'POST', body: input([{ productId: 'p1', quantity: 5 }, { productId: 'p1', quantity: 5 }]) });
  assert.equal(duplicates.status, 400);
  assert.equal((await request('/catalog')).data.products.find(p => p.id === 'p1').stock, 8);
});
test('merchant ownership, valid state transitions, and cancellation restock exactly once', async t => {
  const { request } = await setup(t);
  const { data: order } = await request('/orders', { method: 'POST', body: input() });
  assert.equal((await request(`/merchant/bloom/orders/${order.id}`, { method: 'PATCH', body: { status: 'accepted' } })).status, 404);
  assert.equal((await request(`/merchant/lola/orders/${order.id}`, { method: 'PATCH', body: { status: 'delivered' } })).status, 400);
  assert.equal((await request(`/merchant/lola/orders/${order.id}`, { method: 'PATCH', body: { status: 'accepted' } })).data.status, 'accepted');
  await request(`/merchant/lola/orders/${order.id}`, { method: 'PATCH', body: { status: 'cancelled' } });
  await request(`/merchant/lola/orders/${order.id}`, { method: 'PATCH', body: { status: 'cancelled' } });
  assert.equal((await request('/catalog')).data.products.find(p => p.id === 'p1').stock, 8);
});
test('bad customer data is rejected; product prices and stock can be managed', async t => {
  const { request } = await setup(t);
  assert.equal((await request('/orders', { method: 'POST', body: { ...input(), customer: { ...customer, phone: '123' } } })).status, 400);
  const edit = await request('/merchant/lola/products/p1', { method: 'PATCH', body: { price: 310000, stock: 3 } });
  assert.equal(edit.status, 200);
  assert.equal((await request('/orders', { method: 'POST', body: input() })).data.total, 330000);
  assert.equal((await request('/merchant/lola/products/p1', { method: 'PATCH', body: { price: -1 } })).status, 400);
});
test('live mode rejects unsigned users and demo merchant bypass; does not seed sample shops', async t => {
  const { request } = await setup(t, { demo: false, botToken: 'fake-token-for-test', merchantTokens: { lola: 'merchant-test-secret' } });
  assert.equal((await request('/catalog')).data.shops.length, 0);
  assert.equal((await request('/orders')).status, 401);
  assert.equal((await request('/merchant/lola/orders')).status, 401);
  assert.equal((await request('/merchant/lola/orders', { token: 'wrong' })).status, 401);
  assert.equal((await request('/merchant/lola/orders', { token: 'merchant-test-secret' })).status, 200);
});
test('merchant workspace includes hidden products and closed shops; checkout respects availability', async t => {
  const { request } = await setup(t);
  const workspace = (await request('/merchant/lola/workspace')).data;
  assert.equal(workspace.shop.id, 'lola');
  assert.ok(workspace.products.every(p => p.shopId === 'lola'));
  await request('/merchant/lola/products/p1', { method: 'PATCH', body: { active: false } });
  assert.ok(!(await request('/catalog')).data.products.some(p => p.id === 'p1'));
  assert.equal((await request('/merchant/lola/workspace')).data.products.find(p => p.id === 'p1').active, false);
  assert.equal((await request('/orders', { method: 'POST', body: input() })).status, 400);
  const { shop } = workspace;
  const settings = { ...shop, active: false, deliveryFee: 45000, id: 'hijacked' };
  const closed = await request('/merchant/lola/settings', { method: 'PATCH', body: settings });
  assert.equal(closed.data.id, 'lola');
  assert.ok(!(await request('/catalog')).data.shops.some(s => s.id === 'lola'));
  assert.equal((await request('/merchant/lola/workspace')).data.shop.active, false);
  assert.equal((await request('/orders', { method: 'POST', body: input() })).status, 400);
  assert.equal((await request('/merchant/lola/settings', { method: 'PATCH', body: { ...settings, deliveryFee: -1 } })).status, 400);
  await request('/merchant/lola/settings', { method: 'PATCH', body: { ...settings, active: true } });
  await request('/merchant/lola/products/p1', { method: 'PATCH', body: { active: true } });
  const order = await request('/orders', { method: 'POST', body: input() });
  assert.equal(order.status, 201);
  assert.equal(order.data.deliveryFee, 45000);
  assert.equal((await request('/merchant/lola/products/p1', { method: 'PATCH', body: { expectedStock: 8, stock: 20 } })).status, 409);
  assert.equal((await request('/merchant/lola/workspace')).data.products.find(p => p.id === 'p1').stock, 7);
  assert.equal((await request('/merchant/bloom/products/p1', { method: 'PATCH', body: { active: false } })).status, 404);
});
test('Telegram signature validates genuine data, rejects tampering and expired auth', () => {
  const token = 'test:token';
  const now = Date.now();
  const sign = date => {
    const p = new URLSearchParams({ auth_date: String(date), user: JSON.stringify({ id: 12345, first_name: 'Test' }), query_id: 'test-query' });
    const check = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
    const key = createHmac('sha256', 'WebAppData').update(token).digest();
    p.set('hash', createHmac('sha256', key).update(check).digest('hex'));
    return p.toString();
  };
  const raw = sign(Math.floor(now / 1000));
  assert.equal(validateTelegram(raw, token, now).id, 'tg:12345');
  assert.throws(() => validateTelegram(raw.replace('test-query', 'forged-query'), token, now));
  assert.throws(() => validateTelegram(sign(Math.floor(now / 1000) - 2 * 24 * 3600), token, now));
  assert.throws(() => validateTelegram(`${raw}&user=123`, token, now));
});

test('bot webhook requires its secret even in demo, acknowledges unknown updates and rejects demo callbacks', async t => {
  const { app, db } = createApp({ demo: true, botToken: 'fake-token', webhookSecret: 'test-webhook-secret' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.close(); db.close(); });
  const url = `http://127.0.0.1:${server.address().port}/api/telegram/webhook`;
  const call = (body, secret) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(secret ? { 'X-Telegram-Bot-Api-Secret-Token': secret } : {}) }, body: JSON.stringify(body) });
  assert.equal((await call({}, undefined)).status, 401);
  assert.equal((await call({}, 'wrong-secret')).status, 401);
  assert.equal((await call({}, 'test-webhook-secret')).status, 200);
  assert.equal((await call({ callback_query: { data: 'order:any:accepted' } }, 'test-webhook-secret')).status, 403);
});
