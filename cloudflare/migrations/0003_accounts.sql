CREATE TABLE IF NOT EXISTS accounts (
 id TEXT PRIMARY KEY, login TEXT NOT NULL UNIQUE, role TEXT NOT NULL CHECK(role IN ('admin','merchant')),
 shop_id TEXT UNIQUE REFERENCES shops(id), password_hash TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
 must_change INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_account ON sessions(account_id);
CREATE TABLE IF NOT EXISTS shop_private (
 shop_id TEXT PRIMARY KEY REFERENCES shops(id), phone TEXT NOT NULL DEFAULT '', chat_id TEXT NOT NULL DEFAULT ''
);
