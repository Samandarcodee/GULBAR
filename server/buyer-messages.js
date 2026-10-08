// Telegram messages sent to the buyer when a shop acts on their order, and the SQL that expires unanswered orders.
// Plain text only (no parse_mode); order fields come from our own database, never from Telegram.
import { cardPayText } from './payment.js';
const money = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export function buyerMessage(order, status, { shopPhone = '', expired = false, minutes = 30, pay = /** @type {any} */ (null) } = {}) {
  const head = `${order.shopName} · #${String(order.id).slice(0, 8)}`;
  // a card order asks for the transfer right away; `minutes` is then the payment window
  if (status === 'accepted' && pay) return `Buyurtmangiz qabul qilindi ✅\n\n${head}\n${cardPayText(pay, minutes)}`;
  if (status === 'accepted') return `Buyurtmangiz qabul qilindi ✅\n\n${head}\nJami: ${money(order.total)} so‘m (to‘lov yetkazilganda)\n\nGullar tayyorlanmoqda. Yo‘lga chiqqanda yana xabar beramiz.`;
  if (status === 'delivering') return `Buyurtmangiz yo‘lda 🚚\n\n${head}\nDo‘kon gullarni manzilingizga yetkazmoqda.`;
  if (status === 'delivered') return `Gullar yetkazildi 🌷\n\n${head}\nXaridingiz uchun rahmat! Xizmatni baholab, boshqa xaridorlarga yordam bering.`;
  if (status === 'cancelled' && expired) return `Buyurtma bekor qilindi\n\n${head}\nDo‘kon ${minutes} daqiqa ichida javob bermadi, shuning uchun buyurtma avtomatik bekor qilindi. Iltimos, boshqa do‘kondan tanlab ko‘ring.`;
  if (status === 'cancelled') return `Buyurtma bekor qilindi\n\n${head}\nDo‘kon buyurtmani bajara olmadi.${shopPhone ? ` Aniqlashtirish uchun: ${shopPhone}` : ''}\nBoshqa guldastani tanlashingiz mumkin.`;
  return null;
}

export function shopExpiredMessage(order, minutes) {
  return `Buyurtma #${String(order.id).slice(0, 8)} ${minutes} daqiqa javobsiz qoldi va avtomatik bekor qilindi. Gullar qoldiqqa qaytarildi.`;
}

// Only a still-pending order can expire; the existing SQL trigger restocks the flowers exactly once.
export const FIND_EXPIRED_SQL = "SELECT id FROM orders WHERE json_extract(data,'$.status')='pending' AND COALESCE(json_extract(data,'$.respondFrom'), created_at)<? ORDER BY created_at LIMIT 20";
export const EXPIRE_SQL = "UPDATE orders SET data=json_set(data,'$.status','cancelled','$.updatedAt',?,'$.cancelReason','expired') WHERE id=? AND json_extract(data,'$.status')='pending'";
export const expiryMinutes = raw => Math.max(5, Number(raw) || 30);
