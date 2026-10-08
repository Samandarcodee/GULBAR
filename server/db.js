import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { shops, products } from './catalog.js';
import { imageTableSql } from './images.js';
import { reviewsTableSql } from './reviews.js';
import { supportTableSql } from './support.js';
import { shopCardsTableSql } from './payment.js';

export function openDatabase(path, demo) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shops (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, shop_id TEXT NOT NULL REFERENCES shops(id), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, request_key TEXT NOT NULL,
      data TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(customer_id, request_key));
    CREATE TABLE IF NOT EXISTS outbox (order_id TEXT PRIMARY KEY REFERENCES orders(id), chat_id TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0, sent_at TEXT);
  `);
  db.exec(`CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,login TEXT NOT NULL UNIQUE,role TEXT NOT NULL CHECK(role IN ('admin','merchant')),
    shop_id TEXT UNIQUE REFERENCES shops(id),password_hash TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,
    must_change INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_account ON sessions(account_id);
    CREATE TABLE IF NOT EXISTS shop_private(shop_id TEXT PRIMARY KEY REFERENCES shops(id),phone TEXT NOT NULL DEFAULT '',chat_id TEXT NOT NULL DEFAULT '');`);
  db.exec(imageTableSql);
  db.exec(reviewsTableSql);
  db.exec(supportTableSql);
  db.exec(shopCardsTableSql);
  const mode = db.prepare("SELECT value FROM metadata WHERE key='mode'").get();
  const hadRows = db.prepare('SELECT id FROM shops LIMIT 1').get();
  if ((!demo && (mode?.value === 'demo' || (!mode && hadRows))) || (demo && mode?.value === 'live')) {
    db.close(); throw new Error('Demo and live databases must be separate. Use a fresh DATABASE_PATH.');
  }
  db.prepare("INSERT OR IGNORE INTO metadata VALUES ('mode', ?)").run(demo ? 'demo' : 'live');
  // Demo data never seeds a live database.
  if (demo && !db.prepare('SELECT id FROM shops LIMIT 1').get()) {
    const addShop = db.prepare('INSERT INTO shops VALUES (?, ?)');
    const addProduct = db.prepare('INSERT INTO products VALUES (?, ?, ?)');
    db.exec('BEGIN');
    try {
      shops.forEach(s => addShop.run(s.id, JSON.stringify(s)));
      products.forEach(p => addProduct.run(p.id, p.shopId, JSON.stringify(p)));
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  if (demo) {
    // Upgrade the original external sample URLs to bundled assets, retaining stock/price edits.
    products.forEach(seed => {
      const row = db.prepare('SELECT data FROM products WHERE id=?').get(seed.id);
      const current = row && JSON.parse(row.data);
      if (current?.image?.startsWith('https://images.unsplash.com/')) {
        db.prepare('UPDATE products SET data=? WHERE id=?').run(JSON.stringify({ ...current, image: seed.image }), seed.id);
      }
    });
  }
  return db;
}
