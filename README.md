# GulBar — Urganch Telegram Mini App MVP

Cloudflare live: https://gulbar.bella-rose.workers.dev
Deployment configuration and D1 instructions: [docs/cloudflare.md](docs/cloudflare.md).
The deployed site uses the separate `gulbar-live` database, login/password merchant accounts,
Telegram customer verification and real merchant notifications. Sample shops/products/test orders
are excluded. The owner's existing admin and user-created merchant accounts were preserved.

React + TypeScript + Vite frontend, Express API, Node 24 built-in SQLite, Motion animations.
Customer catalog, category/shop/search filters, favorites, single-shop cart, recipient delivery form,
cash-on-delivery order, order tracking, merchant order and product management.
Merchant panel at `/merchant?shop=lola` includes order search/status filters, sales summaries,
product visibility and inventory editing, shop opening/closing and delivery settings.
The panel retains access to closed shops and hidden products. Sales summaries cover the latest
100 orders and include delivery charges. Images are entered as HTTPS links; file upload is not included.

## Local preview

Requires Node.js 24+. `.env` is local and ignored by Git. `.env.example` documents settings.

```powershell
npm install
# If .env is missing:
Copy-Item .env.example .env
npm run dev
```

Open http://localhost:5173. API: http://127.0.0.1:3001.
`DEMO_MODE=true` seeds 3 fictional florists and 6 sample products. All orders in this mode
are test orders. No Telegram messages are sent. Merchant panel is intentionally open in demo.
Sample photos from Unsplash are bundled in `public/images` and are not exact product photos.
The current local `.env` uses live mode and `data/gulbar-live.sqlite`, with no sample shops/products.
Browser demo IDs are used only in isolated tests; live buyer history requires Telegram authentication.

```powershell
npm run build
npm test
npm run test:e2e
npm start
```

The API serves the built frontend at http://127.0.0.1:3001. Dev uses Vite proxy.

## Real Telegram launch

1. Create a bot in @BotFather; keep the token server-side as `TELEGRAM_BOT_TOKEN`.
2. Deploy the built frontend and API behind HTTPS. Proxy to the loopback API. Configure
   `DEMO_MODE=false`, `NODE_ENV=production`, a **fresh** `DATABASE_PATH`, `ADMIN_TOKEN`
   and `TELEGRAM_WEBHOOK_SECRET` (long random secrets). Never reuse the demo database.
3. Bootstrap the owner admin account, sign in at `/admin`, and add actual florists and their
   login accounts. Florists sign in at `/merchant` and add products. Enter verified prices,
   real images, availability, delivery fees and addresses.
4. Each florist starts the bot in a **private chat**, sends `/id`, and gives the ID to the owner.
   The owner stores it in that shop's admin settings. Each florist receives a distinct login
   and temporary password and must replace the password before using the panel.
   Legacy SHOP_CHAT_IDS / MERCHANT_TOKENS mappings remain supported for existing integrations.
5. Set the bot’s Mini App/menu URL in @BotFather to the HTTPS frontend URL. Register a
   Telegram `setWebhook` for `https://YOUR_DOMAIN/api/telegram/webhook`, passing the same
   `secret_token` as `TELEGRAM_WEBHOOK_SECRET`. These external actions are not performed by this repo.
6. Test a real Telegram signed session, one real merchant notification and status callback
   before accepting public orders. The app uses `initData` HMAC validation with a 1-hour expiry.

New orders reserve stock in a SQLite transaction, compute prices server-side and enter an
outbox for merchant Telegram notification. Pending messages retry with backoff; the merchant
can accept/cancel in Telegram or use `/merchant`. Accepted orders can become delivering,
then delivered. Cancellation restores stock once. Request UUIDs prevent duplicate checkout
on network retry. Notification delivery is **at least once**: on an ambiguous Telegram timeout
the same order notification can arrive twice; use the order ID to identify it. State changes
are idempotent. Buyer history refreshes every 15 seconds; buyer push notifications are not added yet.

## Admin and merchant API

Admin `Authorization: Bearer <ADMIN_TOKEN>`:

```json
{
  "id": "actual-shop", "name": "Actual shop name", "subtitle": "Shop description",
  "address": "Verified Urganch address", "deliveryFee": 20000,
  "deliveryTime": "Time agreed with merchant", "color": "#e2e9dd",
  "initials": "AS", "active": true
}
```

- `POST /api/admin/shops` — create/update/deactivate shop (body above).
- `GET /api/merchant/:shopId/orders` — only that shop’s orders.
- `GET /api/merchant/:shopId/workspace` — shop settings and its full product list, including hidden products.
- `PATCH /api/merchant/:shopId/settings` — name, subtitle, address, deliveryFee, deliveryTime, active.
- `PATCH /api/merchant/:shopId/orders/:id` — `{ "status": "accepted" }`.
- `POST /api/merchant/:shopId/products` — name, description, price (integer UZS),
  category (`bouquet`, `rose`, `tulip`, `box`), HTTPS image, stock, badge, active (defaults true).
- `PATCH /api/merchant/:shopId/products/:id` — update product fields.
  The UI sends `expectedStock` to reject edits made from an outdated inventory snapshot.

The `/admin` dashboard creates shops and merchant accounts, edits business/contact/delivery settings,
and resets or disables merchant accounts. `/merchant` accepts login/password; first login requires
a password change. Server-side sessions last 8 hours, store only a SHA-256 digest of the random token,
and are checked against the current account state and shop on each request. Passwords use salted
PBKDF2-SHA256. Account resets and disabling revoke all existing sessions. UI tokens remain in memory;
refreshing the page requires signing in again. Legacy owner/per-shop bearer keys remain supported.
Initial owner credentials are in the ignored `.gulbar-admin-access.txt`; never commit it.
See [admin guide](docs/admin-guide.md) for owner/merchant workflow.

## Structure

- `src/components/` — catalog cards, dialog, checkout, merchant panel.
- `src/lib/` — API client, formatting, safe local preferences.
- `server/` — catalog seed, database, Telegram verification, routes, outbox, tests.
- `docs/design.md` — visual direction and accessible motion decisions.

## MVP limits

Only Urganch, one shop per order, delivery by the florist, pay on delivery. No online payment,
platform couriers, commissions, refunds, uploaded image storage, map geocoding or automated
pending-order expiry. Shop stock reservations remain pending until a merchant acts; monitor
pending orders. Delivery windows are requests, confirmed by the florist. A production deployment
still needs actual florist data, infrastructure, backups and Telegram credentials. Keep SQLite
on persistent disk, use a single API instance, and back it up regularly. Do not expose demo mode
publicly: its merchant actions are deliberately unauthenticated.

References: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app,
https://core.telegram.org/bots/api#sendmessage, https://motion.dev/docs/react-motion-config.

