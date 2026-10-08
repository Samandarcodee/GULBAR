import { writeFileSync } from 'node:fs';
import { shops, products } from '../server/catalog.js';
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const lines = ["INSERT INTO metadata(key,value) VALUES ('mode','demo') ON CONFLICT(key) DO NOTHING;"];
// Only an explicitly marked demo database receives sample content. No local orders exported.
for (const shop of shops) lines.push(`INSERT OR IGNORE INTO shops SELECT ${quote(shop.id)}, ${quote(JSON.stringify(shop))} WHERE (SELECT value FROM metadata WHERE key='mode')='demo';`);
for (const p of products) lines.push(`INSERT OR IGNORE INTO products SELECT ${quote(p.id)}, ${quote(p.shopId)}, ${quote(JSON.stringify(p))} WHERE (SELECT value FROM metadata WHERE key='mode')='demo';`);
writeFileSync(new URL('./seed-demo.sql', import.meta.url), lines.join('\n') + '\n');
