import { z } from 'zod';

// Paying the shop by card transfer, without a payment provider: the money goes straight to the shop's card, the shop
// checks its own bank app and confirms. The delivery fee is always cash for the courier (taxi) and is never part of the transfer.
export const DEFAULT_DUE_MINUTES = 30;

const digitsOnly = text => String(text).replace(/[\s-]/g, '');
function passesCheckDigit(number) {
  let sum = 0, double = false;
  for (let i = number.length - 1; i >= 0; i--) {
    let digit = Number(number[i]);
    if (double) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit; double = !double;
  }
  return sum % 10 === 0;
}
export const cardDetailsSchema = z.object({
  number: z.string().transform(digitsOnly).refine(n => /^\d{16}$/.test(n) && passesCheckDigit(n), 'Karta raqami 16 ta raqamdan iborat va to‘g‘ri yozilgan bo‘lsin.'),
  holder: z.string().trim().min(2, 'Karta egasining ismini yozing.').max(60, 'Ism juda uzun.'),
  bank: z.string().trim().max(40, 'Bank nomi juda uzun.').default(''),
});
export const maskCard = number => `${number.slice(0, 4)} •••• •••• ${number.slice(-4)}`;

const cardOrder = order => order?.payment?.method === 'card';
const fail = error => ({ ok: false, error });

/** Chooses the payment for a new order. Cash is the default; taxi shops need the flowers paid in advance.
 * @returns {{ ok: false, error: string } | { ok: true, payment: { method: 'cash' | 'card', status: string } }} */
export function choosePayment(input, shop, deliveryMethod) {
  const wantsCard = input?.method === 'card';
  if (wantsCard) {
    if (!shop?.acceptsCard) return fail('Bu do‘kon kartaga o‘tkazmani qabul qilmaydi. Naqd to‘lovni tanlang.');
    return { ok: true, payment: { method: 'card', status: 'unpaid' } };
  }
  if (deliveryMethod === 'delivery' && shop?.delivery === 'taxi') return fail('Taksi bilan yetkazishda gullar kartaga oldindan to‘lanadi. Yo‘l haqini taksi haydovchisiga naqd berasiz.');
  return { ok: true, payment: { method: 'cash', status: 'none' } };
}

/** What goes to the shop's card (the flowers) and what stays cash (the ride, or everything for a cash order). */
export const cardAmount = order => cardOrder(order) ? order.subtotal : 0;
export const cashDue = order => cardOrder(order) ? order.deliveryFee : order.total;

/** The card details a buyer may see: only while the shop waits for the money. */
export function payInfo(order, card, minutes = DEFAULT_DUE_MINUTES) {
  if (!card?.number || order?.status !== 'accepted' || !cardOrder(order) || !['unpaid', 'claimed'].includes(order.payment.status)) return null;
  return { card: card.number, holder: card.holder, bank: card.bank || '', amount: cardAmount(order), cash: cashDue(order), dueAt: Date.parse(order.updatedAt) + minutes * 60000, state: order.payment.status };
}

/** The buyer says the money was sent.
 * @returns {{ ok: false, error: string } | { ok: true, order: any }} */
export function claimPayment(order, note, now) {
  if (order?.status !== 'accepted' || !cardOrder(order)) return fail('Bu buyurtma uchun to‘lov hozir so‘ralmaydi.');
  if (order.payment.status !== 'unpaid') return fail('To‘lov haqida xabar allaqachon yuborilgan.');
  const text = String(note || '').trim().slice(0, 40);
  return { ok: true, order: { ...order, payment: { ...order.payment, status: 'claimed', claimedAt: now.toISOString(), ...(text ? { note: text } : {}) } } };
}

/** The shop answers: money arrived, money did not arrive, or the money was returned after a cancellation.
 * @returns {{ ok: false, error: string } | { ok: true, order: any }} */
export function decidePayment(order, action, now) {
  if (!cardOrder(order)) return fail('Bu buyurtma kartaga o‘tkazma bilan to‘lanmaydi.');
  const when = now.toISOString(), payment = order.payment;
  if (action === 'confirm') {
    if (order.status !== 'accepted' || !['unpaid', 'claimed'].includes(payment.status)) return fail('To‘lovni hozir tasdiqlab bo‘lmaydi.');
    return { ok: true, order: { ...order, payment: { ...payment, status: 'confirmed', confirmedAt: when } } };
  }
  if (action === 'reject') {
    if (order.status !== 'accepted' || payment.status !== 'claimed') return fail('Rad etiladigan to‘lov xabari yo‘q.');
    // updatedAt marks the start of the payment window, so a rejection gives the buyer a fresh deadline
    return { ok: true, order: { ...order, updatedAt: when, payment: { method: 'card', status: 'unpaid', rejectedAt: when } } };
  }
  if (action === 'refunded') {
    if (!refundDue(order)) return fail('Qaytariladigan to‘lov yo‘q.');
    return { ok: true, order: { ...order, payment: { ...payment, refundedAt: when } } };
  }
  return fail('Noma’lum amal.');
}

/** A card order may leave the shop only after the money is confirmed.
 * @returns {{ ok: false, error: string } | { ok: true }} */
export function advanceCheck(order, next) {
  if (['delivering', 'delivered'].includes(next) && cardOrder(order) && order.payment.status !== 'confirmed') return fail('Avval pul tushganini tasdiqlang («Pul tushdi»), keyin yo‘lga chiqaring.');
  return { ok: true };
}

export const refundDue = order => order?.status === 'cancelled' && cardOrder(order) && order.payment.status === 'confirmed' && !order.payment.refundedAt;

/** The order as the buyer or the shop sees it: with the card details (buyer, while paying) and the refund flag. */
export const decorateOrder = (order, card, minutes) => ({ ...order, payInfo: payInfo(order, card, minutes), refundDue: refundDue(order) });

// The card lives in its own table, away from the public shop record, so it can never leak through the catalog.
export const shopCardsTableSql = `CREATE TABLE IF NOT EXISTS shop_cards (
  shop_id TEXT PRIMARY KEY REFERENCES shops(id), number TEXT NOT NULL, holder TEXT NOT NULL, bank TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
)`;
export const SAVE_CARD_SQL = `INSERT INTO shop_cards(shop_id,number,holder,bank,updated_at) VALUES (?,?,?,?,?)
  ON CONFLICT(shop_id) DO UPDATE SET number=excluded.number,holder=excluded.holder,bank=excluded.bank,updated_at=excluded.updated_at`;

export const paymentSettingsSchema = z.object({
  acceptsCard: z.boolean(),
  delivery: z.enum(['own', 'taxi']).default('own'),
  card: cardDetailsSchema.optional(),
}).superRefine((value, ctx) => {
  if (value.delivery === 'taxi' && !value.acceptsCard) ctx.addIssue({ code: 'custom', message: 'Taksi bilan yetkazish uchun kartaga o‘tkazma yoqilgan bo‘lishi kerak: gullar pulini oldindan olasiz.' });
});
// ---- Telegram texts (plain text, no parse_mode) ----
const money = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const head = order => `${order.shopName} · #${String(order.id).slice(0, 8)}`;
export const formatCard = number => String(number).replace(/(\d{4})(?=\d)/g, '$1 ');

/** What the buyer must do once the shop accepted a card order. */
export function cardPayText(info, minutes = DEFAULT_DUE_MINUTES) {
  const lines = [
    `Gullar uchun ${money(info.amount)} so‘m to‘lang.`,
    `Karta: ${formatCard(info.card)}`,
    `Karta egasi: ${info.holder}${info.bank ? ` · ${info.bank}` : ''}`,
    `Muddat: ${minutes} daqiqa ichida. Kartaga o‘tkazgach ilovada «To‘ladim» tugmasini bosing.`,
  ];
  if (info.cash > 0) lines.push(`Yo‘l haqi ${money(info.cash)} so‘m taksi haydovchisiga naqd beriladi.`);
  return lines.join('\n');
}
/** The how-it-is-paid lines in the order message the shop receives. */
export function paymentLines(order) {
  if (order?.payment?.method !== 'card') return ['To‘lov yetkazilganda'];
  const lines = [`To‘lov: Kartaga o‘tkazma. Gullar uchun ${money(cardAmount(order))} so‘m (qabul qilgach mijozga kartangiz ko‘rsatiladi)`];
  if (cashDue(order) > 0) lines.push(`Yo‘l haqi ${money(cashDue(order))} so‘m: yetkazgan haydovchiga naqd`);
  return lines;
}
export function buyerPaymentMessage(order, event, { shopPhone = '', minutes = DEFAULT_DUE_MINUTES } = {}) {
  if (event === 'confirmed') return `To‘lov tasdiqlandi ✅\n\n${head(order)}\nGullar tayyorlanmoqda.`;
  if (event === 'rejected') return `Do‘kon to‘lovni ko‘rmadi\n\n${head(order)}\nO‘tkazmani bank ilovangizda tekshiring va ilovada «To‘ladim» tugmasini qayta bosing. To‘lov qilgan bo‘lsangiz, do‘kon bilan bog‘laning${shopPhone ? `: ${shopPhone}` : ''}.\nYangi muddat: ${minutes} daqiqa.`;
  if (event === 'refunded') return `Pulingiz qaytarildi 💸\n\n${head(order)}\nDo‘kon to‘lovni qaytarganini bildirdi.`;
  if (event === 'unpaid') return `Buyurtma bekor qilindi\n\n${head(order)}\nTo‘lov ${minutes} daqiqa ichida to‘lanmadi, shuning uchun buyurtma bekor qilindi. Gullar qoldiqqa qaytarildi.`;
  return null;
}
export function shopClaimText(order) {
  const note = order.payment?.note;
  return `To‘lov xabari · #${String(order.id).slice(0, 8)}\n${order.customer.name} gullar uchun ${money(cardAmount(order))} so‘m kartangizga o‘tkazganini aytdi.\nBank ilovangizda tekshiring.${note ? `\nIzoh: ${note}` : ''}`;
}
export const shopUnpaidMessage = (order, minutes = DEFAULT_DUE_MINUTES) => `Buyurtma #${String(order.id).slice(0, 8)} uchun to‘lov ${minutes} daqiqa ichida kelmadi va buyurtma bekor qilindi. Gullar qoldiqqa qaytarildi.`;

// A card order that sat unpaid after the shop accepted it: updatedAt is the start of the payment window.
export const FIND_UNPAID_SQL = "SELECT id FROM orders WHERE json_extract(data,'$.status')='accepted' AND json_extract(data,'$.payment.method')='card' AND json_extract(data,'$.payment.status')='unpaid' AND json_extract(data,'$.updatedAt')<? ORDER BY created_at LIMIT 20";
export const EXPIRE_UNPAID_SQL = "UPDATE orders SET data=json_set(data,'$.status','cancelled','$.updatedAt',?,'$.cancelReason','unpaid') WHERE id=? AND json_extract(data,'$.status')='accepted' AND json_extract(data,'$.payment.method')='card' AND json_extract(data,'$.payment.status')='unpaid' AND json_extract(data,'$.updatedAt')<?";
export const dueMinutes = raw => Math.max(5, Number(raw) || DEFAULT_DUE_MINUTES);

export const paymentDecisionSchema = z.object({ action: z.enum(['confirm', 'reject', 'refunded']) });
export const paymentClaimSchema = z.object({ note: z.string().max(200).optional() });
