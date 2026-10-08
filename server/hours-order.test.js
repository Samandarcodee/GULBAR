import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from './app.js';
const customer = { name: 'Test', phone: '+998901234567', recipient: 'Test recipient', recipientPhone: '+998901234568', address: 'Urganch, test ko‘chasi 12', note: '', anonymous: false };
async function setup(t) {
  const { app, db } = createApp({ demo: true });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.close(); db.close(); });
  const request = async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Demo-User': 'hours-buyer-1234567890' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, data: await res.json() };
  };
  return request;
}
const order = (request, deliveryTime) => request('/orders', { method: 'POST', body: { requestKey: randomUUID(), shopId: 'lola', items: [{ productId: 'p1', quantity: 1 }], customer: { ...customer, deliveryTime } } });
// Tashkent is UTC+5: build "HH:MM" strings relative to the current Tashkent minute so the test never depends on the clock.
const tashkent = offsetMin => { const d = new Date(Date.now() + 5 * 3600000 + offsetMin * 60000); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const setHours = (request, hours) => request('/merchant/lola/settings', { method: 'PATCH', body: { name: 'Lola Flowers', subtitle: 'Nafis guldastalar va mehr', address: 'Urganch', deliveryFee: 20000, deliveryTime: '60–90 daqiqa', active: true, hours } });

test('a closed shop refuses same-day orders, accepts next-day ones and its answer clock starts at opening', async t => {
  const request = await setup(t);
  assert.equal((await setHours(request, { open: tashkent(120), close: tashkent(180) })).status, 200);
  const refused = await order(request, 'soon');
  assert.equal(refused.status, 409);
  assert.match(refused.data.error, /yopiq/);
  assert.equal((await order(request, 'today-evening')).status, 409);
  const next = await order(request, 'tomorrow');
  assert.equal(next.status, 201);
  assert.equal(next.data.afterHours, true);
  assert.ok(new Date(next.data.respondFrom).getTime() > Date.now() + 100 * 60000, 'the clock starts about two hours from now, when the shop opens');
});

test('an open shop, a shop without hours and cleared hours all take same-day orders', async t => {
  const request = await setup(t);
  assert.equal((await order(request, 'soon')).status, 201); // no hours at all
  assert.equal((await setHours(request, { open: tashkent(-60), close: tashkent(60) })).status, 200);
  const live = await order(request, 'soon');
  assert.equal(live.status, 201);
  assert.equal(live.data.afterHours, false);
  assert.ok(Math.abs(new Date(live.data.respondFrom).getTime() - new Date(live.data.createdAt).getTime()) < 1000);
  assert.equal((await setHours(request, { open: tashkent(120), close: tashkent(180) })).status, 200);
  assert.equal((await order(request, 'soon')).status, 409);
  assert.equal((await setHours(request, null)).status, 200);
  assert.equal((await order(request, 'soon')).status, 201);
});

test('bad opening hours are rejected', async t => {
  const request = await setup(t);
  assert.equal((await setHours(request, { open: '9:00', close: '21:00' })).status, 400);
  assert.equal((await setHours(request, { open: '09:00', close: '09:00' })).status, 400);
  assert.equal((await setHours(request, { open: '25:00', close: '21:00' })).status, 400);
});
