import { readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../server/db.js';
const root = name => new URL(`../${name}`, import.meta.url);
const secrets = JSON.parse(readFileSync(root('.cloudflare-secrets.json'), 'utf8'));
const source = new DatabaseSync(':memory:');
source.exec(readFileSync(root('.gulbar-migration/live.sql'), 'utf8'));
const target = openDatabase('./data/gulbar-live.sqlite', false);
target.exec('BEGIN IMMEDIATE');
try {
  // Node reserves stock in application transactions; do not copy the D1 stock triggers.
  for (const table of ['shops', 'products', 'shop_private', 'accounts']) {
    for (const row of source.prepare(`SELECT * FROM ${table}`).all()) {
      const keys = Object.keys(row);
      target.prepare(`INSERT OR IGNORE INTO ${table}(${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(row));
    }
  }
  target.exec('COMMIT');
} catch (e) { target.exec('ROLLBACK'); throw e; }
target.close(); source.close();
let env = readFileSync(root('.env'), 'utf8');
const values = { DEMO_MODE: 'false', DATABASE_PATH: './data/gulbar-live.sqlite', TELEGRAM_BOT_TOKEN: secrets.TELEGRAM_BOT_TOKEN,
  TELEGRAM_WEBHOOK_SECRET: secrets.TELEGRAM_WEBHOOK_SECRET, ADMIN_TOKEN: secrets.ADMIN_TOKEN, SHOP_CHAT_IDS: '{}', MERCHANT_TOKENS: '{}' };
for (const [key, value] of Object.entries(values)) { env = env.replace(new RegExp(`^${key}=.*\\r?\\n?`, 'gm'), ''); env += `\n${key}=${value}\n`; }
writeFileSync(root('.env'), env);
console.log('Local Node configured for the separate live database. Admin and merchant accounts preserved; no sample data added.');
