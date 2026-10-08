import { readFileSync } from 'node:fs';
const secrets = JSON.parse(readFileSync(new URL('../.cloudflare-secrets.json', import.meta.url), 'utf8'));
const base = 'https://gulbar.bella-rose.workers.dev';
const response = await fetch(`${base}/api/admin/workspace`, { headers: { Authorization: `Bearer ${secrets.ADMIN_TOKEN}` } });
if (!response.ok) throw new Error('Cannot read merchant channel configuration.');
const shops = await response.json();
let reachable = 0, configured = 0;
for (const shop of shops) {
  if (!shop.telegramChatId) continue;
  configured++;
  try {
    const response = await fetch(`https://api.telegram.org/bot${secrets.TELEGRAM_BOT_TOKEN}/getChat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: shop.telegramChatId }), signal: AbortSignal.timeout(10000) });
    const data = await response.json();
    if (response.ok && data.ok && data.result.type === 'private' && String(data.result.id) === shop.telegramChatId) reachable++;
  } catch { /* Do not print credential-bearing request errors. */ }
}
console.log(JSON.stringify({ shops: shops.length, configuredTelegramChannels: configured, reachablePrivateChannels: reachable, unconfiguredOrUnreachable: shops.length - reachable }));
