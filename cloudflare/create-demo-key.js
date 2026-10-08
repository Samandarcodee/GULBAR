import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const file = new URL('../.cloudflare-secrets.json', import.meta.url);
const secrets = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { DEMO_MERCHANT_TOKEN: randomBytes(32).toString('hex') };
writeFileSync(file, JSON.stringify(secrets));
const vars = new URL('../.dev.vars', import.meta.url);
if (!existsSync(vars)) writeFileSync(vars, `DEMO_MERCHANT_TOKEN=${secrets.DEMO_MERCHANT_TOKEN}\n`);
writeFileSync(new URL('../.cloudflare-demo-access.txt', import.meta.url), `GulBar Cloudflare demo merchant access\n\nDo‘kon paneli kirish kaliti:\n${secrets.DEMO_MERCHANT_TOKEN}\n\nFaqat loyiha egasi uchun. Git’ga kiritilmaydi.\n`);
console.log('Demo merchant key saved to ignored local files. Secret values were not printed.');

