import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const file = new URL('../.cloudflare-secrets.json', import.meta.url);
const secrets = JSON.parse(readFileSync(file, 'utf8'));
const base = 'https://gulbar.bella-rose.workers.dev';
// Earlier addresses of this same app; the bot may still point at one of them and is moved to `base`.
const previousBases = ['https://flowrs-urganch.bella-rose.workers.dev'];
async function telegram(method, body = {}) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${secrets.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(`${method}: Telegram rejected request (${response.status}).`);
    return result.result;
  } catch (error) {
    // Fetch exceptions may contain the token-bearing URL; never print the original error.
    throw new Error(`Telegram ${method} failed. Check server credentials and connectivity.`);
  }
}
try {
  const bot = await telegram('getMe');
  console.log(JSON.stringify({ bot: bot.username, name: bot.first_name, id: bot.id }));
  if (!secrets.TELEGRAM_WEBHOOK_SECRET) {
    secrets.TELEGRAM_WEBHOOK_SECRET = randomBytes(32).toString('hex');
    writeFileSync(file, JSON.stringify(secrets));
    console.log('Webhook secret generated in ignored server file.');
  }
  if (process.argv.includes('--configure')) {
    const previous = await telegram('getWebhookInfo');
    const target = `${base}/api/telegram/webhook`;
    if (previous.url && previous.url !== target && !previousBases.some(b => previous.url === `${b}/api/telegram/webhook`)) throw new Error('Bot already has a different webhook. Existing integration was preserved.');
    const probe = await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secrets.TELEGRAM_WEBHOOK_SECRET }, body: '{}' });
    if (probe.status !== 200) throw new Error('GulBar webhook is not ready. Deploy the bot command handler before configuring Telegram.');
    await telegram('setChatMenuButton', { menu_button: JSON.stringify({ type: 'web_app', text: 'GulBar', web_app: { url: base } }) });
    await telegram('setMyCommands', { commands: JSON.stringify([
      { command: 'start', description: 'GulBar ilovasini ochish' },
      { command: 'id', description: 'Do‘konni ulash uchun Telegram ID' },
      { command: 'help', description: 'GulBar haqida yordam' },
    ]) });
    await telegram('setWebhook', { url: target, secret_token: secrets.TELEGRAM_WEBHOOK_SECRET, allowed_updates: JSON.stringify(['message', 'callback_query']), drop_pending_updates: false });
    console.log('GulBar menu, commands and webhook configured.');
  }
  const info = await telegram('getWebhookInfo');
  const menu = await telegram('getChatMenuButton');
  const commands = await telegram('getMyCommands');
  console.log(JSON.stringify({ webhook: info.url, pendingUpdates: info.pending_update_count, webhookError: info.last_error_message || null, menuType: menu.type, menuUrl: menu.web_app?.url, commands: commands.map(c => c.command) }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
