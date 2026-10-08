// Delivery / pick-up windows, greeting cards and the text a shop receives. Shared by the Node server, the Worker and the app,
// so the screen and the server always agree on which times can be chosen. All times are Tashkent time (UTC+5).
import { isOpen, nextOpen, hoursLabel, toMinutes } from './hours.js';
import { paymentLines } from './payment.js';

export const LEAD_MINUTES = 60;
export const MAX_DAYS = 14;
export const cardStyles = ['classic', 'rose', 'gold', 'spring', 'minimal'];
export const cardNames = { classic: 'Klassik', rose: 'Atirgul', gold: 'Oltin', spring: 'Bahor', minimal: 'Minimal' };
export const cardTemplates = [
  'Tug‘ilgan kuningiz muborak bo‘lsin!',
  'Sizni sevaman va qadrlayman.',
  'Bayramingiz bilan, aziz insonim!',
  'Rahmat, siz borligingiz uchun.',
  'Omad va baxt tilayman!',
];
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const TASHKENT_MS = 5 * 3600000;

export const tashkentDate = (now = new Date()) => new Date(now.getTime() + TASHKENT_MS).toISOString().slice(0, 10);
export const addDays = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const at = (date, hhmm) => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 0, toMinutes(hhmm) - 300)); };
export function slotRange(date, from, to) {
  const start = at(date, from);
  let end = at(date, to);
  if (end <= start) end = new Date(end.getTime() + 86400000); // a window may end after midnight (22:00–00:00)
  return { start, end };
}
export function dayLabel(date, now = new Date()) {
  const today = tashkentDate(now);
  if (date === today) return 'Bugun';
  if (date === addDays(today, 1)) return 'Ertaga';
  const [, m, d] = date.split('-').map(Number);
  return `${d}-${MONTHS[m - 1]}`;
}
const LEGACY_TIME = { soon: 'Eng yaqin vaqt', 'today-evening': 'Bugun 18:00–21:00', tomorrow: 'Ertaga 10:00–18:00' };
export function deliveryLabel(order, now = new Date()) {
  const d = order?.delivery;
  if (!d) return LEGACY_TIME[order?.customer?.deliveryTime] || '';
  return d.when === 'asap' ? 'Imkon qadar tezroq' : `${dayLabel(d.date, now)}, ${d.from}–${d.to}`;
}

const fail = error => ({ ok: false, error });
/** @typedef {{ method: 'delivery' | 'pickup', when: 'asap' | 'slot', date?: string, from?: string, to?: string, point?: { lat: number, lng: number } }} NormalizedDelivery */
/** Checks the chosen method / date / window against the shop's hours and returns the normalized value plus the legacy `deliveryTime`. */
/** @returns {{ ok: false, error: string } | { ok: true, delivery: NormalizedDelivery, legacy: 'soon' | 'today-evening' | 'tomorrow' }} */
export function validateDelivery(input, shop, now = new Date()) {
  const method = input.method === 'pickup' ? 'pickup' : 'delivery';
  const point = method === 'delivery' && input.point ? { lat: Math.round(input.point.lat * 1e5) / 1e5, lng: Math.round(input.point.lng * 1e5) / 1e5 } : undefined;
  const base = { method, ...(point ? { point } : {}) };
  if (input.when === 'asap') {
    if (!isOpen(shop.hours, now)) return fail(`Do‘kon hozir yopiq (ish vaqti ${hoursLabel(shop.hours)}). Aniq vaqtni tanlang.`);
    return { ok: true, delivery: { ...base, when: 'asap' }, legacy: 'soon' };
  }
  if (!input.date || !input.from || !input.to) return fail('Sana va vaqt oralig‘ini tanlang.');
  const today = tashkentDate(now);
  if (input.date < today || input.date > addDays(today, MAX_DAYS)) return fail(`Sana bugundan boshlab ${MAX_DAYS} kun ichida bo‘lsin.`);
  const { start, end } = slotRange(input.date, input.from, input.to);
  const minutes = (end - start) / 60000;
  if (minutes < 30 || minutes > 360) return fail('Vaqt oralig‘i 30 daqiqadan 6 soatgacha bo‘lsin.');
  // the shop needs time to prepare: from now, or from its opening if it is closed right now
  const ready = new Date(Math.max(now.getTime(), nextOpen(shop.hours, now).getTime()) + LEAD_MINUTES * 60000);
  if (start < ready) return fail(`Tanlangan vaqt juda yaqin. Kamida ${LEAD_MINUTES} daqiqadan keyingi vaqtni tanlang.`);
  if (!isOpen(shop.hours, start) || !isOpen(shop.hours, new Date(end.getTime() - 60000))) return fail(`Tanlangan vaqt do‘kon ish vaqti (${hoursLabel(shop.hours)}) ichida emas.`);
  return { ok: true, delivery: { ...base, when: 'slot', date: input.date, from: input.from, to: input.to }, legacy: input.date === today ? 'today-evening' : 'tomorrow' };
}

/** Two-hour windows for one day, each flagged selectable or not (used by the checkout screen). */
export function slotOptions(shop, date, method, now = new Date()) {
  const open = toMinutes(shop.hours?.open) ?? 9 * 60;
  let close = toMinutes(shop.hours?.close) ?? 21 * 60;
  if (close <= open) close += 1440;
  const hhmm = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const out = [];
  for (let start = open; start + 60 <= close; start += 120) {
    const end = Math.min(start + 120, close);
    const slot = { from: hhmm(start), to: hhmm(end) };
    const check = validateDelivery({ method, when: 'slot', date, ...slot }, shop, now);
    out.push({ ...slot, ok: check.ok, reason: check.ok ? '' : check.error });
  }
  return out;
}

// What the shop reads in Telegram.
const money = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export function shopOrderText(order, now = new Date()) {
  const c = order.customer, pickup = order.delivery?.method === 'pickup';
  const items = order.items.map(i => `${i.name} × ${i.quantity} — ${money(i.price * i.quantity)} so‘m`).join('\n');
  const lines = [
    `GulBar · #${order.id.slice(0, 8)}`, items,
    pickup ? 'Do‘kondan olib ketadi (yetkazish yo‘q)' : `Yetkazish: ${money(order.deliveryFee)} so‘m`,
    `Jami: ${money(order.total)} so‘m`, ...paymentLines(order),
    `Buyurtmachi: ${c.name}, ${c.phone}`,
    pickup ? `Olib ketuvchi: ${c.recipient}, ${c.recipientPhone}` : `Qabul qiluvchi: ${c.recipient}, ${c.recipientPhone}`,
    pickup ? 'Manzil: do‘kon ichida topshiriladi' : `Manzil: ${c.address}`,
    `${pickup ? 'Olib ketish vaqti' : 'Vaqt'}: ${deliveryLabel(order, now)}`,
  ];
  if (order.delivery?.point) lines.push(`Xarita: https://www.google.com/maps?q=${order.delivery.point.lat},${order.delivery.point.lng}`);
  const card = cardNames[c.cardStyle] || '';
  lines.push(c.note ? `Tabrik kartasi${card ? ` (${card})` : ''}: ${c.note}${c.cardFrom ? `\nKimdan: ${c.cardFrom}` : ''}` : 'Tabrik: yo‘q');
  lines.push(`Anonim: ${c.anonymous ? 'Ha, yuboruvchini aytmang' : 'Yo‘q'}`);
  if (order.afterHours) lines.push('', 'Ish vaqtidan tashqari buyurtma: do‘kon ochilgach javob bering.');
  return lines.join('\n');
}
