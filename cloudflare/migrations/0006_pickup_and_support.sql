-- Pick-up orders have no delivery fee, so the "fee must equal the shop's fee" rule only applies to delivery orders.
DROP TRIGGER IF EXISTS order_validate;
CREATE TRIGGER order_validate BEFORE INSERT ON orders BEGIN
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
  SELECT CASE WHEN COALESCE(json_extract(NEW.data,'$.delivery.method'),'delivery')!='pickup'
    AND (SELECT json_extract(data,'$.deliveryFee') FROM shops WHERE id=json_extract(NEW.data,'$.shopId'))!=json_extract(NEW.data,'$.deliveryFee')
    THEN RAISE(ABORT,'delivery_price_changed') END;
  SELECT CASE WHEN json_extract(NEW.data,'$.delivery.method')='pickup' AND json_extract(NEW.data,'$.deliveryFee')!=0
    THEN RAISE(ABORT,'delivery_price_changed') END;
END;

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL, order_id TEXT, shop_id TEXT,
  status TEXT NOT NULL DEFAULT 'new', reply TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS support_customer ON support_tickets(customer_id, created_at);
CREATE INDEX IF NOT EXISTS support_status ON support_tickets(status, created_at);
