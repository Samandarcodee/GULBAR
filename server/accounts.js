import { z } from 'zod';
import { secureEqual } from './auth.js';
import { shopSchema } from './schemas.js';
import { adminList, adminUpdate } from './support.js';
const enc = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
const unhex = value => Uint8Array.from(value.match(/.{2}/g), x => parseInt(x, 16));
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const digest = async value => hex(await crypto.subtle.digest('SHA-256', enc.encode(value)));
export async function hashPassword(password, salt = random()) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unhex(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return `pbkdf2:100000:${salt}:${hex(bits)}`;
}
export async function verifyPassword(password, stored) {
  if (!/^pbkdf2:100000:[a-f0-9]{64}:[a-f0-9]{64}$/.test(stored || '')) return false;
  return secureEqual(await hashPassword(password, stored.split(':')[2]), stored);
}
export function accountStore(db, worker = false) {
  return {
    first: async (sql, args = []) => worker ? db.prepare(sql).bind(...args).first() : db.prepare(sql).get(...args) || null,
    all: async (sql, args = []) => worker ? (await db.prepare(sql).bind(...args).all()).results : db.prepare(sql).all(...args),
    batch: async statements => {
      if (worker) return db.batch(statements.map(([sql, args = []]) => db.prepare(sql).bind(...args)));
      db.exec('BEGIN IMMEDIATE');
      try { const rows = statements.map(([sql, args = []]) => db.prepare(sql).run(...args)); db.exec('COMMIT'); return rows; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
export const safeAccount = row => ({ id: row.id, login: row.login, role: row.role, shopId: row.shop_id, mustChangePassword: !!row.must_change });
export async function sessionAccount(store, token) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) return null;
  return store.first(`SELECT a.* FROM sessions s JOIN accounts a ON a.id=s.account_id
    WHERE s.token_hash=? AND s.expires_at>? AND a.enabled=1`, [await digest(token), Date.now()]);
}
export async function accountAccess(store, token, role, shopId) {
  const account = await sessionAccount(store, token);
  return account && !account.must_change && account.role === role && (role === 'admin' || account.shop_id === shopId) ? account : null;
}
const loginSchema = z.object({ login: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/), password: z.string().min(1).max(128) });
const password = z.string().min(12, 'Parol kamida 12 belgi bo‘lsin.').max(128);
const newShop = z.object({ shop: shopSchema, login: loginSchema.shape.login, password,
  phone: z.string().regex(/^\+998\d{9}$/, 'Telefon: +998 va 9 ta raqam.'), telegramChatId: z.string().regex(/^\d{1,16}$|^$/, 'Telegram ID raqamlardan iborat bo‘lsin.').default('') });
function fail(message, status = 400) { return { status, data: { error: message } }; }
// orders the shop still has to fulfil: deleting the shop is refused while any exist
const OPEN_ORDERS_SQL = "SELECT COUNT(*) AS n FROM orders WHERE json_extract(data,'$.shopId')=? AND json_extract(data,'$.status') IN ('pending','accepted','delivering')";
export async function accountRequest(store, path, method, body, token, adminAuthorized = false, hooks = {}) {
  if (path === '/auth/login' && method === 'POST') {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) return fail('Login yoki parol noto‘g‘ri.', 401);
    const account = await store.first('SELECT * FROM accounts WHERE login=?', [parsed.data.login]);
    // Equal password hashing work for unknown usernames prevents a cheap login enumeration signal.
    const valid = await verifyPassword(parsed.data.password, account?.password_hash || `pbkdf2:100000:${'0'.repeat(64)}:${'0'.repeat(64)}`);
    if (!account || !account.enabled || !valid) return fail('Login yoki parol noto‘g‘ri.', 401);
    const session = random();
    await store.batch([
      ['DELETE FROM sessions WHERE expires_at<=?', [Date.now()]],
      ['INSERT INTO sessions SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM accounts WHERE id=? AND password_hash=? AND enabled=1)', [await digest(session), account.id, Date.now() + 8 * 60 * 60 * 1000, account.id, account.password_hash]],
    ]);
    if (!await sessionAccount(store, session)) return fail('Hisob o‘zgardi. Qayta kiring.', 401);
    return { status: 200, data: { token: session, user: safeAccount(account) } };
  }
  if (path.startsWith('/auth/')) {
    const account = await sessionAccount(store, token);
    if (!account) return fail('Qayta kiring.', 401);
    if (path === '/auth/me' && method === 'GET') return { status: 200, data: safeAccount(account) };
    if (path === '/auth/logout' && method === 'POST') {
      await store.batch([['DELETE FROM sessions WHERE token_hash=?', [await digest(token)]]]);
      return { status: 200, data: { ok: true } };
    }
    if (path === '/auth/password' && method === 'POST') {
      const parsed = z.object({ currentPassword: z.string().max(128), newPassword: password }).safeParse(body);
      if (!parsed.success) return fail(parsed.error.issues[0].message);
      if (parsed.data.currentPassword === parsed.data.newPassword) return fail('Yangi parol avvalgisidan farq qilsin.');
      if (!await verifyPassword(parsed.data.currentPassword, account.password_hash)) return fail('Hozirgi parol noto‘g‘ri.', 403);
      const updatedHash = await hashPassword(parsed.data.newPassword);
      // Compare the original hash in both statements: a concurrent reset cannot re-enable this session.
      await store.batch([
        ['DELETE FROM sessions WHERE account_id=? AND token_hash<>? AND EXISTS(SELECT 1 FROM accounts WHERE id=? AND password_hash=?)', [account.id, await digest(token), account.id, account.password_hash]],
        ['UPDATE accounts SET password_hash=?,must_change=0 WHERE id=? AND password_hash=?', [updatedHash, account.id, account.password_hash]],
      ]);
      const current = await sessionAccount(store, token);
      if (!current || current.password_hash !== updatedHash) return fail('Hisob o‘zgardi. Qayta kiring.', 401);
      return { status: 200, data: safeAccount(current) };
    }
    return fail('Manzil topilmadi.', 404);
  }
  if (!adminAuthorized) return fail('Admin sifatida kiring.', 401);
  if (path === '/admin/support' && method === 'GET') return adminList(store);
  if (path.startsWith('/admin/support/') && method === 'PATCH') {
    const ticketId = path.slice('/admin/support/'.length);
    return /^[0-9a-f-]{36}$/.test(ticketId) ? adminUpdate(store, ticketId, body, hooks) : fail('Murojaat topilmadi.', 404);
  }
  if (path === '/admin/bootstrap' && method === 'POST') {
    const parsed = z.object({ login: loginSchema.shape.login, password }).safeParse(body);
    if (!parsed.success) return fail('Admin login yoki parol talablarga mos emas.');
    if (await store.first("SELECT id FROM accounts WHERE role='admin'")) return fail('Admin hisobi allaqachon yaratilgan.', 409);
    await store.batch([[
      "INSERT INTO accounts SELECT ?,?,'admin',NULL,?,1,1,? WHERE NOT EXISTS(SELECT 1 FROM accounts WHERE role='admin')",
      [crypto.randomUUID(), parsed.data.login, await hashPassword(parsed.data.password), new Date().toISOString()],
    ]]);
    return { status: 201, data: { ok: true } };
  }
  if (path === '/admin/workspace' && method === 'GET') {
    const rows = await store.all(`SELECT s.data,p.phone,p.chat_id,a.login,a.enabled,(SELECT COUNT(*) FROM products x WHERE x.shop_id=s.id AND COALESCE(json_extract(x.data,'$.active'),1)!=0) AS products FROM shops s
      LEFT JOIN shop_private p ON p.shop_id=s.id LEFT JOIN accounts a ON a.shop_id=s.id`);
    return { status: 200, data: rows.map(r => ({ ...JSON.parse(r.data), phone: r.phone || '', telegramChatId: r.chat_id || '', login: r.login || '', accountEnabled: !!r.enabled, products: Number(r.products) || 0 })) };
  }
  if (path === '/admin/onboard' && method === 'POST') {
    const parsed = newShop.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const { shop, login, password: initial, phone, telegramChatId } = parsed.data;
    const hash = await hashPassword(initial);
    try {
      await store.batch([
        ['INSERT INTO shops VALUES (?,?)', [shop.id, JSON.stringify(shop)]],
        ['INSERT INTO shop_private VALUES (?,?,?)', [shop.id, phone, telegramChatId]],
        ['INSERT INTO accounts VALUES (?,?,?,?,?,1,1,?)', [crypto.randomUUID(), login, 'merchant', shop.id, hash, new Date().toISOString()]],
      ]);
    } catch { return fail('Bu login yoki do‘kon ID allaqachon mavjud.', 409); }
    return { status: 201, data: { ...shop, login, phone, telegramChatId, accountEnabled: true } };
  }
  const removal = /^\/admin\/shops\/([a-z0-9-]{2,40})$/.exec(path);
  if (removal && method === 'DELETE') {
    const id = removal[1];
    if (!await store.first('SELECT id FROM shops WHERE id=?', [id])) return fail('Do‘kon topilmadi.', 404);
    const open = await store.first(OPEN_ORDERS_SQL, [id]);
    if (Number(open?.n) > 0) return fail(`Do‘konda ${open.n} ta tugallanmagan buyurtma bor. Avval ularni yetkazing yoki bekor qiling, keyin o‘chiring.`, 409);
    try {
      await store.batch([
        // atomic guard: a buyer's order that slipped in since the check above makes this insert fail, and the whole batch rolls back
        ["INSERT INTO metadata(key,value) SELECT 'delete-guard', NULL WHERE EXISTS (" + OPEN_ORDERS_SQL.replace('COUNT(*) AS n', '1') + ")", [id]],
        ['DELETE FROM reviews WHERE shop_id=?', [id]],
        ['DELETE FROM images WHERE shop_id=?', [id]],
        ['DELETE FROM products WHERE shop_id=?', [id]],
        ['DELETE FROM sessions WHERE account_id IN (SELECT id FROM accounts WHERE shop_id=?)', [id]],
        ['DELETE FROM accounts WHERE shop_id=?', [id]],
        ['DELETE FROM shop_cards WHERE shop_id=?', [id]],
        ['DELETE FROM shop_private WHERE shop_id=?', [id]],
        ['DELETE FROM shops WHERE id=?', [id]],
      ]);
    } catch { return fail('Do‘konni o‘chirib bo‘lmadi: yangi buyurtma tushgan bo‘lishi mumkin. Qayta urinib ko‘ring.', 409); }
    // past orders stay as the buyers' history (they carry the shop name); only the shop and everything it owned is removed
    return { status: 200, data: { ok: true, id } };
  }
  const create = /^\/admin\/shops\/([a-z0-9-]{2,40})\/account$/.exec(path);
  if (create && method === 'POST') {
    const parsed = z.object({ login: loginSchema.shape.login, password }).safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    if (!await store.first('SELECT id FROM shops WHERE id=?', [create[1]])) return fail('Do‘kon topilmadi.', 404);
    try {
      await store.batch([['INSERT INTO accounts VALUES (?,?,?,?,?,1,1,?)', [crypto.randomUUID(), parsed.data.login, 'merchant', create[1], await hashPassword(parsed.data.password), new Date().toISOString()]]]);
    } catch { return fail('Bu do‘konda login allaqachon bor yoki bu login band.', 409); }
    return { status: 201, data: { ok: true, login: parsed.data.login } };
  }
  const match = /^\/admin\/shops\/([a-z0-9-]{2,40})\/(settings|account)$/.exec(path);
  if (match && method === 'PATCH') {
    const shopRow = await store.first('SELECT data FROM shops WHERE id=?', [match[1]]);
    if (!shopRow) return fail('Do‘kon topilmadi.', 404);
    if (match[2] === 'settings') {
      const parsed = z.object({ shop: shopSchema, phone: newShop.shape.phone, telegramChatId: newShop.shape.telegramChatId }).safeParse(body);
      if (!parsed.success) return fail(parsed.error.issues[0].message);
      const updated = { ...JSON.parse(shopRow.data), ...parsed.data.shop, id: match[1] };
      await store.batch([
        ['UPDATE shops SET data=? WHERE id=?', [JSON.stringify(updated), match[1]]],
        ['INSERT INTO shop_private VALUES (?,?,?) ON CONFLICT(shop_id) DO UPDATE SET phone=excluded.phone,chat_id=excluded.chat_id', [match[1], parsed.data.phone, parsed.data.telegramChatId]],
      ]);
      return { status: 200, data: updated };
    }
    const parsed = z.object({ password: password.optional(), enabled: z.boolean().optional() }).refine(v => v.password !== undefined || v.enabled !== undefined).safeParse(body);
    if (!parsed.success) return fail('Yangi parol yoki hisob holatini kiriting.');
    const account = await store.first("SELECT * FROM accounts WHERE shop_id=? AND role='merchant'", [match[1]]);
    if (!account) return fail('Do‘kon login hisobi yo‘q.', 404);
    const hash = parsed.data.password ? await hashPassword(parsed.data.password) : account.password_hash;
    await store.batch([
      ['UPDATE accounts SET password_hash=?,enabled=?,must_change=? WHERE id=?', [hash, parsed.data.enabled === undefined ? account.enabled : Number(parsed.data.enabled), parsed.data.password ? 1 : account.must_change, account.id]],
      ['DELETE FROM sessions WHERE account_id=?', [account.id]],
    ]);
    return { status: 200, data: { ok: true } };
  }
  return fail('Manzil topilmadi.', 404);
}
