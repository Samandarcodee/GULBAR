import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNational, nationalDigits, phoneMessage, toPhone } from './phone.js';

test('a pasted number in any usual form becomes the nine national digits', () => {
  for (const raw of ['+998901234567', '998901234567', '+998 90 123 45 67', '901234567', '90 123 45 67', '90-123-45-67', '0901234567', '8 90 123 45 67', '(90) 123-45-67', '+998 (90) 123 45 67']) {
    assert.equal(nationalDigits(raw), '901234567', raw);
  }
});

test('typing digit by digit keeps what was typed, even when a national number starts with 99 8', () => {
  assert.equal(nationalDigits(''), '');
  assert.equal(nationalDigits('+998'), '');
  assert.equal(nationalDigits('9'), '9');
  assert.equal(nationalDigits('99'), '99');
  assert.equal(nationalDigits('998'), '998', 'while typing, 998 is the start of a number like 99 8xx xx xx');
  assert.equal(nationalDigits('998123456'), '998123456', 'nine digits starting with 998 are a real national number');
  assert.equal(nationalDigits('+998 99 812 34 56'), '998123456');
  assert.equal(nationalDigits('90123456789999'), '901234567', 'extra digits are cut');
  assert.equal(nationalDigits('abc'), '');
});

test('the national digits are shown in the way people read numbers', () => {
  assert.equal(formatNational(''), '');
  assert.equal(formatNational('9'), '9');
  assert.equal(formatNational('90'), '90');
  assert.equal(formatNational('901'), '90 1');
  assert.equal(formatNational('90123'), '90 123');
  assert.equal(formatNational('9012345'), '90 123 45');
  assert.equal(formatNational('901234567'), '90 123 45 67');
});

test('the stored value stays +998 and nine digits, which is what the server accepts', () => {
  assert.equal(toPhone(''), '+998');
  assert.equal(toPhone('901234567'), '+998901234567');
  assert.match(toPhone('901234567'), /^\+998\d{9}$/);
});

test('the message says what is missing and shows an example', () => {
  assert.equal(phoneMessage('+998901234567'), '');
  assert.match(phoneMessage('+998'), /yozing/);
  assert.match(phoneMessage('+99890123'), /9 ta raqam/);
  assert.match(phoneMessage('+99890123'), /90 123 45 67/);
});
