// Smoke test for the real Worker (Hono + D1) in demo mode. The Playwright and unit suites run the Node demo server,
// so this is the check that the production code path answers correctly.
//
//   1. one-off setup:  npx wrangler d1 migrations apply gulbar-live --local --persist-to .wrangler/smoke
//                      npx wrangler d1 execute gulbar-live --local --persist-to .wrangler/smoke --file=cloudflare/seed-demo.sql
//   2. start Worker:   npx wrangler dev --local --port 8799 --persist-to .wrangler/smoke --var DEMO_MODE:true
//   3. run:            npm run cf:smoke            (DEMO_MERCHANT_TOKEN is read from .dev.vars or the environment)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const url = process.argv[2] || 'http://127.0.0.1:8799';
function merchantToken() {
  if (process.env.DEMO_MERCHANT_TOKEN) return process.env.DEMO_MERCHANT_TOKEN;
  try { return (readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').match(/^DEMO_MERCHANT_TOKEN=(.*)$/m) || [])[1]?.replace(/^"|"$/g, '') || ''; } catch { return ''; }
}
const token = merchantToken();
const user = randomUUID();
async function call(path, method = 'GET', body, who = user, bearer) {
  const r = await fetch(`${url}/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Demo-User': who, ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, data: await r.json().catch(() => null) };
}

const day = new Date(Date.now() + 5 * 3600000 + 2 * 86400000).toISOString().slice(0, 10);
const catalog = (await call('/catalog')).data;
assert.equal(catalog.demo, true, 'run the Worker with --var DEMO_MODE:true');
const product = catalog.products.find(p => p.shopId === 'lola' && p.stock > 3);
assert.ok(product, 'the demo seed needs a Lola Flowers product with stock');
const stockOf = async () => (await call('/catalog')).data.products.find(p => p.id === product.id).stock;
const before = await stockOf();
const customer = (extra = {}) => ({ name: 'Test Xaridor', phone: '+998901234567', recipient: 'Qabul Qiluvchi', recipientPhone: '+998901234568', address: 'Urganch, test ko‘chasi 12', deliveryTime: 'tomorrow', anonymous: false, note: 'Tug‘ilgan kun muborak', cardStyle: 'gold', cardFrom: 'Test', ...extra });
const order = (delivery, who = user) => call('/orders', 'POST', { requestKey: randomUUID(), shopId: 'lola', items: [{ productId: product.id, quantity: 1 }], customer: customer(), ...(delivery ? { delivery } : {}) }, who);

// delivery with a window and a map point; the fee is the shop's
const a = await order({ method: 'delivery', when: 'slot', date: day, from: '10:00', to: '12:00', point: { lat: 41.55, lng: 60.63 } });
assert.equal(a.status, 201, JSON.stringify(a.data));
assert.equal(a.data.deliveryFee, 20000);
assert.deepEqual(a.data.delivery.point, { lat: 41.55, lng: 60.63 });
assert.equal(await stockOf(), before - 1);

// pickup: no fee, no point
const b = await order({ method: 'pickup', when: 'slot', date: day, from: '14:00', to: '16:00', point: { lat: 41.55, lng: 60.63 } });
assert.equal(b.status, 201, JSON.stringify(b.data));
assert.equal(b.data.deliveryFee, 0);
assert.equal(b.data.delivery.point, undefined);
assert.equal(b.data.total, product.price);

// bad windows and points are refused
assert.equal((await order({ method: 'delivery', when: 'slot', date: day, from: '10:00', to: '10:20' })).status, 409);
assert.equal((await order({ method: 'delivery', when: 'slot', date: day, from: '10:00', to: '12:00', point: { lat: 10, lng: 10 } })).status, 400);

// the buyer lists own orders; the shop lists its orders (this route once returned 500)
const mine = await call('/orders');
assert.equal(mine.status, 200);
assert.ok(mine.data.some(o => o.id === a.data.id) && mine.data.every(o => 'reviewed' in o));
if (token) {
  const shopOrders = await call('/merchant/lola/orders', 'GET', undefined, user, token);
  assert.equal(shopOrders.status, 200, 'shop order list must answer 200: ' + JSON.stringify(shopOrders.data));
  assert.ok(shopOrders.data.some(o => o.id === a.data.id));
} else console.log('skipped: shop order list (no DEMO_MERCHANT_TOKEN)');
assert.equal((await call('/merchant/lola/orders')).status, 401);

// buyer cancel: stranger gets 404, restock happens once, repeat is harmless, reason is recorded
assert.equal((await call(`/orders/${a.data.id}/cancel`, 'POST', undefined, randomUUID())).status, 404);
const cancelled = await call(`/orders/${a.data.id}/cancel`, 'POST');
assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data));
assert.equal(cancelled.data.status, 'cancelled');
assert.equal(cancelled.data.cancelReason, 'customer');
assert.equal(await stockOf(), before - 1 - 0, 'only the pickup order still holds stock');
assert.equal((await call(`/orders/${a.data.id}/cancel`, 'POST')).status, 200);
assert.equal(await stockOf(), before - 1, 'a second cancel must not restock again');

// a shop-side cancel records its own reason
if (token) {
  const byShop = await call(`/merchant/lola/orders/${b.data.id}`, 'PATCH', { status: 'cancelled' }, user, token);
  assert.equal(byShop.status, 200, JSON.stringify(byShop.data));
  assert.equal(byShop.data.cancelReason, 'shop');
  assert.equal(await stockOf(), before, 'the shop cancel gives the flowers back too');
}

// paying the shop by card transfer: private card, card shown only after accepting, delivery waits for confirmed money
if (token) {
  const CARD = { number: '8600 1234 5678 9012', holder: 'Madina Karimova', bank: 'Uzum Bank' };
  const shopCall = (path, method, body) => call(`/merchant/lola${path}`, method, body, user, token);
  const cardOrder = async () => { const r = await call('/orders', 'POST', { requestKey: randomUUID(), shopId: 'lola', items: [{ productId: product.id, quantity: 1 }], customer: customer(), delivery: { method: 'delivery', when: 'asap' }, payment: { method: 'card' } }); assert.equal(r.status, 201, JSON.stringify(r.data)); return r.data; };
  const view = async id => (await call('/orders')).data.find(o => o.id === id);

  assert.equal((await shopCall('/payment', 'PUT', { acceptsCard: true, delivery: 'own' })).status, 400, 'accepting cards needs a card');
  assert.equal((await shopCall('/payment', 'PUT', { acceptsCard: true, delivery: 'own', card: { ...CARD, number: '8600 1234 5678 9013' } })).status, 400, 'a mistyped number is refused');
  const saved = await shopCall('/payment', 'PUT', { acceptsCard: true, delivery: 'own', card: CARD });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const publicCatalog = JSON.stringify((await call('/catalog')).data);
  assert.ok(publicCatalog.includes('"acceptsCard":true') && !publicCatalog.includes('8600123456789012') && !publicCatalog.includes('Madina Karimova'), 'the card never appears in the catalog');

  const paid = await cardOrder();
  assert.deepEqual(paid.payment, { method: 'card', status: 'unpaid' });
  assert.equal((await view(paid.id)).payInfo, null, 'no card before the shop accepts');
  assert.equal((await shopCall(`/orders/${paid.id}`, 'PATCH', { status: 'accepted' })).status, 200);
  const waiting = (await view(paid.id)).payInfo;
  assert.equal(waiting.card, '8600123456789012');
  assert.equal(waiting.amount, product.price);
  assert.equal(waiting.cash, 20000);
  assert.ok(waiting.dueAt > Date.now());
  const early = await shopCall(`/orders/${paid.id}`, 'PATCH', { status: 'delivering' });
  assert.equal(early.status, 409);
  assert.match(early.data.error, /pul tushganini tasdiqlang/i);
  assert.equal((await call(`/orders/${paid.id}/payment`, 'POST', {}, randomUUID())).status, 404, 'only the buyer can say "I paid"');
  assert.equal((await call(`/orders/${paid.id}/payment`, 'POST', { note: '4521' })).data.payment.status, 'claimed');
  assert.equal((await call(`/orders/${paid.id}/payment`, 'POST', {})).status, 409, 'a second tap is refused');
  assert.equal((await shopCall(`/orders/${paid.id}/payment`, 'POST', { action: 'reject' })).data.payment.status, 'unpaid');
  assert.equal((await call(`/orders/${paid.id}/payment`, 'POST', {})).status, 200);
  assert.equal((await shopCall(`/orders/${paid.id}/payment`, 'POST', { action: 'confirm' })).data.payment.status, 'confirmed');
  assert.equal((await view(paid.id)).payInfo, null);
  assert.equal((await shopCall(`/orders/${paid.id}`, 'PATCH', { status: 'delivering' })).status, 200);
  assert.equal((await shopCall(`/orders/${paid.id}`, 'PATCH', { status: 'delivered' })).status, 200);

  // taxi shops: cash delivery is refused, the flowers are paid by card and only the ride is cash
  assert.equal((await shopCall('/payment', 'PUT', { acceptsCard: true, delivery: 'taxi' })).status, 200);
  const cashTaxi = await order({ method: 'delivery', when: 'asap' });
  assert.equal(cashTaxi.status, 409, 'cash delivery is refused in taxi mode');
  assert.match(cashTaxi.data.error, /taksi/i);
  const taxiCard = await cardOrder();
  assert.equal((await call(`/orders/${taxiCard.id}/cancel`, 'POST')).status, 200);
  assert.equal((await shopCall('/payment', 'PUT', { acceptsCard: true, delivery: 'own' })).status, 200);

  // a shop cancels after the money arrived: flagged for a refund until the shop marks it returned
  const refunded = await cardOrder();
  await shopCall(`/orders/${refunded.id}`, 'PATCH', { status: 'accepted' });
  await shopCall(`/orders/${refunded.id}/payment`, 'POST', { action: 'confirm' });
  assert.equal((await shopCall(`/orders/${refunded.id}`, 'PATCH', { status: 'cancelled' })).status, 200);
  assert.equal((await view(refunded.id)).refundDue, true);
  assert.equal((await shopCall(`/orders/${refunded.id}/payment`, 'POST', { action: 'refunded' })).status, 200);
  assert.equal((await view(refunded.id)).refundDue, false);
}

// support: validation, ownership, privacy, daily limit, closed admin routes
assert.equal((await call('/support', 'POST', { kind: 'complaint', message: 'ab' })).status, 400);
const note = await call('/support', 'POST', { kind: 'complaint', message: 'Buyurtma kech yetib keldi', orderId: b.data.id });
assert.equal(note.status, 201, JSON.stringify(note.data));
assert.equal((await call('/support', 'POST', { kind: 'question', message: 'Boshqa odamning buyurtmasi', orderId: b.data.id }, randomUUID())).status, 404);
assert.equal((await call('/support')).data.length, 1);
assert.equal((await call('/support', 'GET', undefined, randomUUID())).data.length, 0, 'tickets are private');
for (let i = 0; i < 6; i++) await call('/support', 'POST', { kind: 'question', message: `Savol raqami ${i}` });
assert.equal((await call('/support', 'POST', { kind: 'question', message: 'Yana bitta savol' })).status, 429);
assert.equal((await call('/admin/support')).status, 401);

// deleting a shop (admin only): refused while an order is open, then the shop and its login disappear
const adminToken = process.env.ADMIN_TOKEN || (() => { try { return (readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').match(/^ADMIN_TOKEN=(.*)$/m) || [])[1]?.replace(/^"|"$/g, '') || ''; } catch { return ''; } })();
if (adminToken) {
  assert.equal((await call('/admin/shops/lola', 'DELETE')).status, 401, 'only an admin may delete a shop');
  const open = await order({ method: 'delivery', when: 'asap' });
  assert.equal(open.status, 201, JSON.stringify(open.data));
  const refused = await call('/admin/shops/lola', 'DELETE', undefined, user, adminToken);
  assert.equal(refused.status, 409, JSON.stringify(refused.data));
  assert.ok((await call('/catalog')).data.shops.some(s => s.id === 'lola'), 'a refused delete removes nothing');
  assert.equal((await call(`/orders/${open.data.id}/cancel`, 'POST')).status, 200);

  const doomed = { id: 'smoke-delete', name: 'Smoke Delete', subtitle: 'Test flowers', address: 'Urganch test address', deliveryFee: 25000, deliveryTime: '30–60 daqiqa', color: '#edf3ee', initials: 'SD', active: true };
  const made = await call('/admin/onboard', 'POST', { shop: doomed, login: 'smoke.delete', password: 'Temporary-Password-123', phone: '+998901234567', telegramChatId: '123456789' }, user, adminToken);
  assert.equal(made.status, 201, JSON.stringify(made.data));
  const session = await call('/auth/login', 'POST', { login: 'smoke.delete', password: 'Temporary-Password-123' });
  assert.equal(session.status, 200, JSON.stringify(session.data));
  const removed = await call('/admin/shops/smoke-delete', 'DELETE', undefined, user, adminToken);
  assert.equal(removed.status, 200, JSON.stringify(removed.data));
  assert.equal((await call('/admin/shops/smoke-delete', 'DELETE', undefined, user, adminToken)).status, 404);
  assert.equal((await call('/auth/me', 'GET', undefined, user, session.data.token)).status, 401, 'the deleted shop owner is signed out');
  assert.equal((await call('/auth/login', 'POST', { login: 'smoke.delete', password: 'Temporary-Password-123' })).status, 401);
} else console.log('skipped: shop deletion (no ADMIN_TOKEN)');

console.log('worker smoke OK');
