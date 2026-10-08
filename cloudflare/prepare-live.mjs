import { readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
const root = name => new URL(`../${name}`, import.meta.url);
const secrets = JSON.parse(readFileSync(root('.cloudflare-secrets.json'), 'utf8'));
const source = new DatabaseSync(':memory:');
source.exec('PRAGMA foreign_keys=OFF; CREATE TABLE shops(id TEXT PRIMARY KEY);');
source.exec(readFileSync(root('.gulbar-migration/accounts.sql'), 'utf8'));
const accounts = source.prepare('SELECT * FROM accounts').all();
const base = 'https://gulbar.bella-rose.workers.dev';
async function get(path) {
  const response = await fetch(`${base}/api${path}`, { headers: { Authorization: `Bearer ${path.startsWith('/admin/') ? secrets.ADMIN_TOKEN : secrets.DEMO_MERCHANT_TOKEN}` } });
  if (!response.ok) throw new Error(`Source migration request failed: ${response.status}`);
  return response.json();
}
const rows = await get('/admin/workspace');
const seedNames = { lola: 'Lola Flowers', bloom: 'Bloom Studio', rayhon: 'Rayhon' };
const realShops = rows.filter(s => !Object.hasOwn(seedNames, s.id) || (s.name !== seedNames[s.id] && s.phone));
for (const s of realShops) if (s.login && !accounts.some(a => a.shop_id === s.id && a.login === s.login)) throw new Error('Source accounts changed during migration. Export accounts again before proceeding.');
const quote = value => value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const sql = ['0001_schema.sql', '0002_hidden_products.sql', '0003_accounts.sql'].map(name => readFileSync(new URL(`migrations/${name}`, import.meta.url), 'utf8'));
sql.push("INSERT INTO metadata(key,value) VALUES ('mode','live') ON CONFLICT(key) DO NOTHING;");
let products = 0;
for (const s of realShops) {
  const workspace = await get(`/merchant/${s.id}/workspace`);
  sql.push(`INSERT INTO shops VALUES (${quote(s.id)},${quote(JSON.stringify(workspace.shop))});`);
  sql.push(`INSERT INTO shop_private VALUES (${quote(s.id)},${quote(s.phone)},${quote(s.telegramChatId)});`);
  for (const p of workspace.products) { sql.push(`INSERT INTO products VALUES (${quote(p.id)},${quote(p.shopId)},${quote(JSON.stringify(p))});`); products++; }
}
const kept = accounts.filter(a => a.role === 'admin' || realShops.some(s => s.id === a.shop_id));
if (!kept.some(a => a.role === 'admin')) throw new Error('Owner account missing. Refusing to switch databases.');
for (const a of kept) sql.push(`INSERT INTO accounts(id,login,role,shop_id,password_hash,enabled,must_change,created_at) VALUES (${[a.id,a.login,a.role,a.shop_id,a.password_hash,a.enabled,a.must_change,a.created_at].map(quote).join(',')});`);
writeFileSync(root('.gulbar-migration/live.sql'), sql.join('\n'));
source.close();
console.log(JSON.stringify({ preservedOwnerAccounts: kept.filter(a => a.role === 'admin').length, realShops: realShops.length, realProducts: products, excludedSampleShops: rows.length - realShops.length, copiedTestOrders: 0, copiedSessions: 0 }));
