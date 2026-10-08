import { readFileSync, writeFileSync } from 'node:fs';
const root = name => new URL(`../${name}`, import.meta.url);
const secrets = JSON.parse(readFileSync(root('.cloudflare-secrets.json'), 'utf8'));
const onboarding = JSON.parse(readFileSync(root('.gulbar-onboarding.json'), 'utf8'));
const base = 'https://gulbar.bella-rose.workers.dev';
const health = await (await fetch(`${base}/api/health`)).json();
if (health.demo !== false) throw new Error('Only the live database may be linked.');
const response = await fetch(`${base}/api/admin/workspace`, { headers: { Authorization: `Bearer ${secrets.ADMIN_TOKEN}` } });
if (!response.ok) throw new Error('Cannot read shop settings.');
const shops = await response.json();
if (shops.length !== 1) throw new Error('Exactly one user-created shop is required; no ambiguous shop assignment will be made.');
const shop = shops[0];
if (shop.telegramChatId) { console.log('Existing merchant Telegram channel preserved.'); process.exit(0); }
const id = onboarding.merchantChatId;
if (!/^[1-9]\d{0,15}$/.test(id)) throw new Error('Previously supplied merchant chat ID is invalid.');
let chat;
try {
  const result = await fetch(`https://api.telegram.org/bot${secrets.TELEGRAM_BOT_TOKEN}/getChat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: id }), signal: AbortSignal.timeout(10000) });
  chat = await result.json();
} catch { throw new Error('Cannot verify the merchant private chat.'); }
if (!chat.ok || chat.result.type !== 'private' || String(chat.result.id) !== id) throw new Error('Merchant must start the bot in their private chat first.');
const written = await fetch(`${base}/api/admin/shops/${shop.id}/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secrets.ADMIN_TOKEN}` }, body: JSON.stringify({ shop, phone: shop.phone, telegramChatId: id }) });
if (!written.ok) throw new Error(`Shop settings were not changed (${written.status}).`);
writeFileSync(root('.gulbar-onboarding.json'), JSON.stringify({ ...onboarding, shopId: shop.id, status: 'linked_live_merchant_chat' }));
console.log('First real shop linked to the merchant private chat ID supplied by the owner. No messages or test orders sent.');
