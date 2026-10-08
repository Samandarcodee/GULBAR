CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE REFERENCES orders(id), shop_id TEXT NOT NULL REFERENCES shops(id),
  customer_id TEXT NOT NULL, name TEXT NOT NULL, rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '', hidden INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reviews_shop ON reviews(shop_id, created_at);
