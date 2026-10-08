# GulBar Cloudflare live deployment

Public URL: https://gulbar.bella-rose.workers.dev
Worker: `gulbar`; active D1 database: `gulbar-live` (`65fdffc5-63df-4d4e-a01f-5ba5d7dbe620`).
`DEMO_MODE=false`. Workers serves the Vite assets and Hono API; D1 stores real shops, products,
merchant/admin accounts, orders and the notification outbox.

The live database was initialized separately from the former demo database. The three sample
shops, six sample products, demo orders, outbox entries and old sessions were excluded. The
existing owner account and user-created shop/merchant account were preserved, including password
hashes and account state. Users sign in again after the switch. The first real shop's Telegram
channel uses the private chat ID supplied by the owner and was verified through Telegram getChat.

## Updating

```powershell
npm run cf:types
npm run cf:deploy
node cloudflare/verify-live.mjs
node cloudflare/check-live-channels.mjs
node cloudflare/setup-telegram.mjs
```

`verify-live.mjs` checks mode, absence of sample catalog rows, unsigned customer rejection,
protected admin access, webhook authentication and public mobile UI. It creates no orders or
merchant accounts. Channel checks only read Telegram chat details and send no messages.
`setup-telegram.mjs` reads bot/menu/webhook configuration without printing credentials.

Apply new migrations to `gulbar-live`, never import demo seeds into it. The account's query API
previously returned authorization error 7403; the supported SQL-file import works:

```powershell
npx wrangler d1 execute gulbar-live --remote --file=cloudflare/migrations/NEW_MIGRATION.sql
```

Migrations 0001–0003 are applied. D1 stock reservation, hidden-product validation and cancellation
restock run in SQL triggers. Product editing also checks stale stock snapshots. Merchant/admin
sessions are role and shop scoped. Password resets and account disabling revoke sessions.

## Bot and orders

`@GulBarr_bot` points to the same HTTPS Mini App and secret-protected webhook. `/start`, `/help`
and `/id` work in private chats. Buyer order APIs require signed Telegram initData; browser/demo
identifiers do not grant access. Shop notification IDs are configured in the admin panel.
Customers may browse normally, but must enter through Telegram to order.

New orders reserve stock, use server-side prices and enter the merchant Telegram outbox.
`waitUntil` requests an immediate dispatch; a minute cron retries pending messages. Leases prevent
parallel dispatchers taking the same row. Delivery is at least once after an ambiguous network
timeout. Merchant callback actions must come from the configured private chat owner. Buyers
follow status in the Mini App; buyer push notifications are not implemented.

## Secrets and local development

Bot token, webhook secret and owner bootstrap key are Cloudflare secrets. Ignored local access
files contain initial credentials; an initial password stops working after the owner changes it.
The existing demo owner merchant key is inactive in live mode. Never expose server secret files.

Local `.env` also uses `DEMO_MODE=false` and `data/gulbar-live.sqlite`. Node handles inventory
inside transactions, so D1 stock triggers are not copied to Node SQLite. Both runtimes share
schemas, account/password logic and Telegram signature verification. Automated tests use isolated
in-memory fixtures and mocked Telegram requests, never the real business database.

Migration backups and generated SQL are in ignored `.gulbar-migration/`; do not publish them.

## Address and order notifications

The app lives at https://gulbar.bella-rose.workers.dev (Worker `gulbar`). The earlier address
https://flowrs-urganch.bella-rose.workers.dev (Worker `flowrs-urganch`) is kept and deployed with the same code and the same
database, so old links still work. Deploy both with `npm run cf:deploy` and `npx wrangler deploy --name flowrs-urganch`.
The bot menu button and webhook point to the new address (`node cloudflare/setup-telegram.mjs --configure`; it then resets the
command list, so run `node cloudflare/setup-bot-profile.mjs` afterwards). Secrets are per Worker: after creating a Worker run
`npx wrangler secret bulk .cloudflare-secrets.json`. A custom domain can be attached later in the Cloudflare dashboard.

**Buyer messages.** When a shop accepts, sends, delivers or cancels an order, the buyer gets a Telegram message from the bot
(only the request that really changed the status sends it; buyers who never started the bot are skipped without error).

**Automatic cancel.** The minute cron cancels orders still `pending` after `PENDING_EXPIRY_MINUTES` (default 30, minimum 5, set in
`wrangler.jsonc`). Flowers return to stock once through the existing SQL trigger, the buyer is told, and the shop gets a note.
