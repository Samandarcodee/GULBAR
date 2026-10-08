CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS shops (id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, shop_id TEXT NOT NULL REFERENCES shops(id), data TEXT NOT NULL CHECK(json_valid(data)));
CREATE INDEX IF NOT EXISTS products_shop ON products(shop_id);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, request_key TEXT NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data)), created_at TEXT NOT NULL,
  UNIQUE(customer_id, request_key)
);
CREATE INDEX IF NOT EXISTS orders_customer ON orders(customer_id,created_at);
CREATE INDEX IF NOT EXISTS orders_shop ON orders(json_extract(data,'$.shopId'),created_at);
CREATE TABLE IF NOT EXISTS outbox (
  order_id TEXT PRIMARY KEY REFERENCES orders(id), chat_id TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT, locked_until INTEGER NOT NULL DEFAULT 0, lease_token TEXT
);

-- SQLite triggers execute in the same atomic insert/update as the order.
-- No JavaScript read-modify-write inventory race; D1 serializes these SQL writes.
CREATE TRIGGER IF NOT EXISTS order_validate BEFORE INSERT ON orders BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM shops WHERE id=json_extract(NEW.data,'$.shopId') AND json_extract(data,'$.active')=1
  ) THEN RAISE(ABORT,'shop_inactive') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.data,'$.items') item
    LEFT JOIN products p ON p.id=json_extract(item.value,'$.productId')
    WHERE p.id IS NULL OR p.shop_id!=json_extract(NEW.data,'$.shopId')
      OR json_extract(item.value,'$.quantity')<1 OR json_extract(item.value,'$.quantity')>20
      OR json_extract(p.data,'$.stock')<json_extract(item.value,'$.quantity')
      OR json_extract(p.data,'$.price')!=json_extract(item.value,'$.price')
  ) THEN RAISE(ABORT,'stock_or_price_changed') END;
  SELECT CASE WHEN (SELECT json_extract(data,'$.deliveryFee') FROM shops WHERE id=json_extract(NEW.data,'$.shopId'))!=json_extract(NEW.data,'$.deliveryFee')
    THEN RAISE(ABORT,'delivery_price_changed') END;
END;
CREATE TRIGGER IF NOT EXISTS order_reserve AFTER INSERT ON orders BEGIN
  UPDATE products SET data=json_set(data,'$.stock',json_extract(data,'$.stock')-
    (SELECT json_extract(value,'$.quantity') FROM json_each(NEW.data,'$.items') WHERE json_extract(value,'$.productId')=products.id))
  WHERE id IN (SELECT json_extract(value,'$.productId') FROM json_each(NEW.data,'$.items'));
END;
CREATE TRIGGER IF NOT EXISTS order_status_validate BEFORE UPDATE OF data ON orders
WHEN json_extract(OLD.data,'$.status')!=json_extract(NEW.data,'$.status') BEGIN
  SELECT CASE WHEN NOT (
    (json_extract(OLD.data,'$.status')='pending' AND json_extract(NEW.data,'$.status') IN ('accepted','cancelled')) OR
    (json_extract(OLD.data,'$.status')='accepted' AND json_extract(NEW.data,'$.status') IN ('delivering','cancelled')) OR
    (json_extract(OLD.data,'$.status')='delivering' AND json_extract(NEW.data,'$.status')='delivered')
  ) THEN RAISE(ABORT,'invalid_status_transition') END;
END;
CREATE TRIGGER IF NOT EXISTS order_restore AFTER UPDATE OF data ON orders
WHEN json_extract(OLD.data,'$.status')!='cancelled' AND json_extract(NEW.data,'$.status')='cancelled' BEGIN
  UPDATE products SET data=json_set(data,'$.stock',json_extract(data,'$.stock')+
    (SELECT json_extract(value,'$.quantity') FROM json_each(OLD.data,'$.items') WHERE json_extract(value,'$.productId')=products.id))
  WHERE id IN (SELECT json_extract(value,'$.productId') FROM json_each(OLD.data,'$.items'));
END;
