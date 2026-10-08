import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from './app.js';
import { addDays, tashkentDate } from './delivery.js';
const adminKey = 'test-owner-bootstrap-key-123456';
const customer = { name: 'Dilnoza Karimova', phone: '+998901234567', recipient: 'Madina', recipientPhone: '+998901234568', address: 'Urganch, Navoiy ko‘chasi 5', deliveryTime: 'soon', note: '', anonymous: false };
async function setup(t) {
  const { app, db } = createApp({ demo: true, adminToken: adminKey });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.close(); db.close(); });
  const request = async (path, { method = 'GET', body, user = 'v2-buyer-1234567890-aa', token } = {}) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Demo-User': user, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, data: await res.json() };
  };
  return { request, db };
}
const tomorrow = addDays(tashkentDate(), 1);
const place = (request, extra = {}, cust = {}) => request('/orders', { method: 'POST', body: { requestKey: randomUUID(), shopId: 'lola', items: [{ productId: 'p1', quantity: 1 }], customer: { ...customer, ...cust }, ...extra } });
const slot = (extra = {}) => ({ delivery: { method: 'delivery', when: 'slot', date: tomorrow, from: '12:00', to: '14:00', ...extra } });

test('an exact delivery window, a map point and a greeting card are saved on the order', async t => {
  const { request } = await setup(t);
  const res = await place(request, slot({ point: { lat: 41.550123456, lng: 60.631987654 } }), { note: 'Tug‘ilgan kuningiz bilan!', cardStyle: 'rose', cardFrom: 'Dilnoza' });
  assert.equal(res.status, 201);
  assert.deepEqual(res.data.delivery, { method: 'delivery', when: 'slot', date: tomorrow, from: '12:00', to: '14:00', point: { lat: 41.55012, lng: 60.63199 } });
  assert.equal(res.data.customer.deliveryTime, 'tomorrow');
  assert.equal(res.data.customer.cardStyle, 'rose');
  assert.equal(res.data.customer.cardFrom, 'Dilnoza');
  assert.equal(res.data.deliveryFee, 20000);
  assert.equal(res.data.total, 300000);
});

test('bad windows, far-away map points and unknown card styles are refused', async t => {
  const { request } = await setup(t);
  assert.equal((await place(request, slot({ date: addDays(tomorrow, -3) }))).status, 409);
  assert.equal((await place(request, slot({ date: addDays(tomorrow, 30) }))).status, 409);
  assert.equal((await place(request, slot({ from: '12:00', to: '12:10' }))).status, 409);
  assert.equal((await place(request, slot({ point: { lat: 55.7, lng: 37.6 } }))).status, 400, 'a point outside Urganch');
  assert.equal((await place(request, {}, { cardStyle: 'neon' })).status, 400);
  assert.equal((await place(request, { delivery: { method: 'delivery', when: 'slot' } })).status, 409);
});

test('pick-up has no delivery fee, uses the shop address and drops the map point', async t => {
  const { request } = await setup(t);
  const res = await place(request, slot({ method: 'pickup', point: { lat: 41.55, lng: 60.63 } }), { address: 'ignored' });
  assert.equal(res.status, 201);
  assert.equal(res.data.deliveryFee, 0);
  assert.equal(res.data.total, 280000);
  assert.equal(res.data.delivery.method, 'pickup');
  assert.equal(res.data.delivery.point, undefined);
  assert.match(res.data.customer.address, /^Olib ketish: Urganch markazi/);
});

test('a buyer cancels a pending order and the flowers come back; accepted orders cannot be cancelled by the buyer', async t => {
  const { request } = await setup(t);
  const stock = async () => (await request('/catalog')).data.products.find(p => p.id === 'p1').stock;
  const before = await stock();
  const order = (await place(request)).data;
  assert.equal(await stock(), before - 1);
  assert.equal((await request(`/orders/${order.id}/cancel`, { method: 'POST', user: 'someone-else-1234567890' })).status, 404);
  const cancelled = await request(`/orders/${order.id}/cancel`, { method: 'POST' });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.data.status, 'cancelled');
  assert.equal(cancelled.data.cancelledBy, 'customer');
  assert.equal(await stock(), before);
  assert.equal((await request(`/orders/${order.id}/cancel`, { method: 'POST' })).status, 200, 'repeating it changes nothing');
  assert.equal(await stock(), before, 'flowers are not returned twice');
  const second = (await place(request)).data;
  assert.equal((await request(`/merchant/lola/orders/${second.id}`, { method: 'PATCH', body: { status: 'accepted' } })).status, 200);
  const refused = await request(`/orders/${second.id}/cancel`, { method: 'POST' });
  assert.equal(refused.status, 409);
  assert.match(refused.data.error, /allaqachon qabul qilgan/);
});

test('support: buyers write tickets, see their own, limits apply and admin can answer', async t => {
  const { request } = await setup(t);
  const order = (await place(request)).data;
  assert.equal((await request('/support', { method: 'POST', body: { kind: 'complaint', message: 'ok' } })).status, 400, 'too short');
  assert.equal((await request('/support', { method: 'POST', body: { kind: 'rant', message: 'Juda uzoq kutdim' } })).status, 400);
  assert.equal((await request('/support', { method: 'POST', body: { kind: 'complaint', message: 'Guldasta kech keldi', orderId: randomUUID() } })).status, 404);
  assert.equal((await request('/support', { method: 'POST', body: { kind: 'complaint', message: 'Guldasta kech keldi', orderId: order.id }, user: 'someone-else-1234567890' })).status, 404, 'not their order');
  const created = await request('/support', { method: 'POST', body: { kind: 'complaint', message: 'Guldasta kech keldi', orderId: order.id } });
  assert.equal(created.status, 201);
  const mine = (await request('/support')).data;
  assert.equal(mine.length, 1);
  assert.deepEqual({ kind: mine[0].kind, status: mine[0].status, reply: mine[0].reply }, { kind: 'complaint', status: 'new', reply: '' });
  assert.equal((await request('/support', { user: 'someone-else-1234567890' })).data.length, 0);
  assert.equal((await request('/admin/support', { token: 'wrong-key' })).status, 401);
  const inbox = (await request('/admin/support', { token: adminKey })).data;
  assert.equal(inbox.length, 1);
  assert.match(inbox[0].contact, /Dilnoza Karimova, \+998901234567/);
  assert.equal(inbox[0].shopName, 'Lola Flowers');
  const answered = await request(`/admin/support/${created.data.id}`, { method: 'PATCH', token: adminKey, body: { reply: 'Uzr so‘raymiz, do‘kon bilan gaplashdik.' } });
  assert.equal(answered.status, 200);
  assert.equal(answered.data.status, 'done');
  assert.equal((await request('/support')).data[0].reply, 'Uzr so‘raymiz, do‘kon bilan gaplashdik.');
  assert.equal((await request(`/admin/support/${randomUUID()}`, { method: 'PATCH', token: adminKey, body: { status: 'done' } })).status, 404);
  for (let i = 0; i < 4; i++) assert.equal((await request('/support', { method: 'POST', body: { kind: 'question', message: `Savol raqami ${i}` } })).status, 201);
  assert.equal((await request('/support', { method: 'POST', body: { kind: 'question', message: 'Yana bitta savol' } })).status, 429, 'five a day is the limit');
});
