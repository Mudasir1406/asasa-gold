# Asasa Gold — buy & sell 24K gold in PKR

A single-user demo built for the Asasa Founding Engineer assessment. Live PKR-per-gram pricing from two cross-checked sources, 75-second server-owned locked quotes, a double-entry ledger over wallet / holdings / inventory, receipts, and a reviewer drawer that triggers every stress case in the deployed app.

Read [WhatIDid.md](./WhatIDid.md) for the reasoning, assumptions and known gaps.

```
browser ──▶ web/  (Next.js, Vercel)
              │  /api/* rewritten to the API origin (no CORS)
              ▼
            api/  (Laravel, Railway)  ──▶ Postgres
              │
              ├─▶ PakGold method: api.gold-api.com XAU/USD × open.er-api.com USD/PKR
              └─▶ GoldPrice.org:  data-asg.goldprice.org/dbXRates/PKR
```

## Layout

| path | what |
|---|---|
| `api/` | Laravel 13 JSON API: pricing snapshots, quotes, settlement, ledger, reviewer endpoints. Pest tests. Dockerfile for Railway. |
| `web/` | Next.js 16 single page, mobile-first. Vitest for money maths. |
| `docs/superpowers/` | the design spec and the implementation plan the code was built from |

## Run it locally

Prerequisites: PHP 8.4 with `pdo_sqlite`, Composer 2, Node 20+.

**API** (port 8000, SQLite):

```bash
cd api
composer install
cp .env.example .env
php artisan key:generate
touch database/database.sqlite
php artisan migrate --seed
php artisan serve          # http://localhost:8000
```

**Web** (port 3000):

```bash
cd web
npm install
cp .env.example .env.local     # API_URL=http://localhost:8000
npm run dev                    # http://localhost:3000
```

Open http://localhost:3000. Seed state: wallet PKR 250,000.00, your gold 2.500 g, platform inventory 50.000 g.

## Tests

```bash
cd api && ./vendor/bin/pest            # unit + feature, SQLite in-memory, all HTTP faked
cd web && npm test                     # money formatters / quote maths
api/scripts/double-confirm.sh http://localhost:8000   # 10 parallel confirms → exactly one trade
```

## API

All amounts are integers: PKR in **paisa**, gold in **milligrams**, prices in **paisa per gram**. Errors use `{ "error": { "code", "message", "details?" } }`.

| method | path | notes |
|---|---|---|
| GET | `/api/state` | price view, balances, trading status, integrity, recent trades, `server_now` |
| GET | `/api/price` | price view; refreshes sources if the newest snapshot is ≥ 5 min old |
| POST | `/api/quotes` | `{ side: BUY\|SELL, input_mode: PKR\|GOLD, amount }` → 201 quote locked for 75 s. 409 `TRADING_PAUSED`, 422 `INSUFFICIENT_CASH\|GOLD\|INVENTORY` |
| GET | `/api/quotes/{id}` | quote with `seconds_remaining`; expired quotes flip to `EXPIRED` on read |
| POST | `/api/quotes/{id}/confirm` | settles once. Re-confirm returns the same receipt with `idempotent_replay: true`. 409 `QUOTE_EXPIRED`, 422 `INSUFFICIENT_*` |
| GET | `/api/trades`, `/api/trades/{id}` | history and receipts |
| GET | `/api/integrity` | re-sums the ledger and checks the invariants |
| GET/PUT | `/api/demo/settings` | `fail_primary`, `fail_fallback`, `force_stale`, `guardrail_paisa_per_gram` |
| POST | `/api/demo/price/refresh` | force a fetch now (bypasses the 5-min cache; demo only) |
| POST | `/api/demo/balances` | set wallet / gold / inventory (balanced adjustment entries) |
| POST | `/api/demo/quotes/{id}/expire` | expire a quote immediately |
| POST | `/api/demo/reset` | back to seed |

## Trying the stress cases

Open **Reviewer tools** (top right of the app). Everything below works on the deployed app.

| case | do this | expect |
|---|---|---|
| A source stops answering | Kill PakGold → Force refresh | badge switches to GoldPrice.org, amber "single source" banner, trading continues |
| Neither source can be trusted | Kill both → Force refresh | trading paused, last known price greyed with its age, inputs disabled with the reason |
| A quote expires | Lock a price, wait 75 s (or Expire current quote) | "Price lock expired", one tap to re-quote, delta vs the old price shown |
| A balance runs short | Wallet → PKR 5,000 / Gold → 0.100 g / Inventory → 0.500 g, then trade | 422 naming what ran short with required vs available; also re-checked at Confirm |
| Confirm pressed twice | double-click Confirm, or run `scripts/double-confirm.sh` | one trade, same receipt, ledger entry count unchanged, integrity ✓ |
| Guardrail | set guardrail above market×1.10 (e.g. 50,000) | buy price rises to the floor and the review shows the guardrail line; sell unchanged |

## Deploy

**API → Railway** (Dockerfile in `api/`). Add a Postgres service, then set on the API service:

| var | value |
|---|---|
| `APP_KEY` | output of `php artisan key:generate --show` |
| `APP_ENV` / `APP_DEBUG` | `production` / `false` |
| `APP_URL` | the Railway domain |
| `DB_CONNECTION` | `pgsql` |
| `DB_URL` | `${{Postgres.DATABASE_URL}}` |
| `CACHE_STORE` / `SESSION_DRIVER` | `database` / `file` |
| `LOG_CHANNEL` | `stderr` |
| `GUARDRAIL_PAISA_PER_GRAM` | `3500000` |

Migrations and the idempotent seed run on boot. Health check: `/up`.

**Web → Vercel**: import the repo, set **Root Directory** to `web`, add `API_URL=https://<your-railway-domain>`. Nothing else.

## Live

- App: _(link)_
- API: _(link)_
