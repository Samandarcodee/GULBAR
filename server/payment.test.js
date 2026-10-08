import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceCheck, cardAmount, cardDetailsSchema, cashDue, choosePayment, claimPayment, decidePayment, maskCard, payInfo, refundDue, DEFAULT_DUE_MINUTES } from './payment.js';

const CARD = '8600123456789012';
const at = iso => new Date(iso);
const shop = (extra = {}) => ({ id: 'madina', acceptsCard: true, delivery: 'own', ...extra });
const order = (extra = {}) => ({ id: 'o1', status: 'accepted', subtotal: 280000, deliveryFee: 20000, total: 300000, updatedAt: '2026-10-09T10:00:00.000Z', payment: { method: 'card', status: 'unpaid' }, ...extra });

test('card details: spaces are ignored, the number must be 16 digits that pass the check-digit test', () => {
  assert.equal(cardDetailsSchema.parse({ number: '8600 1234 5678 9012', holder: 'Madina Karimova' }).number, CARD);
  assert.equal(cardDetailsSchema.parse({ number: '8600-1234-5678-9012', holder: 'Madina Karimova', bank: 'Uzum Bank' }).bank, 'Uzum Bank');
  assert.equal(cardDetailsSchema.safeParse({ number: '8600 1234 5678 9013', holder: 'Madina Karimova' }).success, false, 'a typo in one digit is caught');
  assert.equal(cardDetailsSchema.safeParse({ number: '8600 1234 5678', holder: 'Madina Karimova' }).success, false);
  assert.equal(cardDetailsSchema.safeParse({ number: CARD, holder: 'M' }).success, false);
});

test('the card number is shown to the buyer in full, but masked wherever it is only a hint', () => {
  assert.equal(maskCard(CARD), '8600 •••• •••• 9012');
});

test('choosing how to pay: cash stays the default, card needs a shop that accepts it', () => {
  assert.deepEqual(choosePayment(undefined, shop({ acceptsCard: false }), 'delivery'), { ok: true, payment: { method: 'cash', status: 'none' } });
  assert.deepEqual(choosePayment({ method: 'card' }, shop(), 'delivery'), { ok: true, payment: { method: 'card', status: 'unpaid' } });
  const refused = choosePayment({ method: 'card' }, shop({ acceptsCard: false }), 'delivery');
  assert.equal(refused.ok, false);
  assert.match(refused.error, /kartaga o‘tkazma/);
});

test('taxi delivery: the flowers must be paid by card in advance, only the ride is cash to the driver', () => {
  const taxi = shop({ delivery: 'taxi' });
  const cash = choosePayment({ method: 'cash' }, taxi, 'delivery');
  assert.equal(cash.ok, false);
  assert.match(cash.error, /taksi/i);
  assert.equal(choosePayment({ method: 'card' }, taxi, 'delivery').ok, true);
  assert.equal(choosePayment({ method: 'cash' }, taxi, 'pickup').ok, true, 'picking up needs no taxi');
  assert.equal(choosePayment(undefined, taxi, 'delivery').ok, false, 'no choice means cash, which taxi shops do not allow');
});

test('what is paid where: card covers the flowers, the delivery fee is cash for the driver', () => {
  assert.equal(cardAmount(order()), 280000);
  assert.equal(cashDue(order()), 20000);
  const cash = order({ payment: { method: 'cash', status: 'none' } });
  assert.equal(cardAmount(cash), 0);
  assert.equal(cashDue(cash), 300000);
  assert.equal(cashDue(order({ deliveryFee: 0, total: 280000 })), 0, 'pickup: nothing left for a courier');
  assert.equal(cashDue({ subtotal: 1, deliveryFee: 0, total: 1 }), 1, 'old orders have no payment object and are plain cash');
});

test('the buyer sees the card only while the shop is waiting for the money, with a deadline', () => {
  const info = payInfo(order(), { number: CARD, holder: 'Madina Karimova', bank: 'Uzum Bank' });
  assert.deepEqual(info, { card: CARD, holder: 'Madina Karimova', bank: 'Uzum Bank', amount: 280000, cash: 20000, dueAt: new Date('2026-10-09T10:00:00.000Z').getTime() + DEFAULT_DUE_MINUTES * 60000, state: 'unpaid' });
  assert.equal(payInfo(order({ payment: { method: 'card', status: 'claimed', claimedAt: 'x' } }), { number: CARD, holder: 'M K' }).state, 'claimed');
  assert.equal(payInfo(order({ status: 'pending' }), { number: CARD, holder: 'M K' }), null, 'before the shop accepts, no card');
  assert.equal(payInfo(order({ payment: { method: 'card', status: 'confirmed' } }), { number: CARD, holder: 'M K' }), null, 'paid: nothing more to show');
  assert.equal(payInfo(order({ status: 'cancelled' }), { number: CARD, holder: 'M K' }), null);
  assert.equal(payInfo(order({ payment: { method: 'cash', status: 'none' } }), { number: CARD, holder: 'M K' }), null);
  assert.equal(payInfo(order(), null), null, 'a shop without a card shows nothing');
});

test('"I paid": only the buyer of an accepted card order, once, with a short optional note', () => {
  const now = at('2026-10-09T10:05:00.000Z');
  const done = claimPayment(order(), ' oxirgi raqamlar 4521 ', now);
  assert.equal(done.ok, true);
  assert.equal(done.order.payment.status, 'claimed');
  assert.equal(done.order.payment.claimedAt, now.toISOString());
  assert.equal(done.order.payment.note, 'oxirgi raqamlar 4521');
  assert.equal(claimPayment(done.order, '', now).ok, false, 'a second tap changes nothing');
  assert.equal(claimPayment(order({ status: 'pending' }), '', now).ok, false, 'the shop has not accepted yet');
  assert.equal(claimPayment(order({ payment: { method: 'cash', status: 'none' } }), '', now).ok, false);
  assert.equal(claimPayment(order({ status: 'cancelled' }), '', now).ok, false);
  assert.equal(claimPayment(order(), 'x'.repeat(200), now).order.payment.note.length, 40, 'notes are cut to 40 characters');
});

test('the shop confirms or rejects the money; a rejection gives the buyer a fresh deadline', () => {
  const now = at('2026-10-09T10:20:00.000Z');
  const claimed = order({ payment: { method: 'card', status: 'claimed', claimedAt: '2026-10-09T10:05:00.000Z', note: 'x' } });
  const ok = decidePayment(claimed, 'confirm', now);
  assert.equal(ok.order.payment.status, 'confirmed');
  assert.equal(ok.order.payment.confirmedAt, now.toISOString());
  const no = decidePayment(claimed, 'reject', now);
  assert.equal(no.order.payment.status, 'unpaid');
  assert.equal(no.order.updatedAt, now.toISOString(), 'updatedAt restarts the payment window');
  assert.equal(no.order.payment.rejectedAt, now.toISOString());
  assert.equal(decidePayment(order(), 'confirm', now).ok, true, 'money seen before the buyer tapped');
  assert.equal(decidePayment(order(), 'reject', now).ok, false, 'nothing to reject yet');
  assert.equal(decidePayment(ok.order, 'reject', now).ok, false, 'a confirmed payment cannot be rejected');
  assert.equal(decidePayment(order({ status: 'pending' }), 'confirm', now).ok, false);
  assert.equal(decidePayment(order({ payment: { method: 'cash', status: 'none' } }), 'confirm', now).ok, false);
  assert.equal(decidePayment(claimed, 'nonsense', now).ok, false);
});

test('a card order cannot go out for delivery before the money is confirmed', () => {
  assert.equal(advanceCheck(order(), 'delivering').ok, false);
  assert.match(advanceCheck(order(), 'delivering').error, /pul tushganini tasdiqlang/i);
  assert.equal(advanceCheck(order({ payment: { method: 'card', status: 'claimed' } }), 'delivered').ok, false);
  assert.equal(advanceCheck(order({ payment: { method: 'card', status: 'confirmed' } }), 'delivering').ok, true);
  assert.equal(advanceCheck(order(), 'cancelled').ok, true, 'cancelling is always possible');
  assert.equal(advanceCheck(order(), 'accepted').ok, true);
  assert.equal(advanceCheck(order({ payment: { method: 'cash', status: 'none' } }), 'delivering').ok, true);
  assert.equal(advanceCheck({ status: 'accepted' }, 'delivering').ok, true, 'old orders without payment are cash');
});

test('a cancelled order whose money was confirmed is flagged until the shop returns it', () => {
  assert.equal(refundDue(order({ status: 'cancelled', payment: { method: 'card', status: 'confirmed' } })), true);
  assert.equal(refundDue(order({ status: 'cancelled', payment: { method: 'card', status: 'confirmed', refundedAt: 'x' } })), false);
  assert.equal(refundDue(order({ status: 'cancelled' })), false, 'unpaid: nothing to return');
  assert.equal(refundDue(order({ status: 'delivered', payment: { method: 'card', status: 'confirmed' } })), false);
  const done = decidePayment(order({ status: 'cancelled', payment: { method: 'card', status: 'confirmed' } }), 'refunded', at('2026-10-09T12:00:00.000Z'));
  assert.equal(done.ok, true);
  assert.equal(done.order.payment.refundedAt, '2026-10-09T12:00:00.000Z');
  assert.equal(decidePayment(order({ status: 'delivered', payment: { method: 'card', status: 'confirmed' } }), 'refunded', at('2026-10-09T12:00:00.000Z')).ok, false);
});

// ---- messages ----
import { buyerPaymentMessage, formatCard, shopClaimText, shopUnpaidMessage } from './payment.js';
import { buyerMessage } from './buyer-messages.js';
import { shopOrderText } from './delivery.js';

const fullOrder = (extra = {}) => ({
  id: 'abcd1234-0000-4000-8000-000000000000', shopId: 'madina', shopName: 'Madina Gullari', status: 'accepted', subtotal: 280000, deliveryFee: 20000, total: 300000,
  items: [{ productId: 'p1', name: 'Oq Bulut', quantity: 1, price: 280000, image: '' }], updatedAt: '2026-10-09T10:00:00.000Z',
  customer: { name: 'Dilnoza', phone: '+998901234567', recipient: 'Madina', recipientPhone: '+998901234568', address: 'Urganch, Navoiy 5', deliveryTime: 'soon', note: '', anonymous: false },
  delivery: { method: 'delivery', when: 'asap' }, payment: { method: 'card', status: 'unpaid' }, ...extra,
});

test('card numbers are shown in groups of four', () => {
  assert.equal(formatCard(CARD), '8600 1234 5678 9012');
});

test('when the shop accepts a card order the buyer gets the card, the amount, the deadline and what stays cash', () => {
  const info = payInfo(fullOrder(), { number: CARD, holder: 'Madina Karimova', bank: 'Uzum Bank' });
  const text = buyerMessage(fullOrder(), 'accepted', { pay: info, minutes: 30 });
  assert.match(text, /8600 1234 5678 9012/);
  assert.match(text, /Madina Karimova/);
  assert.match(text, /Uzum Bank/);
  assert.match(text, /280 000 so‘m/);
  assert.match(text, /30 daqiqa/);
  assert.match(text, /To‘ladim/);
  assert.match(text, /20 000 so‘m.*naqd/s);
  assert.ok(!text.includes('to‘lov yetkazilganda'), 'it must not claim that everything is paid on delivery');
  const pickup = buyerMessage(fullOrder({ deliveryFee: 0, total: 280000 }), 'accepted', { pay: { ...info, cash: 0 }, minutes: 30 });
  assert.ok(!/naqd/.test(pickup), 'pick-up has no ride to pay for');
  assert.match(buyerMessage(fullOrder({ payment: { method: 'cash', status: 'none' } }), 'accepted'), /to‘lov yetkazilganda/, 'cash orders keep the old wording');
});

test('buyer messages about the payment itself', () => {
  assert.match(buyerPaymentMessage(fullOrder(), 'confirmed'), /to‘lov tasdiqlandi/i);
  const rejected = buyerPaymentMessage(fullOrder(), 'rejected', { shopPhone: '+998901112233', minutes: 30 });
  assert.match(rejected, /ko‘rmadi/);
  assert.match(rejected, /\+998901112233/);
  assert.match(rejected, /30 daqiqa/);
  assert.match(buyerPaymentMessage(fullOrder(), 'refunded'), /qaytarildi/);
  assert.match(buyerPaymentMessage(fullOrder(), 'unpaid', { minutes: 30 }), /30 daqiqa ichida to‘lanmadi/);
  assert.equal(buyerPaymentMessage(fullOrder(), 'nonsense'), null);
});

test('the shop is told what the buyer says they paid, and when an order is dropped for lack of payment', () => {
  const claimed = fullOrder({ payment: { method: 'card', status: 'claimed', note: '4521' } });
  const text = shopClaimText(claimed);
  assert.match(text, /280 000 so‘m/);
  assert.match(text, /Dilnoza/);
  assert.match(text, /4521/);
  assert.match(shopUnpaidMessage(claimed, 30), /#abcd1234/);
});

test('the order text for the shop spells out how it is paid', () => {
  const card = shopOrderText(fullOrder({ status: 'pending' }));
  assert.match(card, /Kartaga o‘tkazma/);
  assert.match(card, /280 000 so‘m/);
  assert.match(card, /20 000 so‘m.*naqd/s);
  assert.ok(!card.includes('To‘lov yetkazilganda'));
  const cash = shopOrderText(fullOrder({ status: 'pending', payment: { method: 'cash', status: 'none' } }));
  assert.match(cash, /To‘lov yetkazilganda/);
});
