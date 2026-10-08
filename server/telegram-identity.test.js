import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { accountStore } from './accounts.js';
import { telegramUserId } from './auth.js';
import { createTicket, adminList, adminUpdate } from './support.js';

test('the Telegram user id is read out of the customer id that the app stores', () => {
  assert.equal(telegramUserId('tg:555123'), '555123');
  assert.equal(telegramUserId('tg:0'), '0');
  assert.equal(telegramUserId('demo:abc-1234567890-abcd'), '');
  assert.equal(telegramUserId('555123'), '', 'a bare number is not a customer id');
  assert.equal(telegramUserId('tg:555x'), '');
  assert.equal(telegramUserId(undefined), '');
});

test('an admin reply reaches the buyer on Telegram: the hook gets the numeric id, demo buyers are not messaged', async t => {
  const { db } = createApp({ demo: true });
  t.after(() => db.close());
  const store = accountStore(db);
  await createTicket(store, 'tg:555123', { kind: 'question', message: 'Buyurtma haqida savolim bor' });
  await createTicket(store, 'demo:visitor-1234567890-ab', { kind: 'question', message: 'Demo foydalanuvchi savoli' });
  const rows = (await adminList(store)).data;
  const real = rows.find(r => r.message.startsWith('Buyurtma'));
  const demo = rows.find(r => r.message.startsWith('Demo'));
  assert.equal(real.canReplyInTelegram, true);
  assert.equal(demo.canReplyInTelegram, false);

  const sent = [];
  const hooks = { notify: async (chat, text) => sent.push([chat, text]) };
  await adminUpdate(store, real.id, { reply: 'Albatta, yordam beramiz' }, hooks);
  await adminUpdate(store, demo.id, { reply: 'Demo javob' }, hooks);
  assert.equal(sent.length, 1, 'only the real Telegram buyer is messaged');
  assert.equal(sent[0][0], '555123');
  assert.match(sent[0][1], /Albatta, yordam beramiz/);
});
