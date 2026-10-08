// Complaints, questions and suggestions from buyers. Works on the same `store` abstraction as accounts.js,
// so the Node server and the Cloudflare Worker share one implementation.
import { z } from 'zod';
export const kindNames = { complaint: 'Shikoyat', question: 'Savol', suggestion: 'Taklif' };
export const supportSchema = z.object({
  kind: z.enum(['complaint', 'question', 'suggestion']),
  message: z.string().trim().min(5, 'Xabar kamida 5 belgidan iborat bo‘lsin.').max(1000, 'Xabar 1000 belgidan oshmasin.'),
  orderId: z.string().trim().max(80).optional(),
});
export const supportUpdateSchema = z.object({
  status: z.enum(['new', 'done']).optional(),
  reply: z.string().trim().max(1000, 'Javob 1000 belgidan oshmasin.').optional(),
}).refine(v => v.status !== undefined || v.reply !== undefined, 'Holat yoki javobni kiriting.');
export const supportTableSql = `CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL, order_id TEXT, shop_id TEXT,
  status TEXT NOT NULL DEFAULT 'new', reply TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS support_customer ON support_tickets(customer_id, created_at);
CREATE INDEX IF NOT EXISTS support_status ON support_tickets(status, created_at);`;
const fail = (error, status = 400) => ({ status, data: { error } });
const DAILY_LIMIT = 5;

/** @returns {Promise<{ status: number, data: any, ticket?: { id: string, kind: 'complaint' | 'question' | 'suggestion', message: string, orderShort: string, shopName: string } }>} */
export async function createTicket(store, customerId, input) {
  const since = new Date(Date.now() - 86400000).toISOString();
  const recent = await store.first('SELECT COUNT(*) AS n FROM support_tickets WHERE customer_id=? AND created_at>?', [customerId, since]);
  if (Number(recent?.n || 0) >= DAILY_LIMIT) return fail('Bugun juda ko‘p murojaat yubordingiz. Iltimos, ertaga yozing yoki javobni kuting.', 429);
  let order = null;
  if (input.orderId) {
    const row = await store.first('SELECT data FROM orders WHERE id=? AND customer_id=?', [input.orderId, customerId]);
    if (!row) return fail('Buyurtma topilmadi.', 404);
    order = JSON.parse(row.data);
  }
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await store.batch([['INSERT INTO support_tickets VALUES (?,?,?,?,?,?,\'new\',\'\',?,?)', [id, customerId, input.kind, input.message, order?.id || null, order?.shopId || null, now, now]]]);
  return { status: 201, data: { id }, ticket: { id, kind: input.kind, message: input.message, orderShort: order ? order.id.slice(0, 8) : '', shopName: order?.shopName || '' } };
}

export async function listMine(store, customerId) {
  const rows = await store.all('SELECT id, kind, message, order_id AS orderId, status, reply, created_at AS createdAt FROM support_tickets WHERE customer_id=? ORDER BY created_at DESC LIMIT 20', [customerId]);
  return { status: 200, data: rows.map(r => ({ ...r })) };
}

export async function adminList(store) {
  const rows = await store.all(`SELECT t.id, t.customer_id, t.kind, t.message, t.order_id, t.status, t.reply, t.created_at, o.data AS order_data
    FROM support_tickets t LEFT JOIN orders o ON o.id=t.order_id ORDER BY (t.status='new') DESC, t.created_at DESC LIMIT 100`);
  return { status: 200, data: rows.map(r => {
    const order = r.order_data ? JSON.parse(r.order_data) : null;
    return { id: r.id, kind: r.kind, message: r.message, status: r.status, reply: r.reply, createdAt: r.created_at,
      orderShort: order ? order.id.slice(0, 8) : '', shopName: order?.shopName || '', contact: order ? `${order.customer.name}, ${order.customer.phone}` : '',
      canReplyInTelegram: /^\d{1,16}$/.test(r.customer_id) };
  }) };
}

export async function adminUpdate(store, id, body, hooks = {}) {
  const parsed = supportUpdateSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const row = await store.first('SELECT * FROM support_tickets WHERE id=?', [id]);
  if (!row) return fail('Murojaat topilmadi.', 404);
  const reply = parsed.data.reply ?? row.reply;
  const status = parsed.data.status ?? (parsed.data.reply ? 'done' : row.status);
  await store.batch([['UPDATE support_tickets SET status=?, reply=?, updated_at=? WHERE id=?', [status, reply, new Date().toISOString(), id]]]);
  if (reply && reply !== row.reply && hooks.notify) await hooks.notify(row.customer_id, `GulBar yordam xizmati javobi:\n\n${reply}`);
  return { status: 200, data: { id, status, reply } };
}

export const ticketAdminText = t => `Yangi murojaat — ${kindNames[t.kind]}${t.orderShort ? `\nBuyurtma #${t.orderShort}${t.shopName ? ` · ${t.shopName}` : ''}` : ''}\n\n${t.message}`;
