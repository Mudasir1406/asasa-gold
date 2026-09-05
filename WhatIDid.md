# What I did

Written for the Asasa reviewers. The brief asked for a demo that lets one person buy and sell 24K gold in PKR against live market data, with a 75-second locked quote, three balances that stay consistent, and honest handling of the ways that can go wrong. This file explains how I read that, what I checked before writing code, the assumptions I made where the brief was silent, and what I would do differently with more time.

Live app, API and repository links are at the end.

## How I read the brief

Five things had to be true for a reviewer to trust the demo:

1. The price on screen is real, attributed, and dated. If it can't be trusted, trading stops and the screen says why.
2. The number the user confirms is the number that settles. A quote is a promise the server keeps for 75 seconds and never quietly replaces.
3. Wallet, holdings and inventory never drift. After any trade the books still balance, and there is a way to prove it.
4. Pressing Confirm twice, or losing a network round-trip, produces one trade.
5. Every failure mode is reachable in the deployed app. The brief says reviewers should be able to try the stress cases, guardrail included, "without changing your deployed code", so a reviewer control panel is part of the product surface, not an afterthought.

I treated "calm, modern, clearly financial, not a trading terminal" as a constraint on scope as much as on styling: one price, one input, one decision at a time.

## What I found before building

**PakGold does not exist at pakgold.com.** The domain is a HugeDomains parking page. The live Pakistani rate site is pakgold.pk, and reading its front-end JavaScript shows it doesn't publish a price feed of its own. It computes its "live" rate in the browser from two public APIs: `api.gold-api.com/price/XAU` (USD per troy ounce) and `open.er-api.com/v6/latest/USD` (USD→PKR). So the "PakGold" source in this demo reproduces that exact pipeline server-side, and the UI labels it that way. I preferred saying what the number actually is over pretending to scrape a dead domain.

**GoldPrice.org has a JSON endpoint** at `data-asg.goldprice.org/dbXRates/PKR` that returns PKR per troy ounce. It answers `Forbidden` unless the request carries a browser `User-Agent`, `Referer: https://goldprice.org/` and `Origin: https://goldprice.org`. That's fine from a server and impossible from a browser, which is one more reason pricing lives in the API.

**The two agree.** At design time the two pipelines produced 39,555.12 and 39,536.95 PKR per gram, 0.046 % apart. That agreement is the trust signal the product is built around: the server fetches both, compares them, and only calls a price "cross-checked" when they agree within 3 %.

**Asasa's design tokens** are on myasasa.com: Geist for display, Inter for body, 0.625rem radius, 18px cards, and a palette a little wider than the four colours in the brief, including a gold accent (`#E9CB78`) and a coral (`#E0807A`) that I used for the metal and for insufficiency states respectively.

## Assumptions

The brief leaves several things open. Each of these is a decision I made rather than a fact I found.

- **Guardrail** is a configured floor on the customer *buy* price in PKR per gram (`max(market × 1.10, guardrail)`). It exists to stop the platform selling gold too cheaply when a feed under-reports. Default PKR 35,000/g, well under the current buy price, so it does nothing until a reviewer raises it. In production I'd expect it to derive from inventory cost basis.
- **Trading continues on a single source.** If one source is down the price is still real, so trading stays on with a visible "single source" warning. Trading pauses when both are down, when they disagree by more than 3 %, or when the newest price is older than 10 minutes.
- **An active quote is honoured even if the feed pauses after it was issued.** The price was verified when the lock was given, and the lock is the promise. Pausing blocks *new* quotes.
- **The five-minute fetch rule is strict** on the normal path, including during an outage. The reviewer panel has an explicit "force refresh" that bypasses it, labelled as demo-only, so an outage toggle takes effect immediately instead of up to five minutes later.
- **Rounding favours the platform**, once, at quote time: grams round down when buying, proceeds round down when selling. The quote stores both the gram and PKR legs as integers and settlement replays those exact numbers.
- **Platform cash is tracked but not gated.** The brief names cash, gold and inventory as the three balances that can run short; platform cash is seeded with a large float so sells never fail on it, and it's there so the ledger is genuinely double-entry.
- **Minimum trade is 0.010 g**, to keep rounding artefacts invisible.

## Key decisions

**Integers everywhere.** PKR is stored in paisa, gold in milligrams, prices in paisa per gram, all as 64-bit integers. The only float→integer conversion is where a source's ounce price becomes paisa per gram. Every downstream calculation is `intdiv` with an explicit floor or ceiling.

**A double-entry ledger, not three mutable numbers.** Every trade writes four postings (customer cash, platform cash, customer gold, platform gold) that sum to zero per asset. Balances are cached on the account rows for O(1) reads and row locking, but the ledger is the truth, and `GET /api/integrity` re-sums it and checks four invariants on demand. Gold is conserved across trades: customer holdings plus platform inventory never changes except through the reviewer panel's explicit adjustments, which post against an `external` account so even those are balanced.

**The server owns the clock.** Every quote returns `expires_at` and `server_now`; the browser computes a clock offset and counts down against corrected time. The ring on screen is cosmetic. Confirm re-checks expiry on the server with `now >= expires_at`.

**Two independent guards against double settlement.** Confirm runs in one transaction that locks the quote row and returns the existing receipt if the quote is already settled. Underneath that, `trades.quote_id` is `UNIQUE`, so even a race that somehow beat the lock cannot insert a second trade; the unique-violation path returns the original receipt too. The response marks replays with `idempotent_replay: true`.

**Re-check balances at confirm, not just at quote.** A reviewer can drain the wallet between locking and confirming. The confirm step locks the four trade accounts and re-validates against the stored legs, so the answer is a specific 422 naming what ran short, with required and available amounts.

**Laravel API + Next.js front-end, deployed separately.** Asasa's stack is Laravel and Next.js, so I split it that way rather than taking the faster all-Next route. The browser only ever talks to the Next.js origin; a rewrite proxies `/api/*` to Railway, which removes CORS from the picture and keeps the API URL in one environment variable.

**Reviewer tools are in the product.** A drawer in the deployed app can kill either source, force a stale price, raise the guardrail until it binds, drain any of the three balances, expire the current quote, and reset to seed. It's labelled as demo-only and unauthenticated, which the brief's "no authentication" scope allows and a real product would not.

## What I built

**`api/` — Laravel 13, PHP 8.4, Postgres in production and SQLite locally.**

- `Domain/Pricing` — two source adapters behind one interface, a normalizer (the single float→integer boundary), spread and guardrail maths, and a `PriceService` that keeps at most one snapshot per five minutes and derives the trading state from it. Every fetch is written to `price_snapshots`, failures included, so the outage history is inspectable.
- `Domain/Ledger` — six accounts, balanced postings, cached balances under row locks, and an `integrity()` check that re-sums the ledger four different ways.
- `Domain/Quotes` — `QuoteMath` (four input cases, rounding fixed per case), `QuoteService` (issue, lazy expiry, affordability), `SettlementService` (the one transaction that settles).
- `Domain/Demo` — the reviewer tools, including balance adjustments that post against an external account so the books stay balanced even when a reviewer rewrites them.
- 83 tests, 864 assertions, all external HTTP faked.

**`web/` — Next.js 16, React 19, Tailwind v4, TypeScript strict.**

Single page following the brief's five steps. Server-clock countdown, PKR ⇄ gram input toggle, quick-amount chips, receipt with before → after on all three balances, trade history, and the reviewer drawer. 33 unit tests over the money formatters and the display-side quote maths.

**Verified, not assumed.** Against a running stack:

- Live cross-check: PKR 39,547.41/g, PakGold and GoldPrice.org 3 bps apart, `CROSS_CHECKED`.
- **20 concurrent confirms against one quote, three rounds, eight PHP workers → exactly one trade each time**, ledger +4 entries, integrity ok. (`scripts/double-confirm.sh`)
- Kill primary → fails over to GoldPrice.org, amber banner, trading continues. Kill both → paused, last known price greyed with its age, quote requests rejected with `TRADING_PAUSED`.
- Guardrail raised to 50,000 → buy price moves to the floor, sell unchanged, quote carries `guardrail_applied`.
- All three insufficiency paths return the right code with required vs available.
- Expired lock → nothing traded, one-tap re-quote that states whether the price moved.
- Gold conservation held across every trade: customer + platform inventory stayed at 52,500 mg.

**Re-verified against the deployed stack** (Vercel front end, Railway API, Railway Postgres), not just locally:

- `/up` 200; migrations and the idempotent seed ran on first boot.
- **25 concurrent confirms against one quote, three rounds → exactly one trade each time**, ledger +4 entries, integrity ok.
- A 24-trade randomised soak: 24/24 settled, gold conserved at 52,500 mg, cash at 525,000,000 paisa, 102 ledger entries, PKR and GOLD sums both zero, no negative balances.
- Every stress case above, run through the deployed reviewer drawer.

Screenshots at 320 px, 390 px and 1280 px are in [`docs/screenshots/`](./docs/screenshots/).

### Motion

Restrained on purpose. The hero PKR/gram price and the three balances roll on an odometer so a refresh is visible rather than a silent swap; balance tiles flash once, green up and coral down; the status dot pulses only while the price is genuinely `LIVE`; the receipt check draws in. **The locked quote price deliberately does not animate** — it is a promise the server is holding for 75 seconds, and movement there would undercut the certainty the whole flow is built to convey. `prefers-reduced-motion` renders plain text with no rolling columns at all, and screen readers get the figure, never the digit columns.

### Two bugs worth mentioning, both found by measuring rather than looking

1. **The first Railway deploy would have failed.** Running the image against Postgres locally showed `AUTORUN_LARAVEL_MIGRATION_ISOLATION` calling `migrate --isolated`, which needs the `cache_locks` table — which does not exist on an empty database. Caught before it ever reached Railway.
2. **The page scrolled sideways on mobile.** An earlier "verified at 390 px" pass had only eyeballed a screenshot. Measuring `documentElement.scrollWidth` against `innerWidth` showed 414 vs 390. Two real causes: a popover anchored to a 28 px `<details>`, and later grid items whose default `min-width: auto` let a non-wrapping odometer blow the track to 398 px in a 358 px grid. The `overflow-x` guard also had to move from `body` to `html`, since an overflow set only on `body` propagates to the viewport and contains nothing.

## Known gaps

Things I decided not to build, and would want to before this went near a real user.

- **The reviewer tools are unauthenticated and mutate the ledger.** Deliberate, so the stress cases are reachable on the deployed URL, but they are the first thing to delete or gate.
- **No rate limiting and no request idempotency at the edge.** Settlement is idempotent per quote, which is the case that matters here, but a real API would take an `Idempotency-Key` on every mutating call.
- **Prices are polled, not pushed.** The client refetches state every 30 seconds and ticks the countdown locally. A websocket or SSE feed would be better, and would remove the small window where the displayed age drifts from the server's.
- **The guardrail is a flat configured number.** It should derive from inventory cost basis so it protects an actual position rather than a guess.
- **Two sources is thin.** Cross-checking two feeds catches one bad feed; it can't tell you which is wrong. Three would let it vote.
- **No currency or purity options.** 24K and PKR only, per the brief.
- **`platform_cash` is unbounded.** Sells can always be paid. A real platform has a treasury limit and would need to refuse or queue.
- **SQLite locally, Postgres in production.** The concurrency proof ran on SQLite, whose write locking is coarser than Postgres row locking. The `UNIQUE` constraint on `trades.quote_id` is what makes the guarantee portable; I'd want the same script run against production before trusting it fully.
- **Accessibility is decent, not audited.** Labels, roles and focus order are in place and motion respects `prefers-reduced-motion`; I have not run a screen reader over it.
- **No automated layout regression test.** The horizontal-overflow bug was caught by hand-measuring `scrollWidth` in a browser. A Playwright assertion across a few widths belongs in CI — the unit tests cannot see layout.

## How to review it in three minutes

1. Open the app. Note the price, the source badge, "Cross-checked ✓", and the three balances.
2. Tap **50%**, then **Lock price for 75 s**. Read the breakdown — market reference, spread, what you pay, what you get.
3. Press **Confirm**. Twice, quickly, if you like. You get one receipt showing before → after on all three balances and "Books balanced ✓".
4. Open **Reviewer tools** → **Kill PakGold** → **Force refresh now**. The badge switches to GoldPrice.org and an amber banner explains why. Kill the other one too: trading stops, and the last known price stays on screen with its age.
5. Turn both back on, lock another price, and let the 75 seconds run out. Nothing trades, and one tap gets you a fresh quote that tells you whether the price moved.
6. Still curious: raise the guardrail above market, or drain the wallet to PKR 5,000 and try to buy.

## Links

- Repository: https://github.com/Mudasir1406/asasa-gold
- Live app: https://asasa-gold.vercel.app
- API: https://asasa-gold-production.up.railway.app
- Build record: the full Claude Code transcript for this repo, exported alongside the submission. Dead ends are left in.
