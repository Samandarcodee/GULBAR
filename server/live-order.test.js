import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createApp } from './app.js';
test('live signed checkout queues a merchant message and private callbacks complete delivery', async t => {
  const token = 'test-bot-token';
  const adminKey = 'test-admin-key';
  const webhookKey = 'test-webhook-key';
  const { app, db, flushOutbox } = createApp({ demo: false, botToken: token, adminToken: adminKey, webhookSecret: webhookKey });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.close(); db.close(); });
  const original = globalThis.fetch;
  const messages = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).startsWith('https://api.telegram.org/')) {
      messages.push({ method: String(url).split('/').at(-1), data: JSON.parse(options.body) });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 777 } }), { headers: { 'Content-Type': 'application/json' } });
    }
    return original(url, options);
  });
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 987654321, first_name: 'Test' }) });
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  params.set('hash', createHmac('sha256', createHmac('sha256', 'WebAppData').update(token).digest()).update(check).digest('hex'));
  const call = async (path, body, headers = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const raw = await response.text();
    let data; try { data = JSON.parse(raw); } catch { data = { error: raw }; }
    return { status: response.status, data };
  };
  const shop = { id: 'live-test', name: 'Test florist', subtitle: 'Test description', address: 'Test address', deliveryFee: 20000, deliveryTime: '60 daqiqa', color: '#edf3ee', initials: 'TF', active: true };
  assert.equal((await call('/admin/onboard', { shop, login: 'test.florist', password: 'Initial-Test-Password', phone: '+998900000000', telegramChatId: '123456789' }, { Authorization: `Bearer ${adminKey}` })).status, 201);
  const product = { id: 'test-flower', shopId: shop.id, name: 'Test flower', description: 'Description', price: 100000, stock: 4, category: 'bouquet', image: 'https://example.com/flower.jpg', badge: '', active: true };
  db.prepare('INSERT INTO products VALUES (?,?,?)').run(product.id, shop.id, JSON.stringify(product));
  const input = { requestKey: randomUUID(), shopId: shop.id, items: [{ productId: product.id, quantity: 1 }], customer: { name: 'Test buyer', phone: '+998900000000', recipient: 'Test recipient', recipientPhone: '+998900000000', address: 'Test address', deliveryTime: 'soon', note: '', anonymous: false } };
  assert.equal((await call('/orders', input, { 'X-Demo-User': 'test-demo-user-123456' })).status, 401);
  const order = await call('/orders', input, { 'X-Telegram-Init-Data': params.toString() });
  assert.equal(order.status, 201); assert.equal(order.data.demo, false); assert.equal(order.data.total, 120000);
  await flushOutbox();
  assert.equal(messages.length, 1); assert.equal(messages[0].data.chat_id, '123456789');
  assert.equal(JSON.parse(messages[0].data.reply_markup).inline_keyboard[0][0].callback_data, `order:${order.data.id}:accepted`);
  assert.equal(JSON.parse(db.prepare('SELECT data FROM orders WHERE id=?').get(order.data.id).data).notification, 'sent');
  const callback = status => ({ callback_query: { id: `test-${status}`, from: { id: 123456789 }, message: { message_id: 777, chat: { id: 123456789, type: 'private' } }, data: `order:${order.data.id}:${status}` } });
  const wrong = callback('accepted'); wrong.callback_query.from.id = 111;
  assert.equal((await call('/telegram/webhook', wrong, { 'X-Telegram-Bot-Api-Secret-Token': webhookKey })).status, 403);
  for (const status of ['accepted', 'delivering', 'delivered']) assert.equal((await call('/telegram/webhook', callback(status), { 'X-Telegram-Bot-Api-Secret-Token': webhookKey })).status, 200);
  assert.equal(JSON.parse(db.prepare('SELECT data FROM orders WHERE id=?').get(order.data.id).data).status, 'delivered');
  assert.equal(JSON.parse(db.prepare('SELECT data FROM products WHERE id=?').get(product.id).data).stock, 3);
});
