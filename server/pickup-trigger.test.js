import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
// The production database enforces prices and stock with SQL triggers; this runs the real migrations against SQLite.
test('migration 0006: pick-up orders may be free, delivery orders must carry the shop fee', () => {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0001_schema.sql', '0002_hidden_products.sql', '0006_pickup_and_support.sql']) db.exec(readFileSync(new URL(`../cloudflare/migrations/${file}`, import.meta.url), 'utf8'));
  db.prepare('INSERT INTO shops VALUES (?,?)').run('s1', JSON.stringify({ id: 's1', name: 'Test', active: true, deliveryFee: 25000 }));
  db.prepare('INSERT INTO products VALUES (?,?,?)').run('p1', 's1', JSON.stringify({ id: 'p1', shopId: 's1', name: 'Gul', price: 100000, stock: 10, active: true }));
  const place = (id, extra) => db.prepare('INSERT INTO orders(id,customer_id,request_key,data,created_at) VALUES (?,?,?,?,?)')
    .run(id, '1', id, JSON.stringify({ id, shopId: 's1', status: 'pending', items: [{ productId: 'p1', quantity: 1, price: 100000 }], ...extra }), '2026-10-07T10:00:00.000Z');
  place('delivery-ok', { deliveryFee: 25000 });
  place('delivery-ok-explicit', { deliveryFee: 25000, delivery: { method: 'delivery' } });
  place('pickup-free', { deliveryFee: 0, delivery: { method: 'pickup' } });
  assert.throws(() => place('delivery-free', { deliveryFee: 0 }), /delivery_price_changed/);
  assert.throws(() => place('delivery-free-2', { deliveryFee: 0, delivery: { method: 'delivery' } }), /delivery_price_changed/);
  assert.throws(() => place('pickup-paid', { deliveryFee: 25000, delivery: { method: 'pickup' } }), /delivery_price_changed/);
  assert.throws(() => place('overpriced', { deliveryFee: 25000, items: [{ productId: 'p1', quantity: 1, price: 1 }] }), /stock_or_price_changed/);
  const stock = JSON.parse(db.prepare('SELECT data FROM products WHERE id=?').get('p1').data).stock;
  assert.equal(stock, 7, 'only the three accepted orders reserved flowers');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM support_tickets').get().n, 0, 'the support table exists');
});
