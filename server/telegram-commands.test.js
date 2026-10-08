import test from 'node:test';
import assert from 'node:assert/strict';
import { commandReply, telegramParameters } from './telegram-commands.js';
const url = 'https://gulbar.example';
const message = { chat: { id: 123, type: 'private' }, from: { id: 123 }, text: '/start' };
test('private bot commands open the app and reveal only the sender ID', () => {
  const welcome = commandReply(message, url, true);
  assert.equal(welcome.chat_id, 123);
  assert.match(welcome.text, /demo/);
  assert.equal(welcome.reply_markup.inline_keyboard[0][0].web_app.url, url);
  const id = commandReply({ ...message, text: '/id@GulBarr_bot' }, url, false);
  assert.match(id.text, /Telegram ID: 123/);
  assert.equal(commandReply({ ...message, text: '/identifier' }, url, false), null);
  assert.equal(commandReply({ ...message, chat: { id: -123, type: 'group' } }, url, false), null);
  assert.equal(commandReply({ ...message, from: { id: 456 } }, url, false), null);
  assert.equal(commandReply(undefined, url, false), null);
});
test('Telegram nested parameters are JSON serialized so Mini App and order buttons are accepted', () => {
  const reply = commandReply(message, url, true);
  const encoded = telegramParameters(reply);
  assert.equal(encoded.chat_id, 123);
  assert.equal(typeof encoded.reply_markup, 'string');
  assert.deepEqual(JSON.parse(encoded.reply_markup), reply.reply_markup);
  assert.deepEqual(JSON.parse(telegramParameters({ allowed_updates: ['message'] }).allowed_updates), ['message']);
});
test('/start greets by name, speaks Russian to Russian users and never lets a name inject markup', () => {
  const uz = commandReply({ ...message, from: { id: 123, first_name: 'Madina', language_code: 'uz' } }, url, false);
  assert.match(uz.text, /^Assalomu alaykum, Madina!/);
  assert.equal(uz.reply_markup.inline_keyboard[0][0].text, 'GulBar’ni ochish');
  const ru = commandReply({ ...message, from: { id: 123, first_name: 'Anna', language_code: 'ru' } }, url, false);
  assert.match(ru.text, /^Здравствуйте, Anna!/);
  const odd = commandReply({ ...message, from: { id: 123, first_name: '<b>X</b>\u0000' + 'y'.repeat(80) } }, url, false);
  assert.doesNotMatch(odd.text.split('\n')[0], /[<>\u0000]/);
  assert.ok(odd.text.split('\n')[0].length < 80);
  assert.match(commandReply({ ...message, text: '/help' }, url, false).text, /Buyurtma berish juda oson/);
  assert.match(commandReply(message, url, false).text, /^Assalomu alaykum!/);
});
