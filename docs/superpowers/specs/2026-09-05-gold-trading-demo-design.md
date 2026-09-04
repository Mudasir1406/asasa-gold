# Asasa Gold Trading Demo — Design Spec

**Date:** 2026-09-05
**Status:** Approved (verbal, in-session)
**Source brief:** Asasa Founding Engineer Practical Assessment

## 1. Goal

A deployable, single-user demo for buying and selling 24K gold in PKR using live market data. A reviewer must be able to: understand the starting balances, complete a trade, see updated balances and a receipt — and trigger every stress case (source outage, expired quote, short balance, double confirm, guardrail) from inside the deployed app without touching code.

Out of scope: authentication, real money movement, admin panel, multi-user.

## 2. Repository & deployment shape

One public GitHub repo, two deploy roots:

```
/
  api/    Laravel 12 (PHP 8.4) + Postgres    → Railway (Docker)
  web/    Next.js 15 (App Router)            → Vercel (root dir = web)
  docs/   specs, plans
  README.md      setup instructions (local + deploy)
  WhatIDid.md    understanding, assumptions, decisions, known gaps
```

The browser only ever talks to the Next.js origin. `web/next.config.ts` rewrites `/api/:path*` → `${API_URL}/api/:path*`, so there is no CORS surface and the Railway URL lives in one env var.

Local dev: `api/` runs on SQLite (file) with `php artisan serve`; `web/` runs `next dev` with `API_URL=http://localhost:8000`. Tests run on SQLite in-memory. Production is Postgres.

## 3. Units, precision, rounding

**No floats touch money or metal.** All stored and transported amounts are integers:

| Quantity | Unit | Type |
|---|---|---|
| PKR amounts | paisa (1 PKR = 100 paisa) | bigint |
| Gold amounts | milligrams (1 g = 1,000 mg) | bigint |
| Unit prices | paisa per gram | bigint |

Constants:

```
TROY_OUNCE_GRAMS      = 31.1034768
BUY_SPREAD_BPS        = 11000   (× 1.10)
SELL_SPREAD_BPS       = 9000    (× 0.90)
DIVERGENCE_MAX_BPS    = 300     (3 %)
PRICE_REFRESH_SECONDS = 300     (fetch no more than once per 5 min)
PRICE_MAX_AGE_SECONDS = 600     (a snapshot older than this cannot back a quote)
QUOTE_TTL_SECONDS     = 75
MIN_TRADE_MG          = 10      (0.010 g)
SOURCE_TIMEOUT_SEC    = 6
```

Price derivation (integer math after the single float→paisa conversion):

```
market_paisa = round(market_pkr_per_gram × 100)
buy_paisa    = max( intdiv(market_paisa × 110 + 50, 100), guardrail_paisa )
sell_paisa   = intdiv(market_paisa × 90 + 50, 100)
guardrail_applied = guardrail_paisa > intdiv(market_paisa × 110 + 50, 100)
```

Quote math — the server rounds **once**, at quote issue, and stores both legs. Settlement replays the stored integers and never recomputes. Rounding always favours the platform:

| Side | User enters | Computed |
|---|---|---|
| BUY | PKR `A` paisa | `gold_mg = floor(A × 1000 / buy)`; `total = ceil(gold_mg × buy / 1000)` (≤ A) |
| BUY | gold `G` mg | `total = ceil(G × buy / 1000)` |
| SELL | gold `G` mg | `total = floor(G × sell / 1000)` |
| SELL | PKR `A` paisa | `gold_mg = ceil(A × 1000 / sell)`; `total = floor(gold_mg × sell / 1000)` (≥ A) |

Reject quotes with `gold_mg < MIN_TRADE_MG`.

Display: PKR with 2 decimals and thousands separators (`PKR 43,490.64`), gold with 3 decimals (`2.500 g`).

## 4. Pricing sources

### 4.1 What was found

- `pakgold.com` (named in the brief) is a parked HugeDomains listing.
- `pakgold.pk` is the live Pakistani gold-rate site. Its front-end JS computes rates client-side from two public APIs:
  - `GET https://api.gold-api.com/price/XAU` → `{ price: <USD per troy oz>, updatedAt }`
  - `GET https://open.er-api.com/v6/latest/USD` → `{ rates: { PKR }, time_last_update_utc }`
- `GoldPrice.org` exposes `GET https://data-asg.goldprice.org/dbXRates/PKR` → `{ ts, items: [{ xauPrice: <PKR per troy oz> }] }`. It returns `Forbidden` unless sent browser-like `User-Agent`, `Referer: https://goldprice.org/`, `Origin: https://goldprice.org`. Server-side only.
- Live cross-check at design time: 39,555.12 vs 39,536.95 PKR/g — 0.046 % apart.

### 4.2 Sources

**Primary — `pakgold`** ("PakGold method"): `xau_usd_per_oz × usd_to_pkr ÷ 31.1034768`. Both upstream calls must succeed. Metadata kept: `xau_usd`, `usd_pkr`, `xau_updated_at`, `fx_updated_at`.

**Fallback — `goldprice`**: `xauPrice ÷ 31.1034768`. Metadata kept: `ts`.

The UI labels the primary as **"PakGold (pakgold.pk method: gold-api × USD/PKR)"** with a tooltip explaining the derivation. Honesty over pretending to scrape a dead domain.

### 4.3 Refresh & snapshot

Lazy refresh on read, guarded by `Cache::lock('price-refresh', 20)` against stampede. Rule: if the newest snapshot is younger than `PRICE_REFRESH_SECONDS`, serve it; otherwise fetch **both** sources concurrently (`Http::pool`, 6 s timeout each) and write one `price_snapshots` row — always, including failures, so outage history is visible.

Snapshot verification status:

| Primary | Fallback | Divergence | `verification` | `selected_source` | `market_paisa` |
|---|---|---|---|---|---|
| ok | ok | ≤ 3 % | `CROSS_CHECKED` | `pakgold` | primary |
| ok | ok | > 3 % | `DISPUTED` | null | null |
| ok | fail | — | `SINGLE_SOURCE` | `pakgold` | primary |
| fail | ok | — | `SINGLE_SOURCE` | `goldprice` | fallback |
| fail | fail | — | `UNAVAILABLE` | null | null |

### 4.4 Trading state (what the UI shows)

Derived from the newest snapshot `S` plus demo flags:

| Condition | `status` | trading | reason shown |
|---|---|---|---|
| `force_stale` demo flag | `PAUSED` | off | "Price data is stale (forced for demo)" |
| `S.verification = CROSS_CHECKED` | `LIVE` | on | — |
| `S.verification = SINGLE_SOURCE` | `DEGRADED` | on | "Cross-check unavailable — using {source} only" / "Primary source down — using GoldPrice.org" |
| `S.verification ∈ {DISPUTED, UNAVAILABLE}` | `PAUSED` | off | "Sources disagree by X %" / "Neither price source is responding" |
| `S.market != null` but `age(S) ≥ PRICE_MAX_AGE_SECONDS` | `PAUSED` | off | "Price is N min old" |

When paused, the UI still shows the last known market price greyed out with its age, so the product "tells the truth" rather than going blank.

Normal path never fetches more often than every 5 minutes. The reviewer drawer has an explicit **"Force refresh (demo — bypasses 5-min cache)"** so toggled outages take effect immediately.

## 5. Guardrail

**Assumption:** the guardrail is a configured floor on the customer *buy* price, in PKR per gram. Its purpose is to stop the platform selling gold too cheaply if a feed under-reports or lags. Default `GUARDRAIL_PAISA_PER_GRAM = 3,500,000` (PKR 35,000/g) — comfortably below the current ~43,500 buy price, so it is inert until a reviewer raises it from the drawer. When it binds, the quote review shows a distinct line: *"Guardrail applied — floor PKR 50,000.00 is above market × 1.10 (PKR 43,490.64)."* The guardrail never affects the sell price.

In production this floor would likely derive from inventory cost basis; noted in WhatIDid.md.

## 6. Ledger

Double-entry across six accounts. Every trade writes postings that sum to zero per asset.

| account_id | asset | role |
|---|---|---|
| `customer_cash` | PKR | reviewer's wallet |
| `customer_gold` | GOLD | reviewer's holdings |
| `platform_cash` | PKR | platform float |
| `platform_gold` | GOLD | platform inventory |
| `external_cash` | PKR | outside world — seed & demo adjustments only |
| `external_gold` | GOLD | outside world — seed & demo adjustments only |

Trade postings (amount signed, + credits the account):

```
BUY  gold_mg / total_paisa:
  customer_cash  −total    platform_cash  +total
  customer_gold  +gold_mg  platform_gold  −gold_mg
SELL:
  customer_cash  +total    platform_cash  −total
  customer_gold  −gold_mg  platform_gold  +gold_mg
```

`accounts.balance` is a cached bigint updated in the same transaction under `lockForUpdate()`; it exists for O(1) reads and row locking. The ledger is the truth.

Invariants (checked by `GET /api/integrity` and asserted in tests):

1. For each asset, `SUM(ledger_entries.amount) = 0` across all accounts.
2. For each account, `SUM(ledger_entries.amount) = accounts.balance`.
3. For each trade, its entries sum to 0 per asset.
4. Trades never post to `external_*` accounts, so across trades `customer_gold + platform_gold` is constant — gold is conserved, never minted.

Seed (PKR / grams):

| account | balance |
|---|---|
| customer_cash | PKR 250,000.00 |
| customer_gold | 2.500 g |
| platform_gold | 50.000 g |
| platform_cash | PKR 5,000,000.00 (float, not gated; keeps sells solvent) |
| external_* | the negative offsets |

Only insufficiency of **customer cash**, **customer gold**, and **platform inventory** blocks a trade — matching the brief's three balances.

## 7. Quote lifecycle

```
ACTIVE ──confirm──▶ SETTLED
  │
  └── now ≥ expires_at ──▶ EXPIRED   (marked on read or on confirm attempt)
```

**Issue** — `POST /api/quotes { side, input_mode, amount }`:
1. Require `trading.enabled`, else `409 TRADING_PAUSED { reason }`.
2. Compute unit price from the current snapshot + guardrail; compute both legs per §3.
3. Validate affordability now: `422 INSUFFICIENT_CASH | INSUFFICIENT_GOLD | INSUFFICIENT_INVENTORY` with `{ required, available }` in the same units.
4. Insert quote with `expires_at = now + 75 s`. Return `201` with the quote, `server_now`, and `seconds_remaining`.

**Read** — `GET /api/quotes/{id}` returns the quote, `status`, `seconds_remaining`, `server_now`. Expiry is lazily materialised: if `ACTIVE` and past `expires_at`, the row is updated to `EXPIRED` before responding.

**Confirm** — `POST /api/quotes/{id}/confirm`, one DB transaction:
1. `SELECT … FOR UPDATE` the quote row.
2. `SETTLED` → return the existing trade receipt, `200`, `idempotent_replay: true`. No new ledger entries.
3. `EXPIRED`, or `ACTIVE` with `now ≥ expires_at` → mark `EXPIRED`, return `409 QUOTE_EXPIRED` with the original inputs so the client can re-quote in one tap.
4. Lock the four trade accounts `FOR UPDATE`; re-check affordability using stored legs → `422 INSUFFICIENT_*`.
5. Insert `trades` (with `quote_id UNIQUE`), four `ledger_entries`, update four balances, set quote `SETTLED`, `settled_at`.
6. Return `200` receipt with `balances_before` and `balances_after`.

Two independent guards against double settlement: the row lock + status check, and the `UNIQUE` constraint on `trades.quote_id`. A race that somehow beat the lock still cannot insert a second trade; the unique-violation path is caught and returns the existing receipt.

An `ACTIVE` quote is honoured on confirm **even if the feed has since degraded or paused** — the lock is a promise to the customer for 75 s, and the price was verified at issue. New quotes are what pausing blocks. Documented as a decision.

**Expiry UX** — the client shows a ring countdown from server-corrected time and disables Confirm at 0. On `409 QUOTE_EXPIRED` (or local zero) it shows *"Price lock expired"* with a single **Get a fresh quote** action that re-issues with the same inputs and shows the delta: *"New locked price: PKR 43,512.10 (▲ PKR 21.46 since your last quote)."* Never silently re-quote.

**Clock skew** — every quote response includes `server_now`. The client computes `offset = server_now − Date.now()` once per quote and counts down against corrected time. The server is the only authority on validity.

## 8. API

All responses JSON. Money/metal fields are integers in paisa/mg; the client formats. Timestamps ISO-8601 UTC with milliseconds.

```
GET  /api/state
     → { price: PriceView, balances: Balances, trading: {enabled, code, reason},
         integrity: {ok, checked_at}, recent_trades: Trade[], server_now }
GET  /api/price                → PriceView (triggers lazy refresh if due)
POST /api/quotes               → 201 Quote | 409 TRADING_PAUSED | 422 INSUFFICIENT_* | 422 VALIDATION
GET  /api/quotes/{id}          → Quote
POST /api/quotes/{id}/confirm  → 200 Receipt | 409 QUOTE_EXPIRED | 422 INSUFFICIENT_* | 404
GET  /api/trades               → Trade[] (newest 25)
GET  /api/trades/{id}          → Receipt
GET  /api/integrity            → IntegrityReport

# Reviewer tools (clearly labelled demo-only; no auth per brief)
GET  /api/demo/settings
PUT  /api/demo/settings        { fail_primary?, fail_fallback?, force_stale?, guardrail_paisa_per_gram? }
POST /api/demo/price/refresh   → PriceView (bypasses 5-min cache)
POST /api/demo/balances        { customer_cash_paisa?, customer_gold_mg?, platform_gold_mg? }
                                 (writes balanced adjustment entries against external_*)
POST /api/demo/quotes/{id}/expire
POST /api/demo/reset           → wipes ledger/quotes/trades/snapshots/settings, re-seeds
```

Error envelope: `{ error: { code, message, details? } }`.

`PriceView`:
```
{
  status: 'LIVE'|'DEGRADED'|'PAUSED',
  trading: { enabled, code: null|'PRICE_UNAVAILABLE'|'PRICE_DISPUTED'|'PRICE_STALE', reason },
  market_paisa_per_gram, buy_paisa_per_gram, sell_paisa_per_gram,   // null when no trusted price
  last_known_market_paisa_per_gram, last_known_at,                    // for the greyed-out paused view
  guardrail_paisa_per_gram, guardrail_applied,
  source: {
    selected: 'pakgold'|'goldprice'|null,
    verification: 'CROSS_CHECKED'|'SINGLE_SOURCE'|'DISPUTED'|'UNAVAILABLE',
    divergence_bps,
    primary:  { name:'PakGold', ok, paisa_per_gram, error, meta },
    fallback: { name:'GoldPrice.org', ok, paisa_per_gram, error, meta }
  },
  fetched_at, age_seconds, next_refresh_in_seconds, refresh_interval_seconds, max_age_seconds,
  server_now
}
```

`Receipt`: `{ trade: {id, side, gold_mg, total_paisa, unit_price_paisa_per_gram, market_paisa_per_gram, spread_bps, guardrail_applied, guardrail_paisa_per_gram, source, price_fetched_at, quote_id, settled_at}, balances_before, balances_after, idempotent_replay }`.

## 9. Data model (Postgres; SQLite-compatible)

```
accounts          id text PK, asset text, balance bigint, updated_at
ledger_entries    id bigserial, trade_id uuid null, kind text ('SEED'|'TRADE'|'ADJUSTMENT'),
                  account_id text FK, asset text, amount bigint, created_at
                  index (trade_id), index (account_id)
price_snapshots   id bigserial, fetched_at timestamptz, verification text, selected_source text null,
                  market_paisa_per_gram bigint null, divergence_bps int null,
                  primary_ok bool, primary_paisa_per_gram bigint null, primary_error text null, primary_meta json null,
                  fallback_ok bool, fallback_paisa_per_gram bigint null, fallback_error text null, fallback_meta json null
                  index (fetched_at desc)
quotes            id uuid PK, side text, input_mode text, input_amount bigint,
                  market_paisa_per_gram bigint, unit_price_paisa_per_gram bigint,
                  guardrail_paisa_per_gram bigint, guardrail_applied bool,
                  gold_mg bigint, total_paisa bigint, price_snapshot_id FK,
                  status text, created_at, expires_at, settled_at null
trades            id uuid PK, quote_id uuid UNIQUE FK, side, gold_mg, total_paisa,
                  unit_price_paisa_per_gram, market_paisa_per_gram, spread_bps, guardrail_applied,
                  guardrail_paisa_per_gram, source text, price_fetched_at,
                  balances_before json, balances_after json, created_at
demo_settings     key text PK, value json
```

## 10. Web app (`web/`)

Next.js 15, App Router, TypeScript, Tailwind v4. Single page, mobile-first (design at 390 px, then scale up to a two-column layout ≥ 1024 px).

**Design tokens** (from Asasa's own site): display font Geist, body Inter (Google Fonts, with system fallbacks); radius 0.625rem, cards 18px, pills 999px. Palette:

| token | hex | use |
|---|---|---|
| `--forest` | `#0D4A46` | primary actions, headings |
| `--forest-deep` | `#0A2E2B` | dark surfaces, receipt header |
| `--lime` | `#8CCB50` | success, LIVE dot, positive |
| `--lime-soft` | `#ACDF6F` | success tints |
| `--mist` | `#F9FAFA` | page background |
| `--ink` | `#1A1F1B` | text |
| `--ink-muted` | `#7A847E` | secondary text |
| `--gold` | `#E9CB78` | the metal — gold amounts, gold chips |
| `--gold-soft` | `#F5DE7D` | gold tints |
| `--coral` | `#E0807A` | insufficiency, errors, PAUSED |

Calm and financial: whitespace and hierarchy first, one accent per state, no dense tickers.

**Layout** (top → bottom on mobile):

1. **Header** — Asasa wordmark, "Reviewer tools" button.
2. **Stepper** — the brief's five steps: See price · Enter · Review · Confirm · Complete. Current step highlighted; purely navigational feedback.
3. **Trust banner** — only when `DEGRADED` or `PAUSED`; coral/amber; states the reason in one sentence.
4. **Price card** — "24K gold · PKR per gram", market price large, buy/sell prices as two pills, source badge (PakGold / GoldPrice.org), verification chip (Cross-checked ✓ / Single source / Disputed / Unavailable), "Updated 42 s ago · next refresh in 4:18" ticking locally, guardrail line only when applied. Info popover shows the derivation and both raw source values.
5. **Balances card** — Wallet (PKR), Your gold (g), Platform inventory (g). After a trade, changed values animate with a subtle delta.
6. **Trade panel** — Buy / Sell segmented control; amount field with a PKR ⇄ g unit toggle; chips 25 % · 50 % · Max (of the relevant balance); live estimate line ("≈ 1.149 g at PKR 43,490.64/g"); primary button "Lock price for 75 s". Disabled with reason when paused.
7. **Quote review** (replaces trade panel in place) — locked unit price, breakdown (market reference, spread, guardrail line if applied), you pay / you receive, ring countdown with seconds, **Confirm** button (double-click guarded client-side, but the server is the guarantee), Cancel. Expired state per §7.
8. **Receipt** — success mark, trade id, timestamp, side, grams, unit price, total, source + price time, before → after for all three balances, "Books balanced ✓" line from `/api/integrity`, **New trade** button. Print-friendly.
9. **Recent trades** — compact list, tap to reopen a receipt.
10. **Reviewer tools drawer** — slide-over, labelled "Demo controls — not part of the product". Toggles: Kill PakGold, Kill GoldPrice.org, Force stale. Number input for guardrail with a "Set above market" shortcut. Balance setters with presets: "Wallet → PKR 5,000", "Gold → 0.100 g", "Inventory → 0.500 g". Buttons: Force refresh, Expire current quote, Reset demo. Each toggle applies immediately and refreshes state.

**Client data flow** — `GET /api/state` on load and every 30 s (and after every mutation); a 1 s local tick advances `age_seconds`/`next_refresh_in_seconds`/countdowns from the last server values. Typed API client in `lib/api.ts`; formatters in `lib/money.ts`; `useServerClock` for skew.

## 11. Reviewer tools — how each stress case is exercised

| Case | How |
|---|---|
| A source stops answering | Drawer → Kill PakGold → Force refresh → price card flips to GoldPrice.org, DEGRADED banner, trading continues. Kill both → PAUSED, inputs disabled, last price greyed with age. |
| A quote expires | Lock a price, wait 75 s (or Drawer → Expire current quote) → expired state, one-tap re-quote with delta. |
| A balance runs short | Drawer presets drain wallet / gold / inventory → quote issue (and confirm) return the specific insufficiency naming what is short, required vs available. |
| Confirm pressed twice | Double-click Confirm, or resend the request → one trade, same receipt, `idempotent_replay: true`; ledger entry count unchanged; integrity ✓. |
| Guardrail | Drawer → guardrail 50,000 → buy price rises to the floor with the guardrail line shown; sell unchanged. |
| Sources disagree | Not directly togglable without faking data — covered by tests. |

## 12. Testing

Pest (Laravel). SQLite in-memory. External HTTP always faked (`Http::fake`).

Unit:
- `Normalizer` — gold-api×FX and goldprice fixtures → expected paisa/g; troy-ounce constant.
- `Spread` — buy/sell rounding at edge paisa values; guardrail selection and `guardrail_applied` flag both ways.
- `QuoteMath` — all four input cases; properties: BUY-PKR `total ≤ input`; SELL-PKR `total ≥ input`; monotonic in input; `MIN_TRADE_MG` rejection.
- `PriceService` — the five verification rows of §4.3; every §4.4 status row; second read within 5 min makes zero HTTP calls (`Http::assertSentCount`); demo refresh bypasses cache; force_stale.

Feature:
- Quote issue: 201 shape and `seconds_remaining ≈ 75`; 409 when paused; 422 for each insufficiency with `required`/`available`.
- Confirm: balances move exactly by stored legs; four ledger entries summing to zero per asset; receipt before/after correct.
- Confirm twice: same `trade.id`, `idempotent_replay: true`, ledger count unchanged.
- Expired: confirm after `expires_at` → 409 and quote status `EXPIRED`, balances untouched.
- Re-check at confirm: drain wallet after issue → 422, quote still `ACTIVE`.
- Honour lock when paused: kill both sources after issue → confirm still settles.
- Integrity: after a randomised sequence of buys/sells, all four invariants hold.
- Demo: reset restores seed; balance adjustments keep the ledger balanced.

Concurrency: a script (`api/scripts/double-confirm.sh`) fires 10 parallel confirms at one quote against a running server and asserts one trade; run against local and the Railway deployment before submission.

Web: TypeScript strict, `next build` clean, formatters unit-tested (paisa/mg → strings, edge cases), manual mobile pass via Playwright screenshots at 390 px and 1280 px.

## 13. Deployment

**api → Railway**: `serversideup/php:8.4-fpm-nginx` Docker image, `AUTORUN_ENABLED=true` (migrations on boot), idempotent seeder run on boot if `accounts` is empty. Env: `APP_KEY`, `APP_ENV=production`, `DB_CONNECTION=pgsql`, `DB_URL=${{Postgres.DATABASE_URL}}`, `CACHE_STORE=database`, `GUARDRAIL_PAISA_PER_GRAM=3500000`. Health endpoint `GET /up`.

**web → Vercel**: root directory `web`, env `API_URL=https://<railway-domain>`. Zero other config.

README documents both, plus local setup, in copy-paste form.

## 14. Deliverables checklist

- [ ] Public repo `Mudasir1406/asasa-gold` with `README.md`, `WhatIDid.md`
- [ ] `api/` passing test suite; Dockerfile; `.env.example`
- [ ] `web/` `next build` clean; screenshots at mobile + desktop
- [ ] Deployed API on Railway, deployed web on Vercel, verified end-to-end including all §11 cases
- [ ] Double-confirm concurrency script run against production
- [ ] Build record: this Claude Code transcript (exported by the author)
