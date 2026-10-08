# GulBar: guide for Claude Code sessions (cloud or local)

GulBar is an Urganch flower marketplace that runs as a Telegram Mini App (bot `@GulBarr_bot`).
The owner is Samandar and writes in Uzbek (Latin script). **Reply in Uzbek.** Keep answers short and concrete.
The owner often works from a phone, so end every task with: what changed, how it was checked, and what he must still do (if anything).

## Stack and layout
- `src/` React 19 + Vite + TypeScript + `motion/react`; Uzbek UI text uses the typographic apostrophes `‘ ’` (not `'`).
- `server/` shared business rules in plain JS (delivery, hours, support, reviews, accounts) used by BOTH runtimes, plus `server/app.js` (Express + node:sqlite, demo/e2e only).
- `cloudflare/worker.ts` production API (Hono on Cloudflare Workers + D1 database `gulbar-live`); `cloudflare/migrations/` SQL.
- `tests/` Playwright e2e against the Node demo server (`tests/serve.js`, port 3107); `server/*.test.js` unit tests (node:test).
- Production: https://gulbar.bella-rose.workers.dev (Worker `gulbar`). Old URL `flowrs-urganch.bella-rose.workers.dev` is a second Worker with the same database.

## Commands
- `npm run check` types (site + Worker), unit tests and the production build. **Run it before every commit.** Works in a cloud session.
- `npm run test:e2e` browser tests (needs Playwright browsers; usually only on the owner's PC).
- `npm run cf:smoke` smoke test of the real Worker (instructions are at the top of `cloudflare/smoke.mjs`).

## Rules
1. Never commit or print secrets. `.env`, `.dev.vars`, `.cloudflare-secrets.json`, `.gulbar-*`, `data/`, `.wrangler/` are git-ignored; do not open them.
2. Business logic must behave the same in `server/app.js` and `cloudflare/worker.ts`. Prefer putting shared rules in `server/*.js`. Do not register a Worker route twice (a unit test guards this). Shop-side handlers have no `customerId`.
3. Orders, shops and products are JSON blobs in D1 with SQL triggers enforcing stock, price and status changes. Changing a trigger means a new migration that recreates it completely.
4. **Migrations are NOT applied automatically.** The remote database was migrated with `wrangler d1 execute --file`, so never run `wrangler d1 migrations apply --remote`. If a change adds a migration file, say so loudly in the pull request: the owner must apply that single file BEFORE merging, otherwise the deployed code breaks.
5. Deploys: merging to `main` triggers an automatic deploy (Cloudflare Workers Builds). Work on a branch and open a pull request; do not push directly to `main` unless the owner asks.
6. UI is mobile-first (Telegram WebView, 390 px wide). Check small screens, keep tap targets at least 44 px, and keep the plain minimal style of the home page.
7. When something touches money, orders, accounts or the database, add or update a test.
8. Customer-facing text is Uzbek. Admin and shop panels are Uzbek too.

## Useful facts
- Orders expire after 30 minutes without an answer (`PENDING_EXPIRY_MINUTES`); a cron runs every minute.
- Telegram sign-in data (`initData`) is accepted for 24 hours. Shop-owner and admin accounts use login + password; sessions last 8 hours.
- A shop cannot be deleted while it has pending, accepted or delivering orders.
- **Card-transfer payments** (`server/payment.js` holds all rules): the buyer pays the shop's own card (no payment provider; GulBar never touches the money). The card is stored in the `shop_cards` table and shown to the buyer only after the shop accepts. The card covers the flowers (`subtotal`); the delivery fee is always cash for the driver. Shops with `delivery: 'taxi'` require card payment for delivery orders. A card order can't go out for delivery until the shop confirms the money. `payment.status`: unpaid → claimed ("To'ladim") → confirmed; an unpaid accepted order is cancelled after `PAYMENT_DUE_MINUTES` (default 30; `updatedAt` marks the window start).
- Buyer Telegram ids are stored as `tg:<id>`; use `telegramUserId()` from `server/auth.js` to get the chat id (a past bug sent nothing because the prefix was not stripped).
- Preview URLs of non-production branches use the REAL database: never place test orders there.
