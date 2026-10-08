// Reviews are real: one per delivered order, left by the customer who placed it. Shared by the Node server and the Worker.
import { z } from 'zod';
export const reviewSchema = z.object({
  rating: z.number().int().min(1, 'Bahoni tanlang.').max(5, 'Baho 1 dan 5 gacha bo‘lsin.'),
  comment: z.string().trim().max(500, 'Sharh 500 belgidan oshmasin.').default(''),
});
// Only the first name is ever shown publicly.
export const reviewerName = full => String(full || '').trim().split(/\s+/)[0].replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, 20) || 'Xaridor';
export const reviewsTableSql = `CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE REFERENCES orders(id), shop_id TEXT NOT NULL REFERENCES shops(id),
  customer_id TEXT NOT NULL, name TEXT NOT NULL, rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '', hidden INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reviews_shop ON reviews(shop_id, created_at);`;
export const INSERT_REVIEW_SQL = 'INSERT INTO reviews VALUES (?,?,?,?,?,?,?,0,?)';
export const RATINGS_SQL = 'SELECT shop_id, ROUND(AVG(rating),1) AS avg, COUNT(*) AS n FROM reviews WHERE hidden=0 GROUP BY shop_id';
export const SHOP_RATING_SQL = 'SELECT ROUND(AVG(rating),1) AS avg, COUNT(*) AS n FROM reviews WHERE shop_id=? AND hidden=0';
export const SHOP_REVIEWS_SQL = 'SELECT name, rating, comment, created_at AS createdAt FROM reviews WHERE shop_id=? AND hidden=0 ORDER BY created_at DESC LIMIT 30';
export const PHONES_SQL = "SELECT shop_id, phone FROM shop_private WHERE phone!=''";
// Public shop fields added to the catalog: average rating and the business phone (never the Telegram ID).
export function decorateShops(shops, ratingRows, phoneRows) {
  const rating = new Map(ratingRows.map(r => [r.shop_id, { avg: Number(r.avg), count: Number(r.n) }]));
  const phone = new Map(phoneRows.map(r => [r.shop_id, r.phone]));
  return shops.map(s => ({ ...s, ...(rating.has(s.id) ? { rating: rating.get(s.id) } : {}), ...(phone.has(s.id) ? { phone: phone.get(s.id) } : {}) }));
}
