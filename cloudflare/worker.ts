import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { roleFor, secureEqual, telegramUserId, validateTelegram } from '../server/auth.js';
import { commandReply, telegramParameters } from '../server/telegram-commands.js';
import { isOpen, nextOpen, hoursLabel } from '../server/hours.js';
import { validateDelivery, shopOrderText } from '../server/delivery.js';
import { supportSchema, createTicket, listMine, ticketAdminText } from '../server/support.js';
import { reviewSchema, reviewerName, INSERT_REVIEW_SQL, RATINGS_SQL, SHOP_RATING_SQL, SHOP_REVIEWS_SQL, PHONES_SQL, decorateShops } from '../server/reviews.js';
import { buyerMessage, shopExpiredMessage, EXPIRE_SQL, FIND_EXPIRED_SQL, expiryMinutes } from '../server/buyer-messages.js';
import { accountStore, accountAccess, accountRequest } from '../server/accounts.js';
import { imageType, MAX_IMAGE_BYTES } from '../server/images.js';
import { orderSchema, productSchema, shopSchema, shopSettingsSchema, statusNames } from '../server/schemas.js';
import { advanceCheck, buyerPaymentMessage, choosePayment, claimPayment, decidePayment, decorateOrder, dueMinutes, EXPIRE_UNPAID_SQL, FIND_UNPAID_SQL, maskCard, payInfo, paymentClaimSchema, paymentDecisionSchema, paymentSettingsSchema, SAVE_CARD_SQL, shopClaimText, shopUnpaidMessage } from '../server/payment.js';
import type { Product, Shop, Order } from '../src/types';

type WorkerEnv = Env & Partial<Record<'DEMO_MERCHANT_TOKEN' | 'ADMIN_TOKEN' | 'TELEGRAM_BOT_TOKEN' | 'TELEGRAM_WEBHOOK_SECRET' | 'SHOP_CHAT_IDS' | 'MERCHANT_TOKENS' | 'APP_URL' | 'PENDING_EXPIRY_MINUTES' | 'PAYMENT_DUE_MINUTES' | 'ADMIN_CHAT_ID', string>>;
type Bindings = { Bindings: WorkerEnv; Variables: { customerId: string } };
type C = Context<Bindings>;
type Row = { data: string };
const app = new Hono<Bindings>();
const decode = <T>(row: Row | null): T | null => row ? JSON.parse(row.data) as T : null;
const demo = (env: WorkerEnv) => String(env.DEMO_MODE) === 'true';
const mapping = (raw: string | undefined): Record<string, string> => raw ? JSON.parse(raw) : {};
const bearer = (c: C) => (c.req.header('Authorization') || '').replace(/^Bearer /, '');
const shopById = async (env: WorkerEnv, id: string) => decode<Shop>(await env.DB.prepare('SELECT data FROM shops WHERE id=?').bind(id).first<Row>());
const orderById = async (env: WorkerEnv, id: string) => decode<Order>(await env.DB.prepare('SELECT data FROM orders WHERE id=?').bind(id).first<Row>());
type Card = { number: string; holder: string; bank: string };
const cardOf = (env: WorkerEnv, shopId: string) => env.DB.prepare('SELECT number, holder, bank FROM shop_cards WHERE shop_id=?').bind(shopId).first<Card>();
// Writes the new order only if nobody changed it since it was read (compare-and-swap on the stored JSON).
async function saveIfUnchanged(env: WorkerEnv, before: string, next: Order) {
  const written = await env.DB.prepare('UPDATE orders SET data=? WHERE id=? AND data=?').bind(JSON.stringify(next), next.id, before).run();
  return written.meta.changes > 0;
}

app.get('/api/images/:id', async c => {
  const row = await c.env.DB.prepare('SELECT content_type,body FROM images WHERE id=?').bind(c.req.param('id')).first<{ content_type: string; body: number[] }>();
  if (!row) return c.json({ error: 'Rasm topilmadi.' }, 404);
  return new Response(new Uint8Array(row.body), { headers: { 'Content-Type': row.content_type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=31536000, immutable' } });
});
app.use('/api/*', (c, next) => bodyLimit({ maxSize: c.req.method === 'POST' && /^\/api\/merchant\/[^/]+\/images$/.test(c.req.path) ? MAX_IMAGE_BYTES : 32768, onError: c => c.json({ error: 'So‘rov juda katta.' }, 413) })(c, next));
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  const ip = c.req.header('CF-Connecting-IP') || 'local';
  const rate = await c.env.API_LIMITER.limit({ key: ip });
  if (!rate.success) return c.json({ error: 'So‘rovlar juda ko‘p. Birozdan keyin urinib ko‘ring.' }, 429);
  const mode = await c.env.DB.prepare("SELECT value FROM metadata WHERE key='mode'").first<{ value: string }>();
  if (!mode || mode.value !== (demo(c.env) ? 'demo' : 'live')) return c.json({ error: 'Baza rejimi sozlanmagan.' }, 503);
  await next();
});
const customer: MiddlewareHandler<Bindings> = async (c, next) => {
  try {
    if (demo(c.env)) {
      const id = c.req.header('X-Demo-User');
      if (!id || !/^[a-zA-Z0-9-]{16,80}$/.test(id)) return c.json({ error: 'Demo sessiyasi topilmadi.' }, 401);
      c.set('customerId', `demo:${id}`);
    } else c.set('customerId', validateTelegram(c.req.header('X-Telegram-Init-Data'), c.env.TELEGRAM_BOT_TOKEN).id);
  } catch { return c.json({ error: 'Telegram orqali qayta kiring.' }, 401); }
  await next();
};
app.use('/api/me', customer);
app.use('/api/orders', customer);
app.use('/api/orders/:id/review', customer);
app.use('/api/orders/:id/cancel', customer);
app.use('/api/orders/:id/payment', customer);
app.use('/api/support', customer);
app.use('/api/merchant/:shopId/*', async (c, next) => {
  if (await accountAccess(accountStore(c.env.DB, true), bearer(c), 'merchant', c.req.param('shopId'))) { await next(); return; }
  const expected = demo(c.env) ? c.env.DEMO_MERCHANT_TOKEN : mapping(c.env.MERCHANT_TOKENS)[c.req.param('shopId')];
  if (!secureEqual(bearer(c), expected)) return c.json({ error: 'Do‘kon kirish kaliti noto‘g‘ri.' }, 401);
  await next();
});
app.use('/api/admin/*', async (c, next) => {
  if (!secureEqual(bearer(c), c.env.ADMIN_TOKEN) && !await accountAccess(accountStore(c.env.DB, true), bearer(c), 'admin')) return c.json({ error: 'Admin sifatida kiring.' }, 401);
  await next();
});
app.all('/api/auth/*', async c => {
  if (c.req.path === '/api/auth/login') {
    const limited = await c.env.LOGIN_LIMITER.limit({ key: c.req.header('CF-Connecting-IP') || 'local' });
    if (!limited.success) return c.json({ error: 'Kirish urinishlari ko‘p. Bir daqiqadan keyin urinib ko‘ring.' }, 429);
  }
  const result = await accountRequest(accountStore(c.env.DB, true), c.req.path.slice(4), c.req.method, c.req.method === 'POST' ? await c.req.json() : undefined, bearer(c));
  return c.json(result.data, result.status as 200);
});
app.all('/api/admin/*', async (c, next) => {
  if (c.req.path === '/api/admin/shops' && c.req.method === 'POST') { await next(); return; }
  const result = await accountRequest(accountStore(c.env.DB, true), c.req.path.slice(4), c.req.method, ['POST', 'PATCH'].includes(c.req.method) ? await c.req.json() : undefined, bearer(c), true,
    { notify: async (chatId: string, text: string) => { if (c.env.TELEGRAM_BOT_TOKEN && /^\d{1,16}$/.test(chatId)) await telegram(c.env, 'sendMessage', { chat_id: chatId, text }).catch(() => {}); } });
  return c.json(result.data, result.status as 200);
});
const shopChatId = async (env: WorkerEnv, id: string) => (await env.DB.prepare('SELECT chat_id FROM shop_private WHERE shop_id=?').bind(id).first<{ chat_id: string }>())?.chat_id || mapping(env.SHOP_CHAT_IDS)[id];

app.get('/api/health', c => c.json({ ok: true, demo: demo(c.env), platform: 'cloudflare' }));
app.post('/api/merchant/:shopId/images', async c => {
  const shopId = c.req.param('shopId');
  if (!await shopById(c.env, shopId)) return c.json({ error: 'Do‘kon topilmadi.' }, 404);
  const body = await c.req.arrayBuffer();
  const type = imageType(new Uint8Array(body));
  if (!type) return c.json({ error: 'JPG, PNG yoki WebP rasm tanlang (1 MB gacha).' }, 400);
  const id = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO images VALUES (?,?,?,?,?)').bind(id, shopId, type, body, new Date().toISOString()).run();
  return c.json({ url: `/api/images/${id}` }, 201);
});
app.get('/api/catalog', async c => {
  const result = await c.env.DB.batch<any>([c.env.DB.prepare('SELECT data FROM shops'), c.env.DB.prepare('SELECT data FROM products'), c.env.DB.prepare(RATINGS_SQL), c.env.DB.prepare(PHONES_SQL)]);
  const shops = decorateShops(result[0].results.map((r: Row) => decode<Shop>(r)!).filter((s: Shop) => s.active), result[2].results, result[3].results) as Shop[];
  const active = new Set(shops.map(s => s.id));
  const products = result[1].results.map((r: Row) => decode<Product>(r)!).filter((p: Product) => active.has(p.shopId) && p.active !== false);
  return c.json({ shops, products, demo: demo(c.env), merchantProtected: true });
});
// which panel links this person may see; the panels themselves still ask for a login
app.get('/api/me', async c => {
  if (demo(c.env)) return c.json({ admin: true, shops: (await c.env.DB.prepare('SELECT id FROM shops').all<{ id: string }>()).results.map(r => r.id) });
  const rows = (await c.env.DB.prepare('SELECT shop_id, chat_id FROM shop_private').all<{ shop_id: string; chat_id: string }>()).results;
  for (const [shop_id, chat_id] of Object.entries(mapping(c.env.SHOP_CHAT_IDS))) if (!rows.some(r => r.shop_id === shop_id)) rows.push({ shop_id, chat_id: String(chat_id) });
  return c.json(roleFor(c.get('customerId'), c.env.ADMIN_CHAT_ID, rows));
});
app.get('/api/orders', async c => {
  const result = await c.env.DB.prepare('SELECT data FROM orders WHERE customer_id=? ORDER BY created_at DESC LIMIT 100').bind(c.get('customerId')).all<Row>();
  const reviewed = new Set((await c.env.DB.prepare('SELECT order_id FROM reviews WHERE customer_id=?').bind(c.get('customerId')).all<{ order_id: string }>()).results.map(r => r.order_id));
  const cards = new Map((await c.env.DB.prepare("SELECT shop_id, number, holder, bank FROM shop_cards WHERE shop_id IN (SELECT DISTINCT json_extract(data,'$.shopId') FROM orders WHERE customer_id=?)").bind(c.get('customerId')).all<Card & { shop_id: string }>()).results.map(r => [r.shop_id, r] as const));
  const minutes = dueMinutes(c.env.PAYMENT_DUE_MINUTES);
  return c.json(result.results.map(r => { const o = decode<Order>(r)!; return { ...decorateOrder(o, cards.get(o.shopId) || null, minutes), reviewed: reviewed.has(o.id) }; }));
});
app.post('/api/orders/:id/cancel', async c => {
  const id = c.req.param('id'), cid = c.get('customerId');
  const order = decode<Order>(await c.env.DB.prepare('SELECT data FROM orders WHERE id=? AND customer_id=?').bind(id, cid).first<Row>());
  if (!order) return c.json({ error: 'Buyurtma topilmadi.' }, 404);
  if (order.status === 'cancelled') return c.json(order);
  const refuse = async () => {
    const phone = (await c.env.DB.prepare('SELECT phone FROM shop_private WHERE shop_id=?').bind(order.shopId).first<{ phone: string }>())?.phone || '';
    return c.json({ error: 'Do‘kon buyurtmani allaqachon qabul qilgan, endi uni bu yerdan bekor qilib bo‘lmaydi.' + (phone ? ` Do‘kon bilan bog‘laning: ${phone}` : '') }, 409);
  };
  if (order.status !== 'pending') return refuse();
  // Only a still-pending order can be cancelled by the buyer; the SQL trigger gives the flowers back exactly once.
  const done = await c.env.DB.prepare("UPDATE orders SET data=json_set(data,'$.status','cancelled','$.updatedAt',?,'$.cancelledBy','customer','$.cancelReason','customer') WHERE id=? AND customer_id=? AND json_extract(data,'$.status')='pending'").bind(new Date().toISOString(), id, cid).run();
  if (!done.meta.changes) { const again = await orderById(c.env, id); return again?.status === 'cancelled' ? c.json(again) : refuse(); }
  await c.env.DB.prepare('UPDATE outbox SET sent_at=COALESCE(sent_at,?) WHERE order_id=?').bind(new Date().toISOString(), id).run();
  if (!demo(c.env) && c.env.TELEGRAM_BOT_TOKEN) c.executionCtx.waitUntil((async () => {
    const chat = await shopChatId(c.env, order.shopId);
    if (chat) await telegram(c.env, 'sendMessage', { chat_id: chat, text: `Xaridor buyurtmani bekor qildi: #${id.slice(0, 8)}. Gullar qoldiqqa qaytarildi.` }).catch(() => {});
  })());
  return c.json(await orderById(c.env, id));
});
app.post('/api/orders/:id/payment', async c => {
  const body = paymentClaimSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0].message }, 400);
  const row = await c.env.DB.prepare('SELECT data FROM orders WHERE id=? AND customer_id=?').bind(c.req.param('id'), c.get('customerId')).first<Row>();
  const order = decode<Order>(row);
  if (!row || !order) return c.json({ error: 'Buyurtma topilmadi.' }, 404);
  const claimed = claimPayment(order, body.data.note, new Date());
  if (!claimed.ok) return c.json({ error: claimed.error }, 409);
  if (!await saveIfUnchanged(c.env, row.data, claimed.order)) return c.json({ error: 'Buyurtma yangilandi. Qayta urinib ko‘ring.' }, 409);
  c.executionCtx.waitUntil(tellShopAboutClaim(c.env, claimed.order));
  return c.json(decorateOrder(claimed.order, await cardOf(c.env, order.shopId), dueMinutes(c.env.PAYMENT_DUE_MINUTES)));
});
app.post('/api/support', async c => {
  const body = supportSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.issues[0].message }, 400);
  const result = await createTicket(accountStore(c.env.DB, true), c.get('customerId'), body.data);
  if (result.ticket && c.env.ADMIN_CHAT_ID && c.env.TELEGRAM_BOT_TOKEN) c.executionCtx.waitUntil(telegram(c.env, 'sendMessage', { chat_id: c.env.ADMIN_CHAT_ID, text: ticketAdminText(result.ticket) }).catch(() => {}));
  return c.json(result.data, result.status as 201);
});
app.get('/api/support', async c => c.json((await listMine(accountStore(c.env.DB, true), c.get('customerId'))).data));
app.post('/api/orders/:id/review', async c => {
  const body = reviewSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.issues[0].message }, 400);
  const row = await c.env.DB.prepare('SELECT data FROM orders WHERE id=? AND customer_id=?').bind(c.req.param('id'), c.get('customerId')).first<Row>();
  const order = decode<Order>(row);
  if (!order) return c.json({ error: 'Buyurtma topilmadi.' }, 404);
  if (order.status !== 'delivered') return c.json({ error: 'Sharh faqat yetkazilgan buyurtmaga qoldiriladi.' }, 409);
  try { await c.env.DB.prepare(INSERT_REVIEW_SQL).bind(crypto.randomUUID(), order.id, order.shopId, c.get('customerId'), reviewerName(order.customer?.name), body.data.rating, body.data.comment, new Date().toISOString()).run(); }
  catch { return c.json({ error: 'Bu buyurtmaga sharh allaqachon qoldirilgan.' }, 409); }
  return c.json({ ok: true }, 201);
});
app.get('/api/shops/:id/reviews', async c => {
  const id = c.req.param('id');
  const stats = await c.env.DB.prepare(SHOP_RATING_SQL).bind(id).first<{ avg: number | null; n: number }>();
  const items = await c.env.DB.prepare(SHOP_REVIEWS_SQL).bind(id).all();
  return c.json({ avg: stats?.n ? Number(stats.avg) : null, count: Number(stats?.n || 0), items: items.results });
});
app.post('/api/orders', async c => {
  const result = orderSchema.safeParse(await c.req.json());
  if (!result.success) return c.json({ error: result.error.issues[0].message }, 400);
  const input = result.data;
  const cid = c.get('customerId');
  const lookup = () => c.env.DB.prepare('SELECT data FROM orders WHERE customer_id=? AND request_key=?').bind(cid, input.requestKey).first<Row>();
  const existing = decode<Order>(await lookup());
  if (existing) return c.json(existing);
  const shop = await shopById(c.env, input.shopId);
  if (!shop?.active) return c.json({ error: 'Do‘kon hozir buyurtma qabul qilmayapti.' }, 400);
  const placedAt = new Date(), openNow = isOpen(shop.hours, placedAt);
  let chosen: ReturnType<typeof validateDelivery> | null = null;
  if (input.delivery) {
    const checked = validateDelivery(input.delivery, shop, placedAt);
    if (!checked.ok) return c.json({ error: checked.error }, 409);
    chosen = checked;
  } else if (!openNow && input.customer.deliveryTime !== 'tomorrow') return c.json({ error: `Do‘kon hozir yopiq (ish vaqti ${hoursLabel(shop.hours)}). Ertangi yetkazish uchun buyurtma bering.` }, 409);
  const payment = choosePayment(input.payment, shop, chosen?.ok ? chosen.delivery.method : 'delivery');
  if (!payment.ok) return c.json({ error: payment.error }, 409);
  const chatId = await shopChatId(c.env, shop.id);
  if (!demo(c.env) && (!c.env.TELEGRAM_BOT_TOKEN || !chatId)) return c.json({ error: 'Do‘konning Telegram kanali hali ulanmagan.' }, 503);
  const quantities = new Map<string, number>();
  for (const i of input.items) quantities.set(i.productId, (quantities.get(i.productId) || 0) + i.quantity);
  const productRows = await c.env.DB.prepare('SELECT data FROM products WHERE shop_id=?').bind(shop.id).all<Row>();
  const products = productRows.results.map(r => decode<Product>(r)!);
  const items: Order['items'] = [];
  for (const [productId, quantity] of quantities) {
    const p = products.find(p => p.id === productId);
    if (!p) return c.json({ error: 'Bitta buyurtma faqat bitta do‘konga tegishli.' }, 400);
    if (p.active === false) return c.json({ error: 'Bu gul hozir sotuvda emas.' }, 409);
    if (quantity > 20 || quantity > p.stock) return c.json({ error: `${p.name}: yetarli gul mavjud emas.` }, 409);
    items.push({ productId, quantity, name: p.name, image: p.image, price: p.price });
  }
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.price, 0);
  const order: Order = { id: crypto.randomUUID(), shopId: shop.id, shopName: shop.name, items, payment: payment.payment as Order['payment'],
    customer: { ...input.customer, ...(chosen?.ok ? { deliveryTime: chosen.legacy as Order['customer']['deliveryTime'] } : {}), ...(chosen?.ok && chosen.delivery.method === 'pickup' ? { address: `Olib ketish: ${shop.address}` } : {}) },
    ...(chosen?.ok ? { delivery: chosen.delivery } : {}),
    subtotal, deliveryFee: chosen?.ok && chosen.delivery.method === 'pickup' ? 0 : shop.deliveryFee, total: subtotal + (chosen?.ok && chosen.delivery.method === 'pickup' ? 0 : shop.deliveryFee), status: 'pending',
    demo: demo(c.env), createdAt: placedAt.toISOString(), notification: demo(c.env) ? 'demo' : 'queued',
    respondFrom: nextOpen(shop.hours, placedAt).toISOString(), afterHours: !openNow };
  const sql = c.env.DB.prepare(`INSERT INTO orders(id,customer_id,request_key,data,created_at)
    SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM orders WHERE customer_id=? AND request_key=?)`)
    .bind(order.id, cid, input.requestKey, JSON.stringify(order), order.createdAt, cid, input.requestKey);
  try {
    const statements = [sql];
    if (!demo(c.env)) statements.push(c.env.DB.prepare('INSERT OR IGNORE INTO outbox(order_id,chat_id) SELECT id,? FROM orders WHERE id=?').bind(String(chatId), order.id));
    const written = await c.env.DB.batch(statements);
    const saved = decode<Order>(await lookup());
    if (!demo(c.env)) c.executionCtx.waitUntil(flushOutbox(c.env));
    return c.json(saved, written[0].meta.changes ? 201 : 200);
  } catch {
    const saved = decode<Order>(await lookup());
    if (saved) return c.json(saved);
    return c.json({ error: 'Gul mavjudligi yoki narxi o‘zgardi. Katalogni yangilab, qayta urinib ko‘ring.' }, 409);
  }
});
app.get('/api/merchant/:shopId/workspace', async c => {
  const shop = await shopById(c.env, c.req.param('shopId'));
  if (!shop) return c.json({ error: 'Do‘kon topilmadi.' }, 404);
  const rows = await c.env.DB.prepare('SELECT data FROM products WHERE shop_id=?').bind(shop.id).all<Row>();
  return c.json({ shop, products: rows.results.map(r => decode<Product>(r)) });
});
app.patch('/api/merchant/:shopId/settings', async c => {
  const id = c.req.param('shopId');
  const row = await c.env.DB.prepare('SELECT data FROM shops WHERE id=?').bind(id).first<Row>();
  const shop = decode<Shop>(row);
  if (!shop || !row) return c.json({ error: 'Do‘kon topilmadi.' }, 404);
  const result = shopSettingsSchema.safeParse(await c.req.json());
  if (!result.success) return c.json({ error: result.error.issues[0].message }, 400);
  const updated = { ...shop, ...result.data };
  const written = await c.env.DB.prepare('UPDATE shops SET data=? WHERE id=? AND data=?').bind(JSON.stringify(updated), id, row.data).run();
  if (!written.meta.changes) return c.json({ error: 'Sozlamalar o‘zgardi. Panelni yangilang.' }, 409);
  return c.json(updated);
});
app.get('/api/merchant/:shopId/orders', async c => {
  const result = await c.env.DB.prepare("SELECT data FROM orders WHERE json_extract(data,'$.shopId')=? ORDER BY created_at DESC LIMIT 100").bind(c.req.param('shopId')).all<Row>();
  return c.json(result.results.map(r => decorateOrder(decode<Order>(r)!, null)));
});
async function changeStatus(env: WorkerEnv, order: Order, status: string, ctx?: { waitUntil(promise: Promise<unknown>): void }) {
  if (!Object.hasOwn(statusNames, status)) throw new Error('invalid_status');
  if (!advanceCheck(order, status).ok) throw new Error('payment_not_confirmed');
  // The SQL trigger validates the transition and restocks only once on cancellation.
  // a cancellation made from the shop side records why, so the buyer sees the reason
  const result = await env.DB.prepare(`UPDATE orders SET data=json_set(data,'$.status',?,'$.updatedAt',?${status === 'cancelled' ? ",'$.cancelReason','shop'" : ''}) WHERE id=? AND json_extract(data,'$.status')=? AND (? NOT IN ('delivering','delivered') OR json_extract(data,'$.payment.method') IS NOT 'card' OR json_extract(data,'$.payment.status')='confirmed')`)
    .bind(status, new Date().toISOString(), order.id, order.status, status).run();
  const current = await orderById(env, order.id);
  if (!result.meta.changes && current?.status !== status) throw new Error('status_changed');
  // Only the request that really changed the status tells the buyer, so a retry never sends a second message.
  if (result.meta.changes && current && ctx) ctx.waitUntil(notifyBuyer(env, current, status));
  return current;
}
app.patch('/api/merchant/:shopId/orders/:id', async c => {
  const order = await orderById(c.env, c.req.param('id'));
  if (!order || order.shopId !== c.req.param('shopId')) return c.json({ error: 'Buyurtma topilmadi.' }, 404);
  const body: { status?: unknown } = await c.req.json();
  if (typeof body.status !== 'string') return c.json({ error: 'Holat noto‘g‘ri.' }, 400);
  const gate = advanceCheck(order, body.status);
  if (!gate.ok) return c.json({ error: gate.error }, 409);
  try { return c.json(decorateOrder((await changeStatus(c.env, order, body.status, c.executionCtx))!, null)); }
  catch { return c.json({ error: 'Bu holatga o‘tish mumkin emas. Buyurtmani yangilang.' }, 409); }
});
// the shop answers about the money: it arrived, it did not, or it was handed back after a cancellation
async function applyPaymentDecision(env: WorkerEnv, id: string, shopId: string, action: 'confirm' | 'reject' | 'refunded', ctx?: { waitUntil(promise: Promise<unknown>): void }) {
  const row = await env.DB.prepare('SELECT data FROM orders WHERE id=?').bind(id).first<Row>();
  const order = decode<Order>(row);
  if (!row || !order || order.shopId !== shopId) return { status: 404 as const, body: { error: 'Buyurtma topilmadi.' } };
  const decided = decidePayment(order, action, new Date());
  if (!decided.ok) return { status: 409 as const, body: { error: decided.error } };
  if (!await saveIfUnchanged(env, row.data, decided.order)) return { status: 409 as const, body: { error: 'Buyurtma yangilandi. Panelni yangilang.' } };
  const shopPhone = (await env.DB.prepare('SELECT phone FROM shop_private WHERE shop_id=?').bind(shopId).first<{ phone: string }>())?.phone || '';
  const event = { confirm: 'confirmed', reject: 'rejected', refunded: 'refunded' }[action];
  const told = tellBuyer(env, decided.order, buyerPaymentMessage(decided.order, event, { shopPhone, minutes: dueMinutes(env.PAYMENT_DUE_MINUTES) }));
  if (ctx) ctx.waitUntil(told); else await told;
  return { status: 200 as const, body: decorateOrder(decided.order, null) };
}
app.post('/api/merchant/:shopId/orders/:id/payment', async c => {
  const body = paymentDecisionSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Amal noto‘g‘ri.' }, 400);
  const done = await applyPaymentDecision(c.env, c.req.param('id'), c.req.param('shopId'), body.data.action, c.executionCtx);
  return c.json(done.body, done.status);
});
app.get('/api/merchant/:shopId/payment', async c => {
  const shop = await shopById(c.env, c.req.param('shopId'));
  if (!shop) return c.json({ error: 'Do‘kon topilmadi.' }, 404);
  return c.json({ acceptsCard: !!shop.acceptsCard, delivery: shop.delivery || 'own', card: (await cardOf(c.env, shop.id)) || null });
});
app.put('/api/merchant/:shopId/payment', async c => {
  const id = c.req.param('shopId');
  const row = await c.env.DB.prepare('SELECT data FROM shops WHERE id=?').bind(id).first<Row>();
  const shop = decode<Shop>(row);
  if (!row || !shop) return c.json({ error: 'Do‘kon topilmadi.' }, 404);
  const parsed = paymentSettingsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0].message }, 400);
  const card = parsed.data.card || (await cardOf(c.env, id)) || null;
  if (parsed.data.acceptsCard && !card) return c.json({ error: 'Kartaga o‘tkazmani yoqish uchun karta ma’lumotlarini kiriting.' }, 400);
  const updated = { ...shop, acceptsCard: parsed.data.acceptsCard, delivery: parsed.data.delivery };
  const statements = [c.env.DB.prepare('UPDATE shops SET data=? WHERE id=? AND data=?').bind(JSON.stringify(updated), id, row.data)];
  if (parsed.data.card) statements.push(c.env.DB.prepare(SAVE_CARD_SQL).bind(id, parsed.data.card.number, parsed.data.card.holder, parsed.data.card.bank, new Date().toISOString()));
  const written = await c.env.DB.batch(statements);
  if (!written[0].meta.changes) return c.json({ error: 'Sozlamalar o‘zgardi. Panelni yangilang.' }, 409);
  // a swapped card is the classic way to divert customers' money, so the owner hears about every change
  if (parsed.data.card && c.env.ADMIN_CHAT_ID && c.env.TELEGRAM_BOT_TOKEN) c.executionCtx.waitUntil(telegram(c.env, 'sendMessage', { chat_id: c.env.ADMIN_CHAT_ID, text: `Do‘kon kartasi o‘zgartirildi: ${shop.name}\nYangi karta: ${maskCard(parsed.data.card.number)} · ${parsed.data.card.holder}` }).catch(() => {}));
  return c.json({ acceptsCard: parsed.data.acceptsCard, delivery: parsed.data.delivery, card });
});
app.post('/api/merchant/:shopId/products', async c => {
  const shopId = c.req.param('shopId');
  if (!await shopById(c.env, shopId)) return c.json({ error: 'Do‘kon topilmadi.' }, 404);
  const result = productSchema.safeParse(await c.req.json());
  if (!result.success) return c.json({ error: result.error.issues[0].message }, 400);
  const p = { ...result.data, id: crypto.randomUUID(), shopId };
  await c.env.DB.prepare('INSERT INTO products VALUES (?,?,?)').bind(p.id, shopId, JSON.stringify(p)).run();
  return c.json(p, 201);
});
app.patch('/api/merchant/:shopId/products/:id', async c => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT data FROM products WHERE id=? AND shop_id=?').bind(id, c.req.param('shopId')).first<Row>();
  const p = decode<Product>(row);
  if (!p || !row) return c.json({ error: 'Gul topilmadi.' }, 404);
  const body = await c.req.json<Record<string, unknown>>();
  if (body.expectedStock !== undefined && body.expectedStock !== p.stock) return c.json({ error: 'Qoldiq o‘zgardi. Gulni qayta ochib tahrirlang.' }, 409);
  const result = productSchema.safeParse({ ...p, ...body });
  if (!result.success) return c.json({ error: result.error.issues[0].message }, 400);
  const updated = { ...result.data, id, shopId: p.shopId };
  // Optimistic locking prevents an inventory reservation being overwritten by an old edit.
  const written = await c.env.DB.prepare('UPDATE products SET data=? WHERE id=? AND data=?').bind(JSON.stringify(updated), id, row.data).run();
  if (!written.meta.changes) return c.json({ error: 'Qoldiq yangilandi. Sahifani yangilab, qayta tahrirlang.' }, 409);
  return c.json(updated);
});
app.post('/api/admin/shops', async c => {
  const result = shopSchema.safeParse(await c.req.json());
  if (!result.success) return c.json({ error: result.error.issues[0].message }, 400);
  await c.env.DB.prepare('INSERT INTO shops VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').bind(result.data.id, JSON.stringify(result.data)).run();
  return c.json(result.data);
});

async function telegram(env: WorkerEnv, method: string, data: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(telegramParameters(data)), signal: AbortSignal.timeout(10000),
  });
  const result: { ok: boolean } = await response.json();
  if (!response.ok || !result.ok) throw new Error('telegram_delivery_failed');
}
type OutboxRow = { order_id: string; chat_id: string; attempts: number };
async function flushOutbox(env: WorkerEnv) {
  if (demo(env) || !env.TELEGRAM_BOT_TOKEN) return;
  const now = Date.now();
  const rows = await env.DB.prepare('SELECT order_id,chat_id,attempts FROM outbox WHERE sent_at IS NULL AND next_at<=? AND locked_until<=? LIMIT 5').bind(now, now).all<OutboxRow>();
  for (const row of rows.results) {
    const lease = crypto.randomUUID();
    const claimed = await env.DB.prepare('UPDATE outbox SET locked_until=?,lease_token=? WHERE order_id=? AND sent_at IS NULL AND locked_until<=?')
      .bind(now + 60000, lease, row.order_id, Date.now()).run();
    if (!claimed.meta.changes) continue;
    const order = await orderById(env, row.order_id);
    if (!order || order.status !== 'pending') {
      await env.DB.prepare('UPDATE outbox SET sent_at=? WHERE order_id=? AND lease_token=?').bind(new Date().toISOString(), row.order_id, lease).run(); continue;
    }
    try {
      await telegram(env, 'sendMessage', { chat_id: row.chat_id, text: shopOrderText(order),
        reply_markup: { inline_keyboard: [[{ text: 'Qabul qilish', callback_data: `order:${order.id}:accepted` }, { text: 'Bekor qilish', callback_data: `order:${order.id}:cancelled` }]] },
      });
      if (order.delivery?.point) await telegram(env, 'sendLocation', { chat_id: row.chat_id, latitude: order.delivery.point.lat, longitude: order.delivery.point.lng }).catch(() => {});
      await env.DB.batch([
        env.DB.prepare('UPDATE outbox SET sent_at=? WHERE order_id=? AND lease_token=?').bind(new Date().toISOString(), order.id, lease),
        env.DB.prepare("UPDATE orders SET data=json_set(data,'$.notification','sent') WHERE id=?").bind(order.id),
      ]);
    } catch {
      const attempts = row.attempts + 1;
      await env.DB.batch([
        env.DB.prepare('UPDATE outbox SET attempts=?,next_at=?,locked_until=0 WHERE order_id=? AND lease_token=?').bind(attempts, Date.now() + Math.min(600000, 5000 * 2 ** Math.min(attempts, 7)), order.id, lease),
        env.DB.prepare("UPDATE orders SET data=json_set(data,'$.notification','retrying') WHERE id=?").bind(order.id),
      ]);
    }
  }
}
// Best effort: a buyer who never started the bot cannot be messaged, and that must never break the order itself.
async function notifyBuyer(env: WorkerEnv, order: Order, status: string, extra: { expired?: boolean; minutes?: number } = {}) {
  if (demo(env) || order.demo || !env.TELEGRAM_BOT_TOKEN) return;
  try {
    const row = await env.DB.prepare('SELECT customer_id FROM orders WHERE id=?').bind(order.id).first<{ customer_id: string }>();
    const chatId = telegramUserId(row?.customer_id);
    if (!chatId) return;
    const shopPhone = (await env.DB.prepare('SELECT phone FROM shop_private WHERE shop_id=?').bind(order.shopId).first<{ phone: string }>())?.phone || '';
    const appUrl = env.APP_URL || 'https://gulbar.bella-rose.workers.dev';
    const minutes = dueMinutes(env.PAYMENT_DUE_MINUTES);
    const pay = status === 'accepted' ? payInfo(order, await cardOf(env, order.shopId), minutes) : null;
    const text = buyerMessage(order, status, { shopPhone, ...extra, ...(pay ? { pay, minutes } : {}) });
    if (!text) return;
    await telegram(env, 'sendMessage', { chat_id: chatId, text, reply_markup: { inline_keyboard: [status === 'delivered' ? [{ text: 'Baho berish', web_app: { url: `${appUrl}/?orders=1` } }, { text: 'GulBar’ni ochish', web_app: { url: appUrl } }] : [{ text: 'GulBar’ni ochish', web_app: { url: appUrl } }]] } });
  } catch { /* the buyer can still follow the order inside the app */ }
}

// Plain message to the buyer's Telegram chat (best effort, never breaks the order).
async function tellBuyer(env: WorkerEnv, order: Order, text: string | null) {
  if (!text || demo(env) || order.demo || !env.TELEGRAM_BOT_TOKEN) return;
  try {
    const row = await env.DB.prepare('SELECT customer_id FROM orders WHERE id=?').bind(order.id).first<{ customer_id: string }>();
    const chatId = telegramUserId(row?.customer_id);
    if (!chatId) return;
    const appUrl = env.APP_URL || 'https://gulbar.bella-rose.workers.dev';
    await telegram(env, 'sendMessage', { chat_id: chatId, text, reply_markup: { inline_keyboard: [[{ text: 'GulBar’ni ochish', web_app: { url: `${appUrl}/?orders=1` } }]] } });
  } catch { /* the buyer can still follow the order inside the app */ }
}
// The buyer says the money was sent: the shop gets two buttons to answer from Telegram.
async function tellShopAboutClaim(env: WorkerEnv, order: Order) {
  if (demo(env) || order.demo || !env.TELEGRAM_BOT_TOKEN) return;
  try {
    const chat = await shopChatId(env, order.shopId);
    if (!chat) return;
    await telegram(env, 'sendMessage', { chat_id: chat, text: shopClaimText(order),
      reply_markup: { inline_keyboard: [[{ text: 'Pul tushdi', callback_data: `pay:${order.id}:confirm` }, { text: 'Tushmadi', callback_data: `pay:${order.id}:reject` }]] } });
  } catch { /* the shop can still confirm in its panel */ }
}
// An accepted card order that stayed unpaid must not hold the flowers: cancel after PAYMENT_DUE_MINUTES (default 30).
async function expireUnpaid(env: WorkerEnv) {
  if (demo(env)) return;
  const minutes = dueMinutes(env.PAYMENT_DUE_MINUTES);
  const cutoff = new Date(Date.now() - minutes * 60000).toISOString();
  const due = await env.DB.prepare(FIND_UNPAID_SQL).bind(cutoff).all<{ id: string }>();
  for (const { id } of due.results) {
    try {
      const written = await env.DB.prepare(EXPIRE_UNPAID_SQL).bind(new Date().toISOString(), id, cutoff).run();
      if (!written.meta.changes) continue;
      const order = await orderById(env, id);
      if (!order) continue;
      await tellBuyer(env, order, buyerPaymentMessage(order, 'unpaid', { minutes }));
      const chat = await shopChatId(env, order.shopId);
      if (chat && env.TELEGRAM_BOT_TOKEN) await telegram(env, 'sendMessage', { chat_id: chat, text: shopUnpaidMessage(order, minutes) }).catch(() => {});
    } catch { /* picked up again by the next minute's run */ }
  }
}
// A shop that does not answer must not keep the flowers reserved forever: cancel after PENDING_EXPIRY_MINUTES (default 30).
async function expirePending(env: WorkerEnv) {
  if (demo(env)) return;
  const minutes = expiryMinutes(env.PENDING_EXPIRY_MINUTES);
  const cutoff = new Date(Date.now() - minutes * 60000).toISOString();
  const due = await env.DB.prepare(FIND_EXPIRED_SQL).bind(cutoff).all<{ id: string }>();
  for (const { id } of due.results) {
    try {
      const written = await env.DB.prepare(EXPIRE_SQL).bind(new Date().toISOString(), id).run();
      if (!written.meta.changes) continue;
      await env.DB.prepare('UPDATE outbox SET sent_at=COALESCE(sent_at,?) WHERE order_id=?').bind(new Date().toISOString(), id).run();
      const order = await orderById(env, id);
      if (!order) continue;
      await notifyBuyer(env, order, 'cancelled', { expired: true, minutes });
      const chat = await shopChatId(env, order.shopId);
      if (chat && env.TELEGRAM_BOT_TOKEN) await telegram(env, 'sendMessage', { chat_id: chat, text: shopExpiredMessage(order, minutes) }).catch(() => {});
    } catch { /* picked up again by the next minute's run */ }
  }
}
type TelegramUpdate = { message?: { text?: string; from?: { id: number }; chat: { id: number; type: string } }; callback_query?: { id: string; data?: string; from: { id: number }; message?: { message_id: number; chat: { id: number; type: string } } } };
app.post('/api/telegram/webhook', async c => {
  if (!c.env.TELEGRAM_BOT_TOKEN || !secureEqual(c.req.header('X-Telegram-Bot-Api-Secret-Token'), c.env.TELEGRAM_WEBHOOK_SECRET)) return c.json({ error: 'Unauthorized' }, 401);
  const update = await c.req.json<TelegramUpdate>();
  const reply = commandReply(update.message, new URL(c.req.url).origin, demo(c.env));
  if (reply) {
    try { await telegram(c.env, 'sendMessage', reply); return c.json({ ok: true }); }
    catch { return c.json({ error: 'Bot javobi yuborilmadi.' }, 503); }
  }
  const callback = update.callback_query;
  if (!callback) return c.json({ ok: true });
  if (demo(c.env)) return c.json({ error: 'Demo order callbacks are disabled.' }, 403);
  const pay = /^pay:([a-f0-9-]{36}):(confirm|reject)$/.exec(callback.data || '');
  if (pay) {
    const target = await orderById(c.env, pay[1]);
    const where = callback.message?.chat;
    if (!target || where?.type !== 'private' || String(where.id) !== String(await shopChatId(c.env, target.shopId)) || callback.from?.id !== where.id) return c.json({ error: 'Forbidden' }, 403);
    const done = await applyPaymentDecision(c.env, target.id, target.shopId, pay[2] as 'confirm' | 'reject', c.executionCtx);
    try {
      if (done.status === 200) await telegram(c.env, 'editMessageReplyMarkup', { chat_id: where.id, message_id: callback.message!.message_id,
        reply_markup: { inline_keyboard: pay[2] === 'confirm' ? [[{ text: statusNames.delivering, callback_data: `order:${target.id}:delivering` }]] : [] } });
      await telegram(c.env, 'answerCallbackQuery', { callback_query_id: callback.id, text: done.status === 200 ? (pay[2] === 'confirm' ? 'To‘lov tasdiqlandi' : 'Mijozdan to‘lovni qayta so‘radik') : 'Bu to‘lovni hozir o‘zgartirib bo‘lmaydi.' });
    } catch { /* best effort */ }
    return done.status === 200 ? c.json({ ok: true }) : c.json({ error: 'To‘lov yangilanmadi.' }, 409);
  }
  const match = /^order:([a-f0-9-]{36}):(accepted|cancelled|delivering|delivered)$/.exec(callback.data || '');
  const order = match ? await orderById(c.env, match[1]) : null;
  const chat = callback.message?.chat;
  if (!match || !order || chat?.type !== 'private' || String(chat.id) !== String(await shopChatId(c.env, order.shopId)) || callback.from?.id !== chat.id) return c.json({ error: 'Forbidden' }, 403);
  const gate = advanceCheck(order, match[2]);
  if (!gate.ok) {
    try { await telegram(c.env, 'answerCallbackQuery', { callback_query_id: callback.id, text: gate.error, show_alert: true }); } catch { /* best effort */ }
    return c.json({ error: gate.error }, 409);
  }
  try {
    const after = await changeStatus(c.env, order, match[2], c.executionCtx);
    const next: Record<string, string> = { accepted: 'delivering', delivering: 'delivered' };
    const status = next[match[2]];
    // a card order waits for the money before it can go out, so the next button is "Pul tushdi"
    const owed = match[2] === 'accepted' && after?.payment?.method === 'card' && after.payment.status !== 'confirmed';
    await telegram(c.env, 'editMessageReplyMarkup', { chat_id: chat.id, message_id: callback.message!.message_id,
      reply_markup: { inline_keyboard: owed ? [[{ text: 'Pul tushdi', callback_data: `pay:${order.id}:confirm` }]] : status ? [[{ text: statusNames[status as keyof typeof statusNames], callback_data: `order:${order.id}:${status}` }]] : [] } });
    await telegram(c.env, 'answerCallbackQuery', { callback_query_id: callback.id, text: statusNames[match[2] as keyof typeof statusNames] });
    return c.json({ ok: true });
  } catch {
    // Stops Telegram's loading spinner when the order has already moved on (for example it expired).
    try { await telegram(c.env, 'answerCallbackQuery', { callback_query_id: callback.id, text: 'Bu buyurtmaning holati allaqachon o‘zgargan.' }); } catch { /* best effort */ }
    return c.json({ error: 'Holat yangilanmadi.' }, 409);
  }
});
app.all('/api/*', c => c.json({ error: 'Manzil topilmadi.' }, 404));
app.onError((error, c) => {
  // Never log order bodies, addresses, telephone numbers or credential-bearing URLs.
  console.error(JSON.stringify({ event: 'request_failed', path: c.req.path, type: error.name }));
  if (error instanceof SyntaxError) return c.json({ error: 'So‘rov ma’lumoti noto‘g‘ri.' }, 400);
  return c.json({ error: 'Serverda xatolik. Qayta urinib ko‘ring.' }, 500);
});
export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
    if (new URL(request.url).pathname.startsWith('/api/')) return app.fetch(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
  async scheduled(_event: ScheduledController, env: WorkerEnv, _ctx: ExecutionContext) {
    await flushOutbox(env);
    await expirePending(env);
    await expireUnpaid(env);
  },
} satisfies ExportedHandler<WorkerEnv>;

