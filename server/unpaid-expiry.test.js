import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { FIND_UNPAID_SQL, EXPIRE_UNPAID_SQL } from './payment.js';

const CUTOFF = '2026-10-09T09:30:00.000Z';
// Runs the real production migrations on SQLite, like the other trigger tests.
test('migration 0007 and the unpaid-order sweep: only an accepted, unpaid card order past its window is cancelled, once, and restocked once', () => {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0001_schema.sql', '0002_hidden_products.sql', '0006_pickup_and_support.sql', '0007_card_payments.sql']) db.exec(readFileSync(new URL(`../cloudflare/migrations/${file}`, import.meta.url), 'utf8'));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM shop_cards').get().n, 0, 'the card table exists');

  db.prepare('INSERT INTO shops VALUES (?,?)').run('s1', JSON.stringify({ id: 's1', name: 'Test', active: true, deliveryFee: 20000 }));
  db.prepare('INSERT INTO products VALUES (?,?,?)').run('p1', 's1', JSON.stringify({ id: 'p1', shopId: 's1', name: 'Gul', price: 100000, stock: 20, active: true }));
  const stock = () => JSON.parse(db.prepare('SELECT data FROM products WHERE id=?').get('p1').data).stock;
  const place = (id, { status = 'accepted', payment, updatedAt = '2026-10-09T08:00:00.000Z' }) => {
    db.prepare('INSERT INTO orders(id,customer_id,request_key,data,created_at) VALUES (?,?,?,?,?)')
      .run(id, 'tg:777', id, JSON.stringify({ id, shopId: 's1', status: 'pending', deliveryFee: 20000, items: [{ productId: 'p1', quantity: 1, price: 100000 }], payment }), '2026-10-09T07:00:00.000Z');
    if (status !== 'pending') db.prepare("UPDATE orders SET data=json_set(data,'$.status',?,'$.updatedAt',?) WHERE id=?").run(status, updatedAt, id);
  };
  const card = status => ({ method: 'card', status });
  place('old-unpaid', { payment: card('unpaid') });
  place('old-claimed', { payment: card('claimed') });
  place('old-confirmed', { payment: card('confirmed') });
  place('fresh-unpaid', { payment: card('unpaid'), updatedAt: '2026-10-09T09:55:00.000Z' });
  place('old-cash', { payment: { method: 'cash', status: 'none' } });
  place('still-pending', { status: 'pending', payment: card('unpaid') });
  assert.equal(stock(), 14, 'six orders reserved a flower each');

  const due = db.prepare(FIND_UNPAID_SQL).all(CUTOFF).map(r => r.id);
  assert.deepEqual(due, ['old-unpaid']);
  assert.equal(db.prepare(EXPIRE_UNPAID_SQL).run('2026-10-09T10:00:00.000Z', 'old-unpaid', CUTOFF).changes, 1);
  assert.equal(db.prepare(EXPIRE_UNPAID_SQL).run('2026-10-09T10:00:01.000Z', 'old-unpaid', CUTOFF).changes, 0, 'a second sweep does nothing');
  assert.equal(stock(), 15, 'the flower went back exactly once');
  const swept = JSON.parse(db.prepare('SELECT data FROM orders WHERE id=?').get('old-unpaid').data);
  assert.equal(swept.status, 'cancelled');
  assert.equal(swept.cancelReason, 'unpaid');
  for (const id of ['old-claimed', 'old-confirmed', 'fresh-unpaid', 'old-cash', 'still-pending']) {
    assert.equal(db.prepare(EXPIRE_UNPAID_SQL).run('2026-10-09T10:00:00.000Z', id, CUTOFF).changes, 0, `${id} is left alone`);
  }
});
