import express from 'express';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { orderSchema, productSchema, shopSchema, shopSettingsSchema, transitions, statusNames } from './schemas.js';
export { statusNames } from './schemas.js';
import { openDatabase } from './db.js';
import { secureEqual, validateTelegram } from './auth.js';
import { commandReply, telegramParameters } from './telegram-commands.js';
import { isOpen, nextOpen, hoursLabel } from './hours.js';
import { validateDelivery, shopOrderText } from './delivery.js';
import { supportSchema, createTicket, listMine, ticketAdminText } from './support.js';
import { reviewSchema, reviewerName, INSERT_REVIEW_SQL, RATINGS_SQL, SHOP_RATING_SQL, SHOP_REVIEWS_SQL, PHONES_SQL, decorateShops } from './reviews.js';
import { accountStore, accountAccess, accountRequest } from './accounts.js';
import { imageType, MAX_IMAGE_BYTES } from './images.js';
import { advanceCheck, choosePayment, claimPayment, decidePayment, decorateOrder, paymentClaimSchema, paymentDecisionSchema, paymentSettingsSchema, SAVE_CARD_SQL } from './payment.js';

const parse = row => row ? JSON.parse(row.data) : null;

export function createApp(config = {}) {
  const demo = config.demo === true;
  const botToken = config.botToken || '';
  const merchantTokens = config.merchantTokens || {};
  const chatIds = config.chatIds || {};
  const db = openDatabase(config.databasePath || ':memory:', demo);
  const app = express();
  const accounts = accountStore(db);
  app.disable('x-powered-by');
  app.get('/api/images/:id', (req, res) => {
    const row = db.prepare('SELECT content_type,body FROM images WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Rasm topilmadi.' });
    res.set({ 'Content-Type': row.content_type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=31536000, immutable' }).send(Buffer.from(row.body));
  });
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', rateLimit({ windowMs: 60000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'So‘rovlar juda ko‘p. Bir daqiqadan keyin qayta urinib ko‘ring.' } }));

  function customer(req, res, next) {
    try {
      if (demo) {
        const id = req.get('X-Demo-User');
        if (!id || !/^[a-zA-Z0-9-]{16,80}$/.test(id)) return res.status(401).json({ error: 'Demo sessiyasi topilmadi.' });
        req.customer = { id: `demo:${id}`, name: 'Mehmon' };
      } else req.customer = validateTelegram(req.get('X-Telegram-Init-Data'), botToken);
      next();
    } catch (e) { res.status(401).json({ error: e.message }); }
  }
  async function merchant(req, res, next) {
    const id = req.params.shopId;
    const token = (req.get('Authorization') || '').replace(/^Bearer /, '');
    if (await accountAccess(accounts, token, 'merchant', id)) { req.shopId = id; return next(); }
    if (demo && !token && !db.prepare('SELECT id FROM accounts WHERE shop_id=?').get(id)) { req.shopId = id; return next(); }
    if (!secureEqual(token, merchantTokens[id])) return res.status(401).json({ error: 'Do‘kon kirish kaliti noto‘g‘ri.' });
    req.shopId = id; next();
  }
  async function admin(req, res, next) {
    const token = (req.get('Authorization') || '').replace(/^Bearer /, '');
    if (!secureEqual(token, config.adminToken) && !await accountAccess(accounts, token, 'admin')) return res.status(401).json({ error: 'Admin sifatida kiring.' });
    next();
  }
  app.use('/api/auth/login', rateLimit({ windowMs: 60000, limit: 10, message: { error: 'Kirish urinishlari ko‘p. Bir daqiqadan keyin urinib ko‘ring.' } }));
  app.use('/api/auth', async (req, res) => {
    const result = await accountRequest(accounts, `/auth${req.path}`, req.method, req.body, (req.get('Authorization') || '').replace(/^Bearer /, ''));
    res.status(result.status).json(result.data);
  });
  app.use('/api/admin', admin, async (req, res, next) => {
    if (req.path === '/shops' && req.method === 'POST') return next();
    const result = await accountRequest(accounts, `/admin${req.path}`, req.method, req.body, (req.get('Authorization') || '').replace(/^Bearer /, ''), true,
      { notify: async (chatId, text) => { if (botToken && /^\d{1,16}$/.test(chatId)) await telegram('sendMessage', { chat_id: chatId, text }).catch(() => {}); } });
    res.status(result.status).json(result.data);
  });
  const shopChatId = id => db.prepare('SELECT chat_id FROM shop_private WHERE shop_id=?').get(id)?.chat_id || chatIds[id];
  const getShop = id => parse(db.prepare('SELECT data FROM shops WHERE id=?').get(id));
  const getProduct = id => parse(db.prepare('SELECT data FROM products WHERE id=?').get(id));
  const getOrder = id => parse(db.prepare('SELECT data FROM orders WHERE id=?').get(id));
  const cardOf = shopId => db.prepare('SELECT number, holder, bank FROM shop_cards WHERE shop_id=?').get(shopId) || null;
  const withPayment = order => decorateOrder(order, cardOf(order.shopId));
  function saveOrder(order) { db.prepare('UPDATE orders SET data=? WHERE id=?').run(JSON.stringify(order), order.id); }
  function changeStatus(order, status) {
    if (!Object.hasOwn(transitions, status)) throw new Error('Buyurtma holati noto‘g‘ri.');
    if (order.status === status) return order;
    if (!transitions[order.status].includes(status)) throw new Error('Bu holatga o‘tish mumkin emas.');
    const gate = advanceCheck(order, status);
    if (!gate.ok) throw Object.assign(new Error(gate.error), { status: 409 });
    db.exec('BEGIN IMMEDIATE');
    try {
      if (status === 'cancelled') order.items.forEach(item => {
        const p = getProduct(item.productId);
        if (p) db.prepare('UPDATE products SET data=? WHERE id=?').run(JSON.stringify({ ...p, stock: p.stock + item.quantity }), p.id);
      });
      if (status === 'cancelled' && !order.cancelReason) order.cancelReason = 'shop';
      order.status = status; order.updatedAt = new Date().toISOString(); saveOrder(order); db.exec('COMMIT');
      return order;
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }

  app.get('/api/health', (req, res) => res.json({ ok: true, demo }));
  app.post('/api/merchant/:shopId/images', merchant, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: MAX_IMAGE_BYTES }), (req, res) => {
    if (!getShop(req.shopId)) return res.status(404).json({ error: 'Do‘kon topilmadi.' });
    const bytes = req.body;
    const type = Buffer.isBuffer(bytes) && imageType(bytes);
    if (!type) return res.status(400).json({ error: 'JPG, PNG yoki WebP rasm tanlang (1 MB gacha).' });
    const id = randomUUID();
    db.prepare('INSERT INTO images VALUES (?,?,?,?,?)').run(id, req.shopId, type, bytes, new Date().toISOString());
    res.status(201).json({ url: `/api/images/${id}` });
  });
  app.get('/api/catalog', (req, res) => {
    const shops = db.prepare('SELECT data FROM shops').all().map(parse).filter(s => s.active);
    const active = new Set(shops.map(s => s.id));
    const products = db.prepare('SELECT data FROM products').all().map(parse).filter(p => active.has(p.shopId) && p.active !== false);
    res.json({ shops: decorateShops(shops, db.prepare(RATINGS_SQL).all(), db.prepare(PHONES_SQL).all()), products, demo });
  });
  app.post('/api/orders', customer, (req, res) => {
    const result = orderSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });
    const input = result.data;
    const existing = parse(db.prepare('SELECT data FROM orders WHERE customer_id=? AND request_key=?').get(req.customer.id, input.requestKey));
    if (existing) return res.json(existing);
    const shop = getShop(input.shopId);
    if (!shop?.active) return res.status(400).json({ error: 'Do‘kon hozir buyurtma qabul qilmayapti.' });
    const placedAt = new Date(), openNow = isOpen(shop.hours, placedAt);
    let chosen = null;
    if (input.delivery) {
      const checked = validateDelivery(input.delivery, shop, placedAt);
      if (!checked.ok) return res.status(409).json({ error: checked.error });
      chosen = checked;
    } else if (!openNow && input.customer.deliveryTime !== 'tomorrow') return res.status(409).json({ error: `Do‘kon hozir yopiq (ish vaqti ${hoursLabel(shop.hours)}). Ertangi yetkazish uchun buyurtma bering.` });
    const payment = choosePayment(input.payment, shop, chosen?.delivery.method || 'delivery');
    if (!payment.ok) return res.status(409).json({ error: payment.error });
    if (!demo && (!botToken || !shopChatId(shop.id))) return res.status(503).json({ error: 'Do‘konning buyurtma qabul qilish kanali hali ulanmagan.' });
    // Aggregate duplicates before checking stock; prices always come from the server.
    const quantities = new Map();
    input.items.forEach(i => quantities.set(i.productId, (quantities.get(i.productId) || 0) + i.quantity));
    db.exec('BEGIN IMMEDIATE');
    try {
      const items = [...quantities].map(([id, quantity]) => {
        const p = getProduct(id);
        if (!p || p.shopId !== shop.id) throw new Error('Bitta buyurtmada faqat bitta do‘kon gullari bo‘lishi mumkin.');
        if (p.active === false) throw new Error('Bu gul hozir sotuvda emas.');
        if (quantity > 20 || p.stock < quantity) throw new Error(`${p.name}: yetarli gul mavjud emas.`);
        db.prepare('UPDATE products SET data=? WHERE id=?').run(JSON.stringify({ ...p, stock: p.stock - quantity }), id);
        return { productId: id, name: p.name, image: p.image, price: p.price, quantity };
      });
      const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
      const order = { id: randomUUID(), customerId: req.customer.id, shopId: shop.id, shopName: shop.name,
        items, subtotal, payment: payment.payment, ...(chosen ? { delivery: chosen.delivery } : {}),
        customer: { ...input.customer, ...(chosen ? { deliveryTime: chosen.legacy } : {}), ...(chosen?.delivery.method === 'pickup' ? { address: `Olib ketish: ${shop.address}` } : {}) },
        deliveryFee: chosen?.delivery.method === 'pickup' ? 0 : shop.deliveryFee, total: subtotal + (chosen?.delivery.method === 'pickup' ? 0 : shop.deliveryFee),
        status: 'pending', demo, createdAt: placedAt.toISOString(), notification: demo ? 'demo' : 'queued',
        respondFrom: nextOpen(shop.hours, placedAt).toISOString(), afterHours: !openNow };
      db.prepare('INSERT INTO orders VALUES (?, ?, ?, ?, ?)').run(order.id, req.customer.id, input.requestKey, JSON.stringify(order), order.createdAt);
      if (!demo) db.prepare('INSERT INTO outbox(order_id,chat_id) VALUES (?, ?)').run(order.id, String(shopChatId(shop.id)));
      db.exec('COMMIT'); res.status(201).json(order);
    } catch (e) { db.exec('ROLLBACK'); res.status(400).json({ error: e.message }); }
  });
  app.get('/api/orders', customer, (req, res) => {
    const reviewed = new Set(db.prepare('SELECT order_id FROM reviews WHERE customer_id=?').all(req.customer.id).map(r => r.order_id));
    res.json(db.prepare('SELECT data FROM orders WHERE customer_id=? ORDER BY created_at DESC').all(req.customer.id).map(parse).map(o => ({ ...withPayment(o), reviewed: reviewed.has(o.id) })));
  });
  // "I paid": the buyer tells the shop the transfer was sent
  app.post('/api/orders/:id/payment', customer, (req, res) => {
    const order = parse(db.prepare('SELECT data FROM orders WHERE id=? AND customer_id=?').get(req.params.id, req.customer.id));
    if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi.' });
    const body = paymentClaimSchema.safeParse(req.body || {});
    if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });
    const claimed = claimPayment(order, body.data.note, new Date());
    if (!claimed.ok) return res.status(409).json({ error: claimed.error });
    saveOrder(claimed.order);
    res.json(withPayment(claimed.order));
  });
  app.post('/api/orders/:id/cancel', customer, (req, res) => {
    const order = parse(db.prepare('SELECT data FROM orders WHERE id=? AND customer_id=?').get(req.params.id, req.customer.id));
    if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi.' });
    if (order.status === 'cancelled') return res.json(order);
    if (order.status !== 'pending') {
      const phone = db.prepare('SELECT phone FROM shop_private WHERE shop_id=?').get(order.shopId)?.phone || '';
      return res.status(409).json({ error: 'Do‘kon buyurtmani allaqachon qabul qilgan, endi uni bu yerdan bekor qilib bo‘lmaydi.' + (phone ? ` Do‘kon bilan bog‘laning: ${phone}` : '') });
    }
    order.cancelledBy = 'customer'; order.cancelReason = 'customer';
    const updated = changeStatus(order, 'cancelled');
    db.prepare('UPDATE outbox SET sent_at=COALESCE(sent_at,?) WHERE order_id=?').run(new Date().toISOString(), order.id);
    const chat = shopChatId(order.shopId);
    if (botToken && chat && !demo) telegram('sendMessage', { chat_id: chat, text: `Xaridor buyurtmani bekor qildi: #${order.id.slice(0, 8)}. Gullar qoldiqqa qaytarildi.` }).catch(() => {});
    res.json(updated);
  });
  app.post('/api/support', customer, async (req, res) => {
    const body = supportSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });
    const result = await createTicket(accounts, req.customer.id, body.data);
    if (result.ticket && botToken && config.adminChatId) telegram('sendMessage', { chat_id: config.adminChatId, text: ticketAdminText(result.ticket) }).catch(() => {});
    res.status(result.status).json(result.data);
  });
  app.get('/api/support', customer, async (req, res) => res.json((await listMine(accounts, req.customer.id)).data));
  app.post('/api/orders/:id/review', customer, (req, res) => {
    const body = reviewSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });
    const order = parse(db.prepare('SELECT data FROM orders WHERE id=? AND customer_id=?').get(req.params.id, req.customer.id));
    if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi.' });
    if (order.status !== 'delivered') return res.status(409).json({ error: 'Sharh faqat yetkazilgan buyurtmaga qoldiriladi.' });
    try { db.prepare(INSERT_REVIEW_SQL).run(randomUUID(), order.id, order.shopId, req.customer.id, reviewerName(order.customer?.name), body.data.rating, body.data.comment, new Date().toISOString()); }
    catch { return res.status(409).json({ error: 'Bu buyurtmaga sharh allaqachon qoldirilgan.' }); }
    res.status(201).json({ ok: true });
  });
  app.get('/api/shops/:id/reviews', (req, res) => {
    const stats = db.prepare(SHOP_RATING_SQL).get(req.params.id);
    res.json({ avg: stats.n ? Number(stats.avg) : null, count: Number(stats.n), items: db.prepare(SHOP_REVIEWS_SQL).all(req.params.id).map(r => ({ ...r })) });
  });
  app.get('/api/merchant/:shopId/workspace', merchant, (req, res) => {
    const shop = getShop(req.shopId);
    if (!shop) return res.status(404).json({ error: 'Do‘kon topilmadi.' });
    const products = db.prepare('SELECT data FROM products WHERE shop_id=?').all(req.shopId).map(parse);
    res.json({ shop, products });
  });
  app.patch('/api/merchant/:shopId/settings', merchant, (req, res) => {
    const shop = getShop(req.shopId);
    if (!shop) return res.status(404).json({ error: 'Do‘kon topilmadi.' });
    const result = shopSettingsSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });
    const updated = { ...shop, ...result.data };
    db.prepare('UPDATE shops SET data=? WHERE id=?').run(JSON.stringify(updated), shop.id);
    res.json(updated);
  });
  app.get('/api/merchant/:shopId/orders', merchant, (req, res) => {
    res.json(db.prepare("SELECT data FROM orders WHERE json_extract(data,'$.shopId')=? ORDER BY created_at DESC LIMIT 100").all(req.shopId).map(parse).map(withPayment));
  });
  app.patch('/api/merchant/:shopId/orders/:id', merchant, (req, res) => {
    const order = getOrder(req.params.id);
    if (!order || order.shopId !== req.shopId) return res.status(404).json({ error: 'Buyurtma topilmadi.' });
    try { res.json(withPayment(changeStatus(order, req.body.status))); } catch (e) { res.status(e.status || 400).json({ error: e.message }); }
  });
  // the shop says whether the transfer arrived (or that the money was handed back after a cancellation)
  app.post('/api/merchant/:shopId/orders/:id/payment', merchant, (req, res) => {
    const order = getOrder(req.params.id);
    if (!order || order.shopId !== req.shopId) return res.status(404).json({ error: 'Buyurtma topilmadi.' });
    const body = paymentDecisionSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Amal noto‘g‘ri.' });
    const decided = decidePayment(order, body.data.action, new Date());
    if (!decided.ok) return res.status(409).json({ error: decided.error });
    saveOrder(decided.order);
    res.json(withPayment(decided.order));
  });
  app.get('/api/merchant/:shopId/payment', merchant, (req, res) => {
    const shop = getShop(req.shopId);
    if (!shop) return res.status(404).json({ error: 'Do‘kon topilmadi.' });
    res.json({ acceptsCard: !!shop.acceptsCard, delivery: shop.delivery || 'own', card: cardOf(shop.id) });
  });
  app.put('/api/merchant/:shopId/payment', merchant, (req, res) => {
    const shop = getShop(req.shopId);
    if (!shop) return res.status(404).json({ error: 'Do‘kon topilmadi.' });
    const parsed = paymentSettingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const card = parsed.data.card || cardOf(shop.id);
    if (parsed.data.acceptsCard && !card) return res.status(400).json({ error: 'Kartaga o‘tkazmani yoqish uchun karta ma’lumotlarini kiriting.' });
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE shops SET data=? WHERE id=?').run(JSON.stringify({ ...shop, acceptsCard: parsed.data.acceptsCard, delivery: parsed.data.delivery }), shop.id);
      if (parsed.data.card) db.prepare(SAVE_CARD_SQL).run(shop.id, parsed.data.card.number, parsed.data.card.holder, parsed.data.card.bank, new Date().toISOString());
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); return res.status(500).json({ error: 'Saqlab bo‘lmadi.' }); }
    res.json({ acceptsCard: parsed.data.acceptsCard, delivery: parsed.data.delivery, card });
  });
  app.post('/api/merchant/:shopId/products', merchant, (req, res) => {
    if (!getShop(req.shopId)) return res.status(404).json({ error: 'Do‘kon topilmadi.' });
    const result = productSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });
    const product = { ...result.data, id: randomUUID(), shopId: req.shopId };
    db.prepare('INSERT INTO products VALUES (?, ?, ?)').run(product.id, product.shopId, JSON.stringify(product));
    res.status(201).json(product);
  });
  app.patch('/api/merchant/:shopId/products/:id', merchant, (req, res) => {
    const product = getProduct(req.params.id);
    if (!product || product.shopId !== req.shopId) return res.status(404).json({ error: 'Gul topilmadi.' });
    if (req.body.expectedStock !== undefined && req.body.expectedStock !== product.stock) return res.status(409).json({ error: 'Qoldiq o‘zgardi. Gulni qayta ochib tahrirlang.' });
    const result = productSchema.safeParse({ ...product, ...req.body });
    if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });
    const updated = { ...result.data, id: product.id, shopId: product.shopId };
    db.prepare('UPDATE products SET data=? WHERE id=?').run(JSON.stringify(updated), product.id);
    res.json(updated);
  });
  app.post('/api/admin/shops', admin, (req, res) => {
    const result = shopSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });
    db.prepare('INSERT INTO shops VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(result.data.id, JSON.stringify(result.data));
    res.json(result.data);
  });

  async function telegram(method, data) {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(telegramParameters(data)), signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error('Telegram xabari yuborilmadi.');
    return result.result;
  }
  let processing = false;
  async function flushOutbox() {
    if (processing || demo || !botToken) return;
    processing = true;
    try {
      const rows = db.prepare('SELECT * FROM outbox WHERE sent_at IS NULL AND next_at<=? LIMIT 10').all(Date.now());
      for (const row of rows) {
        const order = getOrder(row.order_id);
        if (order.status !== 'pending') { db.prepare('UPDATE outbox SET sent_at=? WHERE order_id=?').run(new Date().toISOString(), order.id); continue; }
        try {
          await telegram('sendMessage', { chat_id: row.chat_id, text: shopOrderText(order),
            reply_markup: { inline_keyboard: [[{ text: 'Qabul qilish', callback_data: `order:${order.id}:accepted` }, { text: 'Bekor qilish', callback_data: `order:${order.id}:cancelled` }]] },
          });
          if (order.delivery?.point) await telegram('sendLocation', { chat_id: row.chat_id, latitude: order.delivery.point.lat, longitude: order.delivery.point.lng }).catch(() => {});
          db.prepare('UPDATE outbox SET sent_at=? WHERE order_id=?').run(new Date().toISOString(), order.id);
          saveOrder({ ...getOrder(order.id), notification: 'sent' });
        } catch {
          const attempts = row.attempts + 1;
          db.prepare('UPDATE outbox SET attempts=?,next_at=? WHERE order_id=?').run(attempts, Date.now() + Math.min(600000, 5000 * 2 ** Math.min(attempts, 7)), order.id);
          saveOrder({ ...getOrder(order.id), notification: 'retrying' });
        }
      }
    } finally { processing = false; }
  }
  app.post('/api/telegram/webhook', async (req, res) => {
    if (!botToken || !secureEqual(req.get('X-Telegram-Bot-Api-Secret-Token'), config.webhookSecret)) return res.sendStatus(401);
    const reply = commandReply(req.body.message, config.publicAppUrl || 'https://gulbar.bella-rose.workers.dev', demo);
    if (reply) {
      try { await telegram('sendMessage', reply); return res.json({ ok: true }); }
      catch { return res.status(503).json({ error: 'Bot javobi yuborilmadi.' }); }
    }
    const callback = req.body.callback_query;
    if (callback) {
      if (demo) return res.sendStatus(403);
      const match = /^order:([a-f0-9-]{36}):(accepted|cancelled|delivering|delivered)$/.exec(callback.data || '');
      const order = match && getOrder(match[1]);
      // Merchant actions only from configured private chat owner; group callbacks are rejected.
      const chat = callback.message?.chat;
      if (!order || chat?.type !== 'private' || String(chat.id) !== String(shopChatId(order.shopId)) || callback.from?.id !== chat.id) return res.sendStatus(403);
      try {
        changeStatus(order, match[2]);
        const next = { accepted: 'delivering', delivering: 'delivered' }[match[2]];
        await telegram('editMessageReplyMarkup', { chat_id: chat.id, message_id: callback.message.message_id,
          reply_markup: { inline_keyboard: next ? [[{ text: statusNames[next], callback_data: `order:${order.id}:${next}` }]] : [] } });
        await telegram('answerCallbackQuery', { callback_query_id: callback.id, text: statusNames[match[2]] });
        return res.json({ ok: true });
      } catch { return res.status(400).json({ error: 'Holatni yangilab bo‘lmadi.' }); }
    }
    res.json({ ok: true });
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'Manzil topilmadi.' }));
  app.use((error, req, res, next) => {
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'So‘rov juda katta.' });
    if (error instanceof SyntaxError) return res.status(400).json({ error: 'So‘rov noto‘g‘ri.' });
    console.error('Server request failed:', error.name);
    res.status(500).json({ error: 'Serverda xatolik. Qayta urinib ko‘ring.' });
  });
  return { app, db, flushOutbox };
}


