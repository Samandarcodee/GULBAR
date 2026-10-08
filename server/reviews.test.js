import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from './app.js';
import { reviewerName, decorateShops } from './reviews.js';
const buyer = 'review-buyer-1234567890';
const other = 'review-other-1234567890';
const customer = { name: 'Dilnoza Karimova', phone: '+998901234567', recipient: 'Madina', recipientPhone: '+998901234568', address: 'Urganch, test ko‘chasi 12', deliveryTime: 'soon', note: '', anonymous: false };
async function setup(t) {
  const { app, db } = createApp({ demo: true });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.close(); db.close(); });
  const request = async (path, { method = 'GET', body, user = buyer } = {}) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Demo-User': user }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, data: await res.json() };
  };
  return { request, db };
}
const place = request => request('/orders', { method: 'POST', body: { requestKey: randomUUID(), shopId: 'lola', items: [{ productId: 'p1', quantity: 1 }], customer } });
const deliver = async (request, id) => { for (const status of ['accepted', 'delivering', 'delivered']) assert.equal((await request(`/merchant/lola/orders/${id}`, { method: 'PATCH', body: { status } })).status, 200); };

test('only the buyer of a delivered order can review it, once, and only the first name is public', async t => {
  const { request } = await setup(t);
  const order = (await place(request)).data;
  assert.equal((await request(`/orders/${order.id}/review`, { method: 'POST', body: { rating: 5 } })).status, 409, 'not delivered yet');
  await deliver(request, order.id);
  assert.equal((await request(`/orders/${order.id}/review`, { method: 'POST', body: { rating: 5 }, user: other })).status, 404, 'someone else');
  assert.equal((await request(`/orders/${order.id}/review`, { method: 'POST', body: { rating: 6 } })).status, 400);
  assert.equal((await request(`/orders/${order.id}/review`, { method: 'POST', body: { rating: 0 } })).status, 400);
  assert.equal((await request(`/orders/${order.id}/review`, { method: 'POST', body: { rating: 5, comment: 'x'.repeat(501) } })).status, 400);
  assert.equal((await request(`/orders/${order.id}/review`, { method: 'POST', body: { rating: 5, comment: '  Juda chiroyli guldasta!  ' } })).status, 201);
  assert.equal((await request(`/orders/${order.id}/review`, { method: 'POST', body: { rating: 1 } })).status, 409, 'second review is refused');
  const reviews = (await request('/shops/lola/reviews', { user: other })).data;
  assert.equal(reviews.count, 1); assert.equal(reviews.avg, 5);
  assert.deepEqual({ name: reviews.items[0].name, comment: reviews.items[0].comment }, { name: 'Dilnoza', comment: 'Juda chiroyli guldasta!' });
  assert.ok(!JSON.stringify(reviews).includes('Karimova') && !JSON.stringify(reviews).includes('998'));
  assert.equal((await request('/orders')).data[0].reviewed, true);
  assert.equal((await request('/orders', { user: other })).data.length, 0);
});

test('catalog carries each shop rating and business phone but never a Telegram ID', async t => {
  const { request, db } = await setup(t);
  assert.equal((await request('/catalog')).data.shops.find(s => s.id === 'lola').rating, undefined);
  db.prepare('INSERT INTO shop_private VALUES (?,?,?)').run('lola', '+998901112233', '987654321');
  const order = (await place(request)).data;
  await deliver(request, order.id);
  await request(`/orders/${order.id}/review`, { method: 'POST', body: { rating: 4 } });
  const shop = (await request('/catalog')).data.shops.find(s => s.id === 'lola');
  assert.deepEqual(shop.rating, { avg: 4, count: 1 });
  assert.equal(shop.phone, '+998901112233');
  assert.ok(!JSON.stringify(shop).includes('987654321'));
});

test('review helpers: first name only, safe fallback, decorate keeps shops without data untouched', () => {
  assert.equal(reviewerName('  Anvar   Aliyev '), 'Anvar');
  assert.equal(reviewerName('<b>Bob</b>'), 'bBob/b'); // angle brackets are stripped so a name can never become markup
  assert.equal(reviewerName(''), 'Xaridor');
  assert.equal(reviewerName('A'.repeat(50)).length, 20);
  const shops = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(decorateShops(shops, [{ shop_id: 'a', avg: 4.5, n: 2 }], [{ shop_id: 'b', phone: '+998900000000' }]), [{ id: 'a', rating: { avg: 4.5, count: 2 } }, { id: 'b', phone: '+998900000000' }]);
});
