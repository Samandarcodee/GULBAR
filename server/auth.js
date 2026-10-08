import { createHmac, timingSafeEqual } from 'node:crypto';

export function secureEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Telegram only signs the launch time once; a Mini App that stays open for hours must keep working, so the window is a day.
export const MAX_AGE_SECONDS = 24 * 3600;
/** A real Telegram buyer is stored as `tg:<id>`; the bare id is what the Bot API needs as chat_id. Demo visitors have none. */
export function telegramUserId(customerId) {
  const match = /^tg:(\d{1,16})$/.exec(String(customerId ?? ''));
  return match ? match[1] : '';
}

/**
 * What the signed-in Telegram user may be shown: the admin link for the admin, the shop-panel link for shop owners.
 * This only decides which links appear; the panels themselves still ask for a login.
 * @param {string | undefined} customerId stored as `tg:<id>`
 * @param {string | undefined} adminChatId the admin's Telegram id (ADMIN_CHAT_ID)
 * @param {{ shop_id: string, chat_id: string }[]} shopChats
 */
export function roleFor(customerId, adminChatId, shopChats) {
  const id = telegramUserId(customerId);
  if (!id) return { admin: false, shops: /** @type {string[]} */ ([]) };
  return { admin: !!adminChatId && id === String(adminChatId), shops: shopChats.filter(s => s.chat_id && String(s.chat_id) === id).map(s => s.shop_id) };
}

export function validateTelegram(raw, token, now = Date.now()) {
  if (!raw || !token || raw.length > 16000) throw new Error('Telegram orqali qayta kiring.');
  const params = new URLSearchParams(raw);
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) throw new Error('Telegram ma’lumotlari noto‘g‘ri.');
  const hash = params.get('hash');
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const expected = createHmac('sha256', secret).update(check).digest('hex');
  if (!secureEqual(hash, expected)) throw new Error('Telegram tasdig‘i noto‘g‘ri.');
  const date = Number(params.get('auth_date'));
  const age = Math.floor(now / 1000) - date;
  if (!Number.isInteger(date) || age < -30 || age > MAX_AGE_SECONDS) throw new Error('Sessiya tugadi. Mini App’ni qayta oching.');
  let user;
  try { user = JSON.parse(params.get('user') || 'null'); } catch { throw new Error('Telegram foydalanuvchisi topilmadi.'); }
  if (!Number.isSafeInteger(user?.id) || user.id <= 0) throw new Error('Telegram foydalanuvchisi topilmadi.');
  return { id: `tg:${user.id}`, name: user.first_name || '', telegramId: user.id };
}
