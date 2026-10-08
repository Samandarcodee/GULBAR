import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { MAX_AGE_SECONDS, validateTelegram } from './auth.js';

const TOKEN = '123456:test-token';
function initData(authDate, user = { id: 777, first_name: 'Dilnoza' }) {
  const params = new URLSearchParams({ auth_date: String(authDate), query_id: 'AAH', user: JSON.stringify(user) });
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}
const now = Date.UTC(2026, 9, 8, 12, 0, 0);
const at = secondsAgo => Math.floor(now / 1000) - secondsAgo;

test('a Mini App that has been open for hours still works, a day-old launch does not', () => {
  assert.equal(MAX_AGE_SECONDS, 24 * 3600);
  assert.equal(validateTelegram(initData(at(10)), TOKEN, now).id, 'tg:777');
  assert.equal(validateTelegram(initData(at(5 * 3600)), TOKEN, now).id, 'tg:777');
  assert.equal(validateTelegram(initData(at(23 * 3600)), TOKEN, now).id, 'tg:777');
  assert.throws(() => validateTelegram(initData(at(25 * 3600)), TOKEN, now), /Sessiya tugadi/);
});

test('launch data from the future, a wrong signature or another bot token is refused', () => {
  assert.throws(() => validateTelegram(initData(at(-120)), TOKEN, now), /Sessiya tugadi/);
  assert.throws(() => validateTelegram(initData(at(10)).replace(/hash=[a-f0-9]+/, 'hash=' + '0'.repeat(64)), TOKEN, now), /tasdig/);
  assert.throws(() => validateTelegram(initData(at(10)), '999999:other-token', now), /tasdig/);
});
