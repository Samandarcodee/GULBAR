import test from 'node:test';
import assert from 'node:assert/strict';
import { isOpen, nextOpen, hoursLabel, toMinutes } from './hours.js';
// Tashkent is UTC+5, so 09:00 there is 04:00 UTC.
const at = (hh, mm = 0) => new Date(Date.UTC(2026, 9, 7, hh - 5, mm));
const day = { open: '09:00', close: '21:00' };
const night = { open: '09:00', close: '01:00' };

test('a shop without hours (or with broken hours) is always open', () => {
  for (const h of [undefined, null, {}, { open: '9', close: '21' }, { open: '09:00', close: '09:00' }]) assert.equal(isOpen(h, at(3)), true);
  assert.equal(hoursLabel(null), '');
});

test('daytime hours: open from the opening minute, closed from the closing minute', () => {
  assert.equal(isOpen(day, at(8, 59)), false);
  assert.equal(isOpen(day, at(9, 0)), true);
  assert.equal(isOpen(day, at(20, 59)), true);
  assert.equal(isOpen(day, at(21, 0)), false);
  assert.equal(hoursLabel(day), '09:00–21:00');
});

test('hours past midnight work on both sides of 00:00', () => {
  assert.equal(isOpen(night, at(23, 30)), true);
  assert.equal(isOpen(night, at(0, 30)), true);
  assert.equal(isOpen(night, at(1, 0)), false);
  assert.equal(isOpen(night, at(5, 0)), false);
  assert.equal(isOpen(night, at(9, 0)), true);
});

test('nextOpen is now while open, otherwise the coming opening time (also across midnight)', () => {
  const now = at(14, 20);
  assert.equal(nextOpen(day, now).getTime(), now.getTime());
  assert.equal(nextOpen(day, at(22, 0)).getTime(), at(9, 0).getTime() + 86400000);
  assert.equal(nextOpen(day, at(6, 30)).getTime(), at(9, 0).getTime());
  assert.equal(nextOpen(night, at(3, 0)).getTime(), at(9, 0).getTime());
  assert.equal(toMinutes('24:00'), null);
});
