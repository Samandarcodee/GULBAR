import 'dotenv/config';
import express from 'express';
import { resolve } from 'node:path';
import { createApp } from './app.js';

const demo = process.env.DEMO_MODE === 'true';
if (process.env.NODE_ENV === 'production' && demo) throw new Error('Production requires DEMO_MODE=false.');
const config = { demo, databasePath: process.env.DATABASE_PATH || './data/flowrs.sqlite',
  botToken: process.env.TELEGRAM_BOT_TOKEN, webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
  chatIds: JSON.parse(process.env.SHOP_CHAT_IDS || '{}'), merchantTokens: JSON.parse(process.env.MERCHANT_TOKENS || '{}'), adminToken: process.env.ADMIN_TOKEN };
if (!demo && (!config.botToken || !config.webhookSecret || !config.adminToken)) throw new Error('Live mode requires bot token, webhook secret and admin token. See .env.example.');
if (!demo) for (const id of Object.keys(config.chatIds)) {
  if (!config.merchantTokens[id] || config.merchantTokens[id].length < 24) throw new Error('Every live shop needs a unique merchant token (24+ characters).');
  if (!/^\d+$/.test(String(config.chatIds[id]))) throw new Error('Shop chat IDs must be positive private chat IDs.');
}
const { app, flushOutbox } = createApp(config);
app.use(express.static(resolve('dist')));
app.get('/{*path}', (req, res) => res.sendFile(resolve('dist/index.html')));
const port = Number(process.env.PORT || 3001);
app.listen(port, '127.0.0.1', () => console.log(`GulBar API: http://127.0.0.1:${port} (${demo ? 'demo' : 'live'})`));
setInterval(flushOutbox, 5000).unref();

