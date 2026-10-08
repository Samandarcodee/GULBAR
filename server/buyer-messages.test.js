import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { buyerMessage, shopExpiredMessage, EXPIRE_SQL, FIND_EXPIRED_SQL, expiryMinutes } from './buyer-messages.js';

const order = { id: 'd373549c-1111-2222-3333-444455556666', shopName: 'Madina Gullari', total: 475000 };

test('buyer gets a clear Uzbek message for every status change and nothing for pending', () => {
  assert.match(buyerMessage(order, 'accepted'), /qabul qilindi[\s\S]*Madina Gullari · #d373549c[\s\S]*475 000 so‘m/);
  assert.match(buyerMessage(order, 'delivering'), /yo‘lda/);
  assert.match(buyerMessage(order, 'delivered'), /yetkazildi/);
  assert.match(buyerMessage(order, 'cancelled', { shopPhone: '+998901112233' }), /Aniqlashtirish uchun: \+998901112233/);
  assert.doesNotMatch(buyerMessage(order, 'cancelled'), /Aniqlashtirish/);
  assert.match(buyerMessage(order, 'cancelled', { expired: true, minutes: 30 }), /30 daqiqa ichida javob bermadi/);
  assert.equal(buyerMessage(order, 'pending'), null);
  assert.match(shopExpiredMessage(order, 30), /#d373549c 30 daqiqa javobsiz/);
});

test('expiry minutes default to 30 and never drop below 5', () => {
  assert.equal(expiryMinutes(undefined), 30);
  assert.equal(expiryMinutes('45'), 45);
  assert.equal(expiryMinutes('1'), 5);
  assert.equal(expiryMinutes('abc'), 30);
});

test('an unanswered order expires once, restocks exactly once and answered orders are untouched', () => {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0001_schema.sql', '0002_hidden_products.sql']) db.exec(readFileSync(new URL(`../cloudflare/migrations/${file}`, import.meta.url), 'utf8'));
  db.prepare('INSERT INTO shops VALUES (?,?)').run('s1', JSON.stringify({ id: 's1', name: 'Test', active: true, deliveryFee: 20000 }));
  db.prepare('INSERT INTO products VALUES (?,?,?)').run('p1', 's1', JSON.stringify({ id: 'p1', shopId: 's1', name: 'Gul', price: 100000, stock: 10, active: true }));
  const place = (id, createdAt) => db.prepare('INSERT INTO orders(id,customer_id,request_key,data,created_at) VALUES (?,?,?,?,?)').run(id, '777', id, JSON.stringify({ id, shopId: 's1', status: 'pending', deliveryFee: 20000, items: [{ productId: 'p1', quantity: 2, price: 100000 }] }), createdAt);
  place('old-unanswered', '2026-10-07T08:00:00.000Z');
  place('old-accepted', '2026-10-07T08:00:00.000Z');
  place('fresh', '2026-10-07T09:55:00.000Z');
  // placed at night, but the shop only opens at 09:30: its answer clock has not started yet
  place('night-order', '2026-10-07T01:00:00.000Z');
  db.prepare("UPDATE orders SET data=json_set(data,'$.respondFrom','2026-10-07T09:50:00.000Z') WHERE id='night-order'").run();
  const stock = () => JSON.parse(db.prepare('SELECT data FROM products WHERE id=?').get('p1').data).stock;
  const status = id => JSON.parse(db.prepare('SELECT data FROM orders WHERE id=?').get(id).data).status;
  assert.equal(stock(), 2); // four orders of 2 are reserved
  db.prepare("UPDATE orders SET data=json_set(data,'$.status','accepted') WHERE id='old-accepted'").run();
  const due = db.prepare(FIND_EXPIRED_SQL).all('2026-10-07T09:30:00.000Z').map(r => r.id);
  assert.deepEqual(due, ['old-unanswered']);
  assert.equal(db.prepare(EXPIRE_SQL).run('2026-10-07T10:00:00.000Z', 'old-unanswered').changes, 1);
  assert.equal(status('old-unanswered'), 'cancelled');
  assert.equal(JSON.parse(db.prepare('SELECT data FROM orders WHERE id=?').get('old-unanswered').data).cancelReason, 'expired');
  assert.equal(stock(), 4); // its two flowers came back
  assert.equal(db.prepare(EXPIRE_SQL).run('2026-10-07T10:01:00.000Z', 'old-unanswered').changes, 0); // second run does nothing
  assert.equal(stock(), 4);
  assert.equal(db.prepare(EXPIRE_SQL).run('2026-10-07T10:01:00.000Z', 'old-accepted').changes, 0); // accepted orders never expire
  assert.equal(status('old-accepted'), 'accepted');
  assert.equal(status('fresh'), 'pending');
  assert.equal(status('night-order'), 'pending'); // not due although it was created 9 hours ago
});
