CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY, shop_id TEXT NOT NULL REFERENCES shops(id),
  content_type TEXT NOT NULL, body BLOB NOT NULL CHECK(length(body) <= 1048576), created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS images_shop ON images(shop_id);
