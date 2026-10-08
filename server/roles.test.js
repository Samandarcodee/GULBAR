import test from 'node:test';
import assert from 'node:assert/strict';
import { roleFor } from './auth.js';

const shopChats = [{ shop_id: 'madina', chat_id: '111' }, { shop_id: 'gold', chat_id: '786171158' }, { shop_id: 'sonya', chat_id: '' }];

test('the admin is recognised by Telegram id and sees the admin and shop links', () => {
  assert.deepEqual(roleFor('tg:786171158', '786171158', shopChats), { admin: true, shops: ['gold'] });
});

test('a shop owner sees only their own shop; an ordinary buyer sees nothing', () => {
  assert.deepEqual(roleFor('tg:111', '786171158', shopChats), { admin: false, shops: ['madina'] });
  assert.deepEqual(roleFor('tg:555000', '786171158', shopChats), { admin: false, shops: [] });
});

test('an unconfigured admin id or a demo visitor never matches an empty value', () => {
  assert.deepEqual(roleFor('tg:786171158', '', shopChats), { admin: false, shops: ['gold'] });
  assert.deepEqual(roleFor('tg:786171158', undefined, shopChats), { admin: false, shops: ['gold'] });
  assert.deepEqual(roleFor('demo:visitor-1234567890-ab', '', shopChats), { admin: false, shops: [] }, 'an empty chat id must not match an empty customer id');
  assert.deepEqual(roleFor(undefined, '', shopChats), { admin: false, shops: [] });
});
