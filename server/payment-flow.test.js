import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from './app.js';

const CARD = { number: '8600 1234 5678 9012', holder: 'Madina Karimova', bank: 'Uzum Bank' };
const customer = { name: 'Dilnoza Karimova', phone: '+998901234567', recipient: 'Madina', recipientPhone: '+998901234568', address: 'Urganch, Navoiy ko‘chasi 5', deliveryTime: 'soon', note: '', anonymous: false };

async function setup(t) {
  const { app, db } = createApp({ demo: true, adminToken: 'test-owner-bootstrap-key-123456' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.close(); db.close(); });
  const request = async (path, { method = 'GET', body, user = 'payment-buyer-1234567890', token } = {}) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Demo-User': user, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, data: await res.json() };
  };
  const setPayment = (body, shop = 'lola') => request(`/merchant/${shop}/payment`, { method: 'PUT', body });
  const order = (payment, delivery = { method: 'delivery', when: 'asap' }, user) => request('/orders', { method: 'POST', user, body: { requestKey: randomUUID(), shopId: 'lola', items: [{ productId: 'p1', quantity: 1 }], customer, delivery, ...(payment ? { payment } : {}) } });
  const mine = async user => (await request('/orders', { user })).data;
  const status = (id, next) => request(`/merchant/lola/orders/${id}`, { method: 'PATCH', body: { status: next } });
  const decide = (id, action, shop = 'lola') => request(`/merchant/${shop}/orders/${id}/payment`, { method: 'POST', body: { action } });
  return { request, db, setPayment, order, mine, status, decide };
}

test('a shop saves its card privately: checked on entry, never in the public catalog', async t => {
  const { request, setPayment } = await setup(t);
  assert.equal((await setPayment({ acceptsCard: true, delivery: 'own' })).status, 400, 'accepting cards needs a card');
  assert.equal((await setPayment({ acceptsCard: true, delivery: 'own', card: { ...CARD, number: '8600 1234 5678 9013' } })).status, 400, 'a mistyped number is refused');
  assert.equal((await setPayment({ acceptsCard: false, delivery: 'taxi' })).status, 400, 'taxi delivery needs card payment');
  const saved = await setPayment({ acceptsCard: true, delivery: 'taxi', card: CARD });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.card.number, '8600123456789012');
  const own = await request('/merchant/lola/payment');
  assert.equal(own.data.card.holder, 'Madina Karimova');
  const catalog = (await request('/catalog')).data;
  const lola = catalog.shops.find(s => s.id === 'lola');
  assert.equal(lola.acceptsCard, true);
  assert.equal(lola.delivery, 'taxi');
  assert.ok(!JSON.stringify(catalog).includes('8600123456789012') && !JSON.stringify(catalog).includes('Madina Karimova'), 'the card never appears in the catalog');
  const keepCard = await setPayment({ acceptsCard: true, delivery: 'own' });
  assert.equal(keepCard.status, 200, 'the saved card is kept when only the options change');
  assert.equal(keepCard.data.card.number, '8600123456789012');
});

test('card order: the card appears after the shop accepts, delivery waits for the confirmed money', async t => {
  const { request, setPayment, order, mine, status, decide } = await setup(t);
  await setPayment({ acceptsCard: true, delivery: 'own', card: CARD });
  const placed = await order({ method: 'card' });
  assert.equal(placed.status, 201, JSON.stringify(placed.data));
  assert.deepEqual(placed.data.payment, { method: 'card', status: 'unpaid' });
  assert.equal(placed.data.total, 300000);
  assert.equal((await mine()).find(o => o.id === placed.data.id).payInfo, null, 'no card before the shop accepts');

  assert.equal((await status(placed.data.id, 'accepted')).status, 200);
  const waiting = (await mine()).find(o => o.id === placed.data.id);
  assert.deepEqual({ card: waiting.payInfo.card, holder: waiting.payInfo.holder, amount: waiting.payInfo.amount, cash: waiting.payInfo.cash, state: waiting.payInfo.state }, { card: '8600123456789012', holder: 'Madina Karimova', amount: 280000, cash: 20000, state: 'unpaid' });
  assert.ok(waiting.payInfo.dueAt > Date.now(), 'there is a deadline in the future');

  const early = await status(placed.data.id, 'delivering');
  assert.equal(early.status, 409);
  assert.match(early.data.error, /pul tushganini tasdiqlang/i);

  assert.equal((await request(`/orders/${placed.data.id}/payment`, { method: 'POST', user: 'someone-else-12345678901', body: {} })).status, 404, 'only the buyer can say "I paid"');
  const claimed = await request(`/orders/${placed.data.id}/payment`, { method: 'POST', body: { note: '4521' } });
  assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
  assert.equal(claimed.data.payment.status, 'claimed');
  assert.equal((await request(`/orders/${placed.data.id}/payment`, { method: 'POST', body: {} })).status, 409, 'the second tap is refused');

  assert.equal((await decide(placed.data.id, 'reject')).data.payment.status, 'unpaid');
  assert.equal((await mine()).find(o => o.id === placed.data.id).payInfo.state, 'unpaid', 'the buyer is asked again');
  assert.equal((await request(`/orders/${placed.data.id}/payment`, { method: 'POST', body: {} })).status, 200);
  const confirmed = await decide(placed.data.id, 'confirm');
  assert.equal(confirmed.data.payment.status, 'confirmed');
  assert.equal((await mine()).find(o => o.id === placed.data.id).payInfo, null);

  assert.equal((await status(placed.data.id, 'delivering')).status, 200);
  assert.equal((await status(placed.data.id, 'delivered')).status, 200);
});

test('a shop that does not take cards refuses card orders; taxi shops refuse cash delivery but allow cash pick-up', async t => {
  const { setPayment, order } = await setup(t);
  const noCard = await order({ method: 'card' });
  assert.equal(noCard.status, 409);
  assert.match(noCard.data.error, /kartaga o‘tkazma/);
  assert.equal((await order(undefined)).status, 201, 'cash is still the default');

  await setPayment({ acceptsCard: true, delivery: 'taxi', card: CARD });
  const cashTaxi = await order({ method: 'cash' });
  assert.equal(cashTaxi.status, 409);
  assert.match(cashTaxi.data.error, /taksi/i);
  assert.equal((await order(undefined)).status, 409, 'no choice means cash');
  assert.equal((await order({ method: 'card' })).status, 201);
  const pickup = await order({ method: 'cash' }, { method: 'pickup', when: 'asap' });
  assert.equal(pickup.status, 201, JSON.stringify(pickup.data));
  assert.equal(pickup.data.deliveryFee, 0);
});

test('a card order cancelled by the shop after the money arrived is flagged for a refund until the shop marks it returned', async t => {
  const { setPayment, order, mine, status, decide, request } = await setup(t);
  await setPayment({ acceptsCard: true, delivery: 'own', card: CARD });
  const placed = await order({ method: 'card' });
  await status(placed.data.id, 'accepted');
  await decide(placed.data.id, 'confirm');
  assert.equal((await status(placed.data.id, 'cancelled')).status, 200);
  assert.equal((await mine()).find(o => o.id === placed.data.id).refundDue, true);
  const shopView = (await request('/merchant/lola/orders')).data.find(o => o.id === placed.data.id);
  assert.equal(shopView.refundDue, true);
  assert.equal((await decide(placed.data.id, 'refunded')).status, 200);
  assert.equal((await mine()).find(o => o.id === placed.data.id).refundDue, false);
  assert.equal((await decide(placed.data.id, 'refunded')).status, 409, 'it can be returned only once');
});

test('payment decisions stay inside the shop that owns the order', async t => {
  const { order, status, request } = await setup(t);
  const placed = await order(undefined);
  await status(placed.data.id, 'accepted');
  const other = await request(`/merchant/bloom/orders/${placed.data.id}/payment`, { method: 'POST', body: { action: 'confirm' } });
  assert.equal(other.status, 404);
  const cash = await request(`/merchant/lola/orders/${placed.data.id}/payment`, { method: 'POST', body: { action: 'confirm' } });
  assert.equal(cash.status, 409, 'a cash order has no transfer to confirm');
});
