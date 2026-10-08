-- Paying a shop by card transfer: the shop's card lives in its own table, away from the public shop record.
-- Orders keep their payment state inside the order JSON (payment.method / payment.status), so nothing else changes.
CREATE TABLE IF NOT EXISTS shop_cards (
  shop_id TEXT PRIMARY KEY REFERENCES shops(id), number TEXT NOT NULL, holder TEXT NOT NULL, bank TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
);
