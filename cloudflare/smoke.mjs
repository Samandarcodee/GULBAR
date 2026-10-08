import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const url = process.argv[2] || 'http://127.0.0.1:8787';
const token = JSON.parse(readFileSync(new URL('../.cloudflare-secrets.json', import.meta.url), 'utf8')).DEMO_MERCHANT_TOKEN;
const user = randomUUID();
async function call(path, method = 'GET', body, secret, customer = user) {
  const response = await fetch(`${url}/api${path}`, { method,
    headers: { 'Content-Type': 'application/json', 'X-Demo-User': customer, ...(secret ? { Authorization: `Bearer ${secret}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  return { status: response.status, data };
}
assert.equal((await call('/health')).data.ok, true);
const catalog = (await call('/catalog')).data;
assert.equal(catalog.demo, true);
assert.equal(catalog.merchantProtected, true);
assert.equal(catalog.shops.length, 3);
assert.equal((await call('/merchant/lola/orders')).status, 401);
assert.equal((await call('/merchant/lola/orders', 'GET', undefined, 'incorrect-key')).status, 401);
assert.equal((await call('/merchant/lola/workspace')).status, 401);
assert.equal((await call('/merchant/lola/settings', 'PATCH', {})).status, 401);
const workspace = await call('/merchant/lola/workspace', 'GET', undefined, token);
assert.equal(workspace.status, 200);
assert.equal(workspace.data.shop.id, 'lola');
assert.ok(workspace.data.products.every(p => p.shopId === 'lola'));
assert.equal((await call('/admin/shops', 'POST', {})).status, 401);
assert.equal((await fetch(`${url}/merchant`)).status, 200);
assert.equal((await fetch(`${url}/api/no-such-route`)).status, 404);
assert.equal((await fetch(`${url}/images/pink-bouquet.jpg`)).status, 200);
if (process.argv.includes('--read-only')) { console.log('Cloudflare read-only health, catalog, assets, routing and auth checks passed.'); process.exit(0); }
const before = catalog.products.find(p => p.id === 'p1');
const customer = { name: 'Demo smoke test', phone: '+998900000000', recipient: 'Demo test', recipientPhone: '+998900000000', address: 'Urganch, demo test manzili', deliveryTime: 'soon', note: 'Automated demo test, no delivery', anonymous: false };
const input = { requestKey: randomUUID(), shopId: 'lola', items: [{ productId: 'p1', quantity: 1 }], customer, total: 1 };
const [first, retry] = await Promise.all([call('/orders', 'POST', input), call('/orders', 'POST', input)]);
assert.ok([200, 201].includes(first.status), `Order failed: ${first.status}`);
assert.equal(first.data.id, retry.data.id);
assert.equal(first.data.total, before.price + catalog.shops[0].deliveryFee);
assert.equal(first.data.notification, 'demo');
const after = (await call('/catalog')).data.products.find(p => p.id === 'p1');
assert.equal(after.stock, before.stock - 1);
assert.equal((await call('/orders')).data.length, 1);
assert.equal((await call('/orders', 'GET', undefined, undefined, randomUUID())).data.length, 0);
const mixed = await call('/orders', 'POST', { ...input, requestKey: randomUUID(), items: [{ productId: 'p1', quantity: 1 }, { productId: 'p2', quantity: 1 }] });
assert.equal(mixed.status, 400);
assert.equal((await call(`/merchant/bloom/orders/${first.data.id}`, 'PATCH', { status: 'accepted' }, token)).status, 404);
assert.equal((await call(`/merchant/lola/orders/${first.data.id}`, 'PATCH', { status: 'delivered' }, token)).status, 409);
assert.equal((await call(`/merchant/lola/orders/${first.data.id}`, 'PATCH', { status: 'accepted' }, token)).data.status, 'accepted');
assert.equal((await call(`/merchant/lola/orders/${first.data.id}`, 'PATCH', { status: 'cancelled' }, token)).data.status, 'cancelled');
await call(`/merchant/lola/orders/${first.data.id}`, 'PATCH', { status: 'cancelled' }, token);
assert.equal((await call('/catalog')).data.products.find(p => p.id === 'p1').stock, before.stock);
if (process.argv.includes('--merchant')) {
  const original = workspace.data.shop;
  try {
    assert.equal((await call('/merchant/lola/products/p1', 'PATCH', { expectedStock: before.stock + 1, stock: 500 }, token)).status, 409);
    assert.equal((await call('/merchant/lola/products/p1', 'PATCH', { active: false }, token)).status, 200);
    assert.ok(!(await call('/catalog')).data.products.some(p => p.id === 'p1'));
    assert.equal((await call('/merchant/lola/workspace', 'GET', undefined, token)).data.products.find(p => p.id === 'p1').active, false);
    assert.equal((await call('/orders', 'POST', { ...input, requestKey: randomUUID() })).status, 409);
    assert.equal((await call('/merchant/lola/settings', 'PATCH', { ...original, active: false, id: 'hijacked' }, token)).data.id, 'lola');
    assert.ok(!(await call('/catalog')).data.shops.some(s => s.id === 'lola'));
    assert.equal((await call('/merchant/lola/workspace', 'GET', undefined, token)).data.shop.active, false);
    assert.equal((await call('/orders', 'POST', { ...input, requestKey: randomUUID() })).status, 400);
    assert.equal((await call('/merchant/lola/settings', 'PATCH', { ...original, deliveryFee: -1 }, token)).status, 400);
  } finally {
    const restoredProduct = await call('/merchant/lola/products/p1', 'PATCH', { active: before.active !== false }, token);
    const restoredShop = await call('/merchant/lola/settings', 'PATCH', original, token);
    assert.equal(restoredProduct.status, 200); assert.equal(restoredShop.status, 200);
  }
  console.log('Merchant checks passed: hidden products, closed-shop login, settings validation and stale stock rejection. Test changes restored.');
}
console.log('Cloudflare D1 checks passed: auth, isolation, stock, totals, concurrent idempotency, status transitions, single-shop rule and cancellation restock.');
