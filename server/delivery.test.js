import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDelivery, slotOptions, slotRange, deliveryLabel, dayLabel, shopOrderText, tashkentDate, addDays } from './delivery.js';
// Tashkent is UTC+5; "now" below is 2026-10-07 12:00 Tashkent.
const now = new Date(Date.UTC(2026, 9, 7, 7, 0));
const shop = { hours: { open: '09:00', close: '21:00' } };
const night = { hours: { open: '09:00', close: '01:00' } };
const slot = (date, from, to, extra = {}) => ({ method: 'delivery', when: 'slot', date, from, to, ...extra });

test('dates: Tashkent today, day arithmetic and Uzbek labels', () => {
  assert.equal(tashkentDate(new Date(Date.UTC(2026, 9, 7, 20, 30))), '2026-10-08'); // 01:30 next day in Tashkent
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(dayLabel('2026-10-07', now), 'Bugun');
  assert.equal(dayLabel('2026-10-08', now), 'Ertaga');
  assert.equal(dayLabel('2026-10-12', now), '12-oktabr');
  assert.deepEqual([slotRange('2026-10-07', '22:00', '00:00').end.getTime() - slotRange('2026-10-07', '22:00', '00:00').start.getTime()], [7200000]);
});

test('a window needs a 60 minute lead, working hours and a sensible length', () => {
  assert.equal(validateDelivery(slot('2026-10-07', '14:00', '16:00'), shop, now).ok, true);
  assert.match(validateDelivery(slot('2026-10-07', '12:30', '14:00'), shop, now).error, /juda yaqin/);
  assert.match(validateDelivery(slot('2026-10-07', '20:00', '22:00'), shop, now).error, /ish vaqti/);
  assert.match(validateDelivery(slot('2026-10-06', '14:00', '16:00'), shop, now).error, /14 kun/);
  assert.match(validateDelivery(slot('2026-10-30', '14:00', '16:00'), shop, now).error, /14 kun/);
  assert.match(validateDelivery(slot('2026-10-08', '10:00', '10:15'), shop, now).error, /30 daqiqadan/);
  assert.match(validateDelivery(slot('2026-10-08', '09:00', '18:00'), shop, now).error, /6 soatgacha/);
  assert.match(validateDelivery({ method: 'delivery', when: 'slot' }, shop, now).error, /Sana va vaqt/);
  assert.equal(validateDelivery(slot('2026-10-07', '23:00', '00:30'), night, now).ok, true, 'a window may cross midnight when the shop does');
  const result = validateDelivery(slot('2026-10-08', '10:00', '12:00'), shop, now);
  assert.equal(result.legacy, 'tomorrow');
  assert.equal(validateDelivery(slot('2026-10-07', '14:00', '16:00'), shop, now).legacy, 'today-evening');
});

test('as soon as possible only works while the shop is open; a closed shop counts its lead from opening', () => {
  assert.equal(validateDelivery({ method: 'delivery', when: 'asap' }, shop, now).legacy, 'soon');
  const lateNight = new Date(Date.UTC(2026, 9, 7, 19, 0)); // 00:00 Tashkent
  assert.match(validateDelivery({ method: 'delivery', when: 'asap' }, shop, lateNight).error, /yopiq/);
  assert.match(validateDelivery(slot('2026-10-08', '09:00', '11:00'), shop, lateNight).error, /juda yaqin/, 'opens 09:00, so 09:00 start is too early');
  assert.equal(validateDelivery(slot('2026-10-08', '10:00', '12:00'), shop, lateNight).ok, true);
  assert.equal(validateDelivery({ method: 'delivery', when: 'asap' }, { hours: null }, lateNight).ok, true, 'no hours means always open');
});

test('map points are rounded, kept for delivery only and pick-up is accepted', () => {
  const withPoint = validateDelivery(slot('2026-10-07', '14:00', '16:00', { point: { lat: 41.550123456, lng: 60.631987654 } }), shop, now);
  assert.deepEqual(withPoint.delivery.point, { lat: 41.55012, lng: 60.63199 });
  const pickup = validateDelivery(slot('2026-10-07', '14:00', '16:00', { method: 'pickup', point: { lat: 41.55, lng: 60.63 } }), shop, now);
  assert.equal(pickup.delivery.method, 'pickup');
  assert.equal(pickup.delivery.point, undefined);
});

test('selectable windows follow the shop hours and switch off when too soon', () => {
  const today = slotOptions(shop, '2026-10-07', 'delivery', now);
  assert.deepEqual(today.map(s => `${s.from}-${s.to}:${s.ok ? 'ok' : 'x'}`), ['09:00-11:00:x', '11:00-13:00:x', '13:00-15:00:ok', '15:00-17:00:ok', '17:00-19:00:ok', '19:00-21:00:ok']);
  assert.equal(slotOptions(night, '2026-10-08', 'delivery', now).at(-1).to, '01:00');
});

test('the shop message carries time, map, card and pick-up details', () => {
  const order = { id: 'abcdef12-0000', items: [{ name: 'Oq Bulut', quantity: 1, price: 450000 }], deliveryFee: 25000, total: 475000, afterHours: false,
    delivery: { method: 'delivery', when: 'slot', date: '2026-10-08', from: '14:00', to: '16:00', point: { lat: 41.55, lng: 60.63 } },
    customer: { name: 'Dilnoza', phone: '+998901112233', recipient: 'Madina', recipientPhone: '+998901112244', address: 'Urganch, Navoiy 5', note: 'Tug‘ilgan kuningiz bilan!', cardStyle: 'rose', cardFrom: 'Dilnoza', anonymous: false } };
  const text = shopOrderText(order, now);
  for (const part of ['GulBar · #abcdef12', 'Yetkazish: 25 000 so‘m', 'Jami: 475 000 so‘m', 'Vaqt: Ertaga, 14:00–16:00', 'https://www.google.com/maps?q=41.55,60.63', 'Tabrik kartasi (Atirgul): Tug‘ilgan kuningiz bilan!', 'Kimdan: Dilnoza']) assert.ok(text.includes(part), part);
  const pickup = shopOrderText({ ...order, deliveryFee: 0, total: 450000, delivery: { method: 'pickup', when: 'slot', date: '2026-10-07', from: '16:00', to: '18:00' }, customer: { ...order.customer, note: '' } }, now);
  assert.ok(pickup.includes('Do‘kondan olib ketadi') && pickup.includes('Olib ketuvchi: Madina') && pickup.includes('Olib ketish vaqti: Bugun, 16:00–18:00') && pickup.includes('Tabrik: yo‘q'));
  assert.equal(deliveryLabel({ customer: { deliveryTime: 'tomorrow' } }), 'Ertaga 10:00–18:00', 'older orders keep their old wording');
});
