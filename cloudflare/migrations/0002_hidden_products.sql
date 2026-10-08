CREATE TRIGGER IF NOT EXISTS orders_visible_products
BEFORE INSERT ON orders
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.data, '$.items') AS item
    JOIN products AS p ON p.id = json_extract(item.value, '$.productId')
    WHERE json_extract(p.data, '$.active') = 0
  ) THEN RAISE(ABORT, 'product_hidden') END;
END;
