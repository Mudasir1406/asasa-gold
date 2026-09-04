# Gold Trading Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deployable single-user gold buy/sell demo: live PKR/gram 24K price from two cross-checked sources, 75-second server-owned locked quotes, a double-entry ledger over wallet / holdings / inventory, receipts, and a reviewer drawer that triggers every stress case in production.

**Architecture:** `api/` is a Laravel JSON API that owns pricing (5-min cached snapshots, cross-check state machine), quotes (issue/expire/settle in one transaction), and the ledger. `web/` is a Next.js single page that proxies `/api/*` to the API via rewrites and renders the five-step journey mobile-first. All money is integer paisa, all gold integer milligrams; the server rounds once at quote issue and settlement replays stored integers.

**Tech Stack:** PHP 8.4, Laravel 13 (scaffolded 13.30), Pest 4, SQLite (dev/test) / Postgres (prod), Next.js 16 (scaffolded 16.3), TypeScript strict, Tailwind v4, Docker (`serversideup/php:8.4-fpm-nginx`), Railway, Vercel.

**Spec:** `docs/superpowers/specs/2026-09-05-gold-trading-demo-design.md` — read it first; every constant, table, status word and JSON shape below comes from it.

## Global Constraints

- Integers only for money/metal: PKR in **paisa**, gold in **milligrams**, prices in **paisa per gram**. Never `float` in a ledger, quote, or trade column. PHP ints are 64-bit; JS `number` is safe for our magnitudes (< 2^53).
- Constants (verbatim): `TROY_OUNCE_GRAMS=31.1034768`, `BUY_SPREAD_BPS=11000`, `SELL_SPREAD_BPS=9000`, `DIVERGENCE_MAX_BPS=300`, `PRICE_REFRESH_SECONDS=300`, `PRICE_MAX_AGE_SECONDS=600`, `QUOTE_TTL_SECONDS=75`, `MIN_TRADE_MG=10`, `SOURCE_TIMEOUT_SEC=6`, default `GUARDRAIL_PAISA_PER_GRAM=3500000`.
- Status vocabularies (verbatim): verification `CROSS_CHECKED|SINGLE_SOURCE|DISPUTED|UNAVAILABLE`; price status `LIVE|DEGRADED|PAUSED`; trading code `null|PRICE_UNAVAILABLE|PRICE_DISPUTED|PRICE_STALE`; quote status `ACTIVE|SETTLED|EXPIRED`; side `BUY|SELL`; input_mode `PKR|GOLD`; source ids `pakgold|goldprice`.
- Error envelope everywhere: `{ "error": { "code": "...", "message": "...", "details": {...} } }`. Codes: `TRADING_PAUSED`, `QUOTE_EXPIRED`, `INSUFFICIENT_CASH`, `INSUFFICIENT_GOLD`, `INSUFFICIENT_INVENTORY`, `VALIDATION`, `NOT_FOUND`.
- Timestamps: ISO-8601 UTC with milliseconds (`2026-09-05T10:11:12.345Z`). Every response that a countdown depends on includes `server_now`.
- Normal path never fetches sources more than once per 300 s. Only `POST /api/demo/price/refresh` bypasses that.
- External HTTP is always faked in tests (`Http::fake`). Tests run on SQLite in-memory.
- Palette/fonts from spec §10. Mobile-first at 390 px. Calm, financial, no ticker aesthetics.
- Commit after every task with the message shown. Never commit `.env`, `vendor/`, `node_modules/`.

---

## File Structure

### api/ (Laravel)

```
api/
  config/gold.php                          all constants above, env-overridable
  app/Support/Money.php                    integer helpers: mulDivFloor/Ceil/Round, bps
  app/Domain/Ledger/Account.php            enum-ish constants for the 6 account ids + asset
  app/Domain/Ledger/LedgerService.php      post(kind, trade_id, postings[]) in a txn; balances(); integrity()
  app/Domain/Pricing/Sources/PriceSource.php        interface: id(), name(), fetch(): SourceResult
  app/Domain/Pricing/Sources/SourceResult.php       DTO: ok, paisaPerGram, error, meta
  app/Domain/Pricing/Sources/PakGoldSource.php      gold-api × er-api
  app/Domain/Pricing/Sources/GoldPriceOrgSource.php goldprice.org
  app/Domain/Pricing/Normalizer.php        ounce→gram, float→paisa (the ONLY float→int boundary)
  app/Domain/Pricing/Spread.php            buy/sell/guardrail
  app/Domain/Pricing/PriceService.php      snapshot refresh + PriceView
  app/Domain/Pricing/PriceView.php         array-shaped DTO builder
  app/Domain/Quotes/QuoteMath.php          the four input cases
  app/Domain/Quotes/QuoteService.php       issue(), find(), expireIfDue()
  app/Domain/Quotes/SettlementService.php  confirm() in one txn
  app/Domain/Quotes/InsufficientBalance.php exception carrying code/required/available
  app/Domain/Demo/DemoSettings.php         get/set flags & guardrail (demo_settings table)
  app/Domain/Demo/DemoService.php          adjustBalances(), reset(), expireQuote()
  app/Models/{Account,LedgerEntry,PriceSnapshot,Quote,Trade,DemoSetting}.php
  app/Http/Controllers/{StateController,PriceController,QuoteController,TradeController,IntegrityController,DemoController}.php
  app/Http/Middleware/ForceJson.php
  app/Exceptions/ApiException.php          code/status/message/details → envelope
  routes/api.php
  database/migrations/0001_create_accounts.php ... 0006_create_demo_settings.php
  database/seeders/DatabaseSeeder.php      idempotent seed via LedgerService::post(kind=SEED)
  tests/Unit/{MoneyTest,NormalizerTest,SpreadTest,QuoteMathTest,PriceServiceTest}.php
  tests/Feature/{QuoteIssueTest,ConfirmTest,IntegrityTest,DemoTest,StateTest}.php
  scripts/double-confirm.sh
  Dockerfile, .dockerignore, .env.example
```

### web/ (Next.js)

```
web/
  next.config.ts                 rewrites /api/* → API_URL
  app/layout.tsx                 fonts (Geist, Inter), metadata, <main>
  app/page.tsx                   composes the page; owns top-level state machine (step)
  app/globals.css                Tailwind v4 @theme tokens (palette, radii)
  lib/types.ts                   PriceView, Balances, Quote, Receipt, Trade, StateResponse, ApiError
  lib/api.ts                     typed fetch wrappers; throws ApiError with code
  lib/money.ts                   formatPKR(paisa), formatGold(mg), parsePKR(str)→paisa, parseGold(str)→mg
  lib/money.test.ts              vitest
  lib/useServerClock.ts          offset from server_now; now()
  lib/useAppState.ts             polls /api/state every 30 s, 1 s local tick
  components/Header.tsx
  components/Stepper.tsx
  components/TrustBanner.tsx
  components/PriceCard.tsx
  components/BalancesCard.tsx
  components/TradeForm.tsx
  components/QuoteReview.tsx     countdown ring, confirm, expired state
  components/Receipt.tsx
  components/TradeHistory.tsx
  components/ReviewerTools.tsx   drawer
  components/ui/{Button,Card,Pill,Field,Drawer}.tsx
```

---

## Task 1: API scaffold, config, Money helpers

**Files:**
- Modify: `api/.env.example`, `api/.env` (SQLite), `api/config/gold.php` (create), `api/bootstrap/app.php`
- Create: `api/app/Support/Money.php`, `api/app/Exceptions/ApiException.php`, `api/app/Http/Middleware/ForceJson.php`
- Test: `api/tests/Unit/MoneyTest.php`

**Interfaces:**
- Produces: `config('gold.*')` keys exactly as Global Constraints; `Money::mulDivFloor(int $a, int $b, int $div): int`, `Money::mulDivCeil(...)`, `Money::mulDivRound(...)`, `Money::applyBps(int $amount, int $bps): int` (round half up), `Money::floatToPaisa(float $pkr): int`; `ApiException(string $code, string $message, int $status = 400, array $details = [])` rendered by Laravel's handler as the envelope.

- [ ] **Step 1: Confirm scaffold and set env**

```bash
cd api && php artisan --version
cp -n .env.example .env; php artisan key:generate --no-interaction
composer require pestphp/pest pestphp/pest-plugin-laravel --dev --with-all-dependencies --no-interaction
./vendor/bin/pest --init          # writes tests/Pest.php; keep tests/TestCase.php
rm -f tests/Unit/ExampleTest.php tests/Feature/ExampleTest.php
php artisan install:api --without-migration-prompt --no-interaction   # creates routes/api.php (Laravel 13 ships without it)
```
In `tests/Pest.php` bind `TestCase` + `RefreshDatabase` to **both** `Feature` and `Unit` dirs (unit tests here touch config and the DB). `phpunit.xml` already sets `DB_CONNECTION=sqlite` / `DB_DATABASE=:memory:` — keep; add `<env name="GUARDRAIL_PAISA_PER_GRAM" value="3500000"/>` and `<env name="CACHE_STORE" value="array"/>`.
Edit `.env` and `.env.example`: `DB_CONNECTION=sqlite`, remove `DB_HOST/PORT/DATABASE/USERNAME/PASSWORD` lines, `CACHE_STORE=database`, `SESSION_DRIVER=file`, `QUEUE_CONNECTION=sync`, add `GUARDRAIL_PAISA_PER_GRAM=3500000`. `touch database/database.sqlite`.

- [ ] **Step 2: Create `config/gold.php`**

```php
<?php
return [
    'troy_ounce_grams'      => 31.1034768,
    'buy_spread_bps'        => 11000,
    'sell_spread_bps'       => 9000,
    'divergence_max_bps'    => 300,
    'price_refresh_seconds' => 300,
    'price_max_age_seconds' => 600,
    'quote_ttl_seconds'     => 75,
    'min_trade_mg'          => 10,
    'source_timeout_sec'    => 6,
    'guardrail_paisa_per_gram' => (int) env('GUARDRAIL_PAISA_PER_GRAM', 3500000),
];
```

- [ ] **Step 3: Write failing `tests/Unit/MoneyTest.php`**

```php
<?php
use App\Support\Money;

test('mulDivFloor/Ceil/Round', function () {
    expect(Money::mulDivFloor(7, 10, 3))->toBe(23);   // 70/3 = 23.33
    expect(Money::mulDivCeil(7, 10, 3))->toBe(24);
    expect(Money::mulDivRound(7, 10, 3))->toBe(23);
    expect(Money::mulDivRound(5, 10, 4))->toBe(13);   // 12.5 → 13 half-up
    expect(Money::mulDivFloor(0, 10, 3))->toBe(0);
});
test('applyBps rounds half up', function () {
    expect(Money::applyBps(3953695, 11000))->toBe(4349065);   // 39536.95 × 1.10 = 43490.645 → 43490.65
    expect(Money::applyBps(3953695, 9000))->toBe(3558326);    // 35583.255 → 35583.26
});
test('floatToPaisa', function () {
    expect(Money::floatToPaisa(39536.9512))->toBe(3953695);
    expect(Money::floatToPaisa(0.005))->toBe(1);
});
test('throws on non-positive divisor', fn () => Money::mulDivFloor(1, 1, 0))->throws(InvalidArgumentException::class);
```

- [ ] **Step 4: Run — expect FAIL (class not found)**: `cd api && ./vendor/bin/pest tests/Unit/MoneyTest.php`

- [ ] **Step 5: Implement `app/Support/Money.php`**

```php
<?php
namespace App\Support;

final class Money
{
    public static function mulDivFloor(int $a, int $b, int $div): int
    { self::guard($div); return intdiv($a * $b, $div) - (($a * $b) % $div < 0 ? 1 : 0); }

    public static function mulDivCeil(int $a, int $b, int $div): int
    { self::guard($div); $p = $a * $b; $q = intdiv($p, $div); return ($p % $div > 0) ? $q + 1 : $q; }

    public static function mulDivRound(int $a, int $b, int $div): int
    { self::guard($div); return intdiv($a * $b * 2 + $div, $div * 2); }

    public static function applyBps(int $amount, int $bps): int
    { return self::mulDivRound($amount, $bps, 10000); }

    public static function floatToPaisa(float $pkr): int
    { return (int) round($pkr * 100, 0, PHP_ROUND_HALF_UP); }

    private static function guard(int $div): void
    { if ($div <= 0) throw new \InvalidArgumentException('divisor must be positive'); }
}
```

- [ ] **Step 6: `ApiException` + handler + `ForceJson`**

```php
<?php // app/Exceptions/ApiException.php
namespace App\Exceptions;
use Illuminate\Http\JsonResponse;

class ApiException extends \RuntimeException
{
    public function __construct(public readonly string $code, string $message, public readonly int $status = 400, public readonly array $details = [])
    { parent::__construct($message); }

    public function render(): JsonResponse
    {
        $body = ['error' => ['code' => $this->code, 'message' => $this->getMessage()]];
        if ($this->details !== []) $body['error']['details'] = $this->details;
        return response()->json($body, $this->status);
    }
}
```
`ForceJson`: sets `Accept: application/json` on every request. Register in `bootstrap/app.php` via `->withMiddleware(fn ($m) => $m->api(prepend: [ForceJson::class]))`, and in `->withExceptions` map `ValidationException` → `422 {error:{code:'VALIDATION', message, details: errors}}` and `ModelNotFoundException`/`NotFoundHttpException` → `404 NOT_FOUND`. Ensure `routes/api.php` is enabled (`php artisan install:api --without-migration-prompt` if `routes/api.php` is absent; skip Sanctum publish).

- [ ] **Step 7: Run all tests — PASS**: `./vendor/bin/pest`
- [ ] **Step 8: Commit** — `git add -A api && git commit -m "feat(api): scaffold, gold config, Money helpers, API error envelope"`

---

## Task 2: Migrations, models, LedgerService, seeder

**Files:**
- Create: 6 migrations, 6 models, `app/Domain/Ledger/Account.php`, `app/Domain/Ledger/LedgerService.php`, `database/seeders/DatabaseSeeder.php`
- Test: `tests/Feature/LedgerTest.php`

**Interfaces:**
- Produces:
  - `Account::CUSTOMER_CASH='customer_cash'`, `CUSTOMER_GOLD`, `PLATFORM_CASH`, `PLATFORM_GOLD`, `EXTERNAL_CASH`, `EXTERNAL_GOLD`; `Account::ASSET_PKR='PKR'`, `ASSET_GOLD='GOLD'`; `Account::assetOf(string $id): string`; `Account::SEED = [customer_cash=>25000000, customer_gold=>2500, platform_cash=>500000000, platform_gold=>50000]`.
  - `LedgerService::post(string $kind, ?string $tradeId, array $postings): void` where each posting is `['account'=>id,'amount'=>int]`; **must be called inside an open transaction**; validates per-asset sum == 0, locks rows `FOR UPDATE`, inserts entries, updates cached balances. Throws `\LogicException` if unbalanced.
  - `LedgerService::balances(): array` → `['customer_cash_paisa'=>int,'customer_gold_mg'=>int,'platform_cash_paisa'=>int,'platform_gold_mg'=>int]`.
  - `LedgerService::lockTradeAccounts(): array<string,int>` → balances of the four trade accounts with `lockForUpdate()`.
  - `LedgerService::integrity(): array` → `['ok'=>bool,'checked_at'=>iso,'ledger_sums'=>['PKR'=>int,'GOLD'=>int],'account_mismatches'=>[],'unbalanced_trades'=>[],'entry_count'=>int]`.

- [ ] **Step 1: Migrations** (one file each, names `0001_01_01_000100_create_accounts_table.php` etc. so they sort after Laravel's defaults):

```php
// accounts
Schema::create('accounts', function (Blueprint $t) {
    $t->string('id')->primary(); $t->string('asset', 8); $t->bigInteger('balance')->default(0); $t->timestamps();
});
// ledger_entries
Schema::create('ledger_entries', function (Blueprint $t) {
    $t->id(); $t->uuid('trade_id')->nullable()->index(); $t->string('kind', 16);
    $t->string('account_id')->index(); $t->string('asset', 8); $t->bigInteger('amount'); $t->timestamp('created_at', 3);
});
// price_snapshots
Schema::create('price_snapshots', function (Blueprint $t) {
    $t->id(); $t->timestamp('fetched_at', 3)->index(); $t->string('verification', 16); $t->string('selected_source', 16)->nullable();
    $t->bigInteger('market_paisa_per_gram')->nullable(); $t->integer('divergence_bps')->nullable();
    $t->boolean('primary_ok'); $t->bigInteger('primary_paisa_per_gram')->nullable(); $t->text('primary_error')->nullable(); $t->json('primary_meta')->nullable();
    $t->boolean('fallback_ok'); $t->bigInteger('fallback_paisa_per_gram')->nullable(); $t->text('fallback_error')->nullable(); $t->json('fallback_meta')->nullable();
});
// quotes
Schema::create('quotes', function (Blueprint $t) {
    $t->uuid('id')->primary(); $t->string('side', 4); $t->string('input_mode', 4); $t->bigInteger('input_amount');
    $t->bigInteger('market_paisa_per_gram'); $t->bigInteger('unit_price_paisa_per_gram'); $t->bigInteger('guardrail_paisa_per_gram'); $t->boolean('guardrail_applied');
    $t->bigInteger('gold_mg'); $t->bigInteger('total_paisa'); $t->foreignId('price_snapshot_id')->constrained('price_snapshots');
    $t->string('status', 8)->index(); $t->timestamp('created_at', 3); $t->timestamp('expires_at', 3); $t->timestamp('settled_at', 3)->nullable();
});
// trades
Schema::create('trades', function (Blueprint $t) {
    $t->uuid('id')->primary(); $t->uuid('quote_id')->unique(); $t->string('side', 4); $t->bigInteger('gold_mg'); $t->bigInteger('total_paisa');
    $t->bigInteger('unit_price_paisa_per_gram'); $t->bigInteger('market_paisa_per_gram'); $t->integer('spread_bps'); $t->boolean('guardrail_applied');
    $t->bigInteger('guardrail_paisa_per_gram'); $t->string('source', 16); $t->timestamp('price_fetched_at', 3);
    $t->json('balances_before'); $t->json('balances_after'); $t->timestamp('created_at', 3)->index();
});
// demo_settings
Schema::create('demo_settings', function (Blueprint $t) { $t->string('key')->primary(); $t->json('value'); });
```
Models: `$incrementing=false; $keyType='string'` for Account/Quote/Trade; Quote/Trade use `HasUuids`; casts for json + `datetime` fields; `public $timestamps=false` where the table has custom timestamp columns (LedgerEntry, PriceSnapshot, Quote, Trade, DemoSetting). Every model `$guarded = []`.

- [ ] **Step 2: Failing `tests/Feature/LedgerTest.php`** (`uses(RefreshDatabase::class)` via `tests/Pest.php` for Feature dir):

```php
use App\Domain\Ledger\{Account, LedgerService};
use Illuminate\Support\Facades\DB;

test('seeder produces spec balances and a balanced ledger', function () {
    $this->seed();
    $b = app(LedgerService::class)->balances();
    expect($b)->toBe(['customer_cash_paisa'=>25000000,'customer_gold_mg'=>2500,'platform_cash_paisa'=>500000000,'platform_gold_mg'=>50000]);
    expect(app(LedgerService::class)->integrity()['ok'])->toBeTrue();
    $this->seed(); // idempotent
    expect(app(LedgerService::class)->balances()['customer_gold_mg'])->toBe(2500);
});
test('post rejects unbalanced postings', function () {
    $this->seed();
    DB::transaction(fn () => app(LedgerService::class)->post('TRADE', null, [['account'=>Account::CUSTOMER_CASH,'amount'=>-5]]));
})->throws(LogicException::class);
test('post moves balances and integrity holds', function () {
    $this->seed();
    DB::transaction(fn () => app(LedgerService::class)->post('TRADE', (string) \Illuminate\Support\Str::uuid(), [
        ['account'=>Account::CUSTOMER_CASH,'amount'=>-100], ['account'=>Account::PLATFORM_CASH,'amount'=>100],
        ['account'=>Account::CUSTOMER_GOLD,'amount'=>7], ['account'=>Account::PLATFORM_GOLD,'amount'=>-7],
    ]));
    $b = app(LedgerService::class)->balances();
    expect($b['customer_cash_paisa'])->toBe(24999900)->and($b['customer_gold_mg'])->toBe(2507)->and($b['platform_gold_mg'])->toBe(49993);
    expect(app(LedgerService::class)->integrity()['ok'])->toBeTrue();
});
```

- [ ] **Step 3: Run — FAIL.**  - [ ] **Step 4: Implement**

```php
<?php // app/Domain/Ledger/LedgerService.php
namespace App\Domain\Ledger;
use App\Models\{Account as AccountModel, LedgerEntry};
use Illuminate\Support\Facades\DB;

class LedgerService
{
    public function post(string $kind, ?string $tradeId, array $postings): void
    {
        if (DB::transactionLevel() === 0) throw new \LogicException('post() requires an open transaction');
        $sums = [];
        foreach ($postings as $p) { $asset = Account::assetOf($p['account']); $sums[$asset] = ($sums[$asset] ?? 0) + $p['amount']; }
        foreach ($sums as $asset => $sum) if ($sum !== 0) throw new \LogicException("unbalanced postings for $asset: $sum");
        $ids = array_values(array_unique(array_column($postings, 'account'))); sort($ids);       // stable lock order
        $rows = AccountModel::whereIn('id', $ids)->lockForUpdate()->get()->keyBy('id');
        $now = now();
        foreach ($postings as $p) {
            LedgerEntry::create(['trade_id'=>$tradeId,'kind'=>$kind,'account_id'=>$p['account'],'asset'=>Account::assetOf($p['account']),'amount'=>$p['amount'],'created_at'=>$now]);
            $rows[$p['account']]->balance += $p['amount'];
        }
        foreach ($rows as $r) $r->save();
    }

    public function balances(): array
    {
        $b = AccountModel::whereIn('id', Account::TRADE_ACCOUNTS)->pluck('balance', 'id');
        return ['customer_cash_paisa'=>(int)$b[Account::CUSTOMER_CASH],'customer_gold_mg'=>(int)$b[Account::CUSTOMER_GOLD],
                'platform_cash_paisa'=>(int)$b[Account::PLATFORM_CASH],'platform_gold_mg'=>(int)$b[Account::PLATFORM_GOLD]];
    }

    public function lockTradeAccounts(): array
    { return AccountModel::whereIn('id', Account::TRADE_ACCOUNTS)->orderBy('id')->lockForUpdate()->pluck('balance','id')->map(fn($v)=>(int)$v)->all(); }

    public function integrity(): array
    {
        $sums = LedgerEntry::selectRaw('asset, SUM(amount) as s')->groupBy('asset')->pluck('s','asset')->map(fn($v)=>(int)$v)->all();
        $perAccount = LedgerEntry::selectRaw('account_id, SUM(amount) as s')->groupBy('account_id')->pluck('s','account_id');
        $mismatch = [];
        foreach (AccountModel::all() as $a) if ((int)($perAccount[$a->id] ?? 0) !== (int)$a->balance) $mismatch[] = $a->id;
        $bad = LedgerEntry::whereNotNull('trade_id')->selectRaw('trade_id, asset, SUM(amount) as s')->groupBy('trade_id','asset')->havingRaw('SUM(amount) <> 0')->pluck('trade_id')->unique()->values()->all();
        $ok = ($sums['PKR'] ?? 0) === 0 && ($sums['GOLD'] ?? 0) === 0 && $mismatch === [] && $bad === [];
        return ['ok'=>$ok,'checked_at'=>now()->toISOString(),'ledger_sums'=>['PKR'=>$sums['PKR']??0,'GOLD'=>$sums['GOLD']??0],
                'account_mismatches'=>$mismatch,'unbalanced_trades'=>$bad,'entry_count'=>LedgerEntry::count()];
    }
}
```
`Account.php`: the constants above plus `TRADE_ACCOUNTS = [CUSTOMER_CASH, CUSTOMER_GOLD, PLATFORM_CASH, PLATFORM_GOLD]`, `ALL` (six), `assetOf()` (`str_ends_with($id,'_cash') ? 'PKR' : 'GOLD'`), `SEED`.

Seeder: create six `accounts` rows if missing (`firstOrCreate`), then if `LedgerEntry::where('kind','SEED')->doesntExist()` post one balanced `SEED` batch: each `SEED[$id]` credited to `$id`, offset debited from `EXTERNAL_CASH`/`EXTERNAL_GOLD`. Wrap in `DB::transaction`.

- [ ] **Step 5: Run — PASS.**  - [ ] **Step 6: Commit** — `git commit -am "feat(api): schema, models, double-entry ledger, idempotent seed"`

---

## Task 3: Pricing — sources, normalizer, spread, PriceService

**Files:**
- Create: `app/Domain/Pricing/Sources/{PriceSource,SourceResult,PakGoldSource,GoldPriceOrgSource}.php`, `app/Domain/Pricing/{Normalizer,Spread,PriceService,PriceView}.php`, `app/Domain/Demo/DemoSettings.php`
- Test: `tests/Unit/{NormalizerTest,SpreadTest,PriceServiceTest}.php`

**Interfaces:**
- Consumes: `Money`, `config('gold.*')`, `PriceSnapshot` model.
- Produces:
  - `SourceResult` readonly class: `bool $ok, ?int $paisaPerGram, ?string $error, array $meta`. Static `ok(int, array)`, `fail(string)`.
  - `PriceSource` interface: `id(): string` (`pakgold|goldprice`), `name(): string` (`PakGold`/`GoldPrice.org`), `fetch(): SourceResult` — never throws; catches everything into `fail()`.
  - `Normalizer::ouncePkrToPaisaPerGram(float $pkrPerOz): int`; `Normalizer::usdOunceToPaisaPerGram(float $usdPerOz, float $usdToPkr): int`.
  - `Spread::compute(int $marketPaisa, int $guardrailPaisa): array{buy:int, sell:int, guardrail_applied:bool, buy_before_guardrail:int}`.
  - `DemoSettings::get(): array{fail_primary:bool, fail_fallback:bool, force_stale:bool, guardrail_paisa_per_gram:int}` (defaults false/false/false/config), `DemoSettings::set(array $partial): array`.
  - `PriceService::current(): array` (PriceView, lazy refresh if due), `PriceService::refresh(bool $force=false): PriceSnapshot`, `PriceService::view(?PriceSnapshot $latest): array`. PriceView keys exactly per spec §8.
  - Sources are resolved from the container by `PriceService::__construct(PakGoldSource $primary, GoldPriceOrgSource $fallback, DemoSettings $demo)` so tests can swap.

- [ ] **Step 1: Failing `NormalizerTest` + `SpreadTest`**

```php
use App\Domain\Pricing\{Normalizer, Spread};
test('goldprice ounce → paisa/gram', fn () => expect(Normalizer::ouncePkrToPaisaPerGram(1229736.4553))->toBe(3953695));
test('gold-api × fx → paisa/gram', fn () => expect(Normalizer::usdOunceToPaisaPerGram(4435.700195, 277.363614))->toBe(3955512));
test('rejects non-positive', fn () => Normalizer::ouncePkrToPaisaPerGram(0))->throws(InvalidArgumentException::class);

test('spread without guardrail', function () {
    $s = Spread::compute(3953695, 3500000);
    expect($s)->toBe(['buy'=>4349065,'sell'=>3558326,'guardrail_applied'=>false,'buy_before_guardrail'=>4349065]);
});
test('guardrail binds on buy only', function () {
    $s = Spread::compute(3953695, 5000000);
    expect($s['buy'])->toBe(5000000)->and($s['guardrail_applied'])->toBeTrue()->and($s['sell'])->toBe(3558326)->and($s['buy_before_guardrail'])->toBe(4349065);
});
test('guardrail equal to buy is not "applied"', fn () => expect(Spread::compute(3953695, 4349065)['guardrail_applied'])->toBeFalse());
```

- [ ] **Step 2: Implement Normalizer / Spread**

```php
final class Normalizer {
    public static function ouncePkrToPaisaPerGram(float $pkrPerOz): int {
        if ($pkrPerOz <= 0) throw new \InvalidArgumentException('price must be positive');
        return Money::floatToPaisa($pkrPerOz / config('gold.troy_ounce_grams'));
    }
    public static function usdOunceToPaisaPerGram(float $usdPerOz, float $usdToPkr): int {
        if ($usdPerOz <= 0 || $usdToPkr <= 0) throw new \InvalidArgumentException('inputs must be positive');
        return Money::floatToPaisa($usdPerOz * $usdToPkr / config('gold.troy_ounce_grams'));
    }
}
final class Spread {
    public static function compute(int $marketPaisa, int $guardrailPaisa): array {
        $buy = Money::applyBps($marketPaisa, config('gold.buy_spread_bps'));
        $sell = Money::applyBps($marketPaisa, config('gold.sell_spread_bps'));
        return ['buy'=>max($buy,$guardrailPaisa),'sell'=>$sell,'guardrail_applied'=>$guardrailPaisa > $buy,'buy_before_guardrail'=>$buy];
    }
}
```

- [ ] **Step 3: Sources**

```php
// PakGoldSource::fetch()
try {
    $t = config('gold.source_timeout_sec');
    $responses = Http::pool(fn ($pool) => [
        $pool->as('xau')->timeout($t)->acceptJson()->get('https://api.gold-api.com/price/XAU'),
        $pool->as('fx')->timeout($t)->acceptJson()->get('https://open.er-api.com/v6/latest/USD'),
    ]);
    foreach (['xau','fx'] as $k) if (!($responses[$k] instanceof \Illuminate\Http\Client\Response) || !$responses[$k]->ok())
        return SourceResult::fail("$k request failed: " . ($responses[$k] instanceof \Throwable ? $responses[$k]->getMessage() : 'HTTP '.$responses[$k]->status()));
    $xau = (float) $responses['xau']->json('price'); $fx = (float) $responses['fx']->json('rates.PKR');
    if ($xau <= 0 || $fx <= 0) return SourceResult::fail('malformed payload');
    return SourceResult::ok(Normalizer::usdOunceToPaisaPerGram($xau, $fx), [
        'method'=>'gold-api.com XAU/USD × open.er-api.com USD/PKR ÷ 31.1034768','xau_usd_per_oz'=>$xau,'usd_to_pkr'=>$fx,
        'xau_updated_at'=>$responses['xau']->json('updatedAt'),'fx_updated_at'=>$responses['fx']->json('time_last_update_utc')]);
} catch (\Throwable $e) { return SourceResult::fail($e->getMessage()); }

// GoldPriceOrgSource::fetch()
$r = Http::timeout($t)->withHeaders(['User-Agent'=>'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36',
     'Accept'=>'application/json, text/plain, */*','Referer'=>'https://goldprice.org/','Origin'=>'https://goldprice.org'])
     ->get('https://data-asg.goldprice.org/dbXRates/PKR');
if (!$r->ok()) return SourceResult::fail('HTTP '.$r->status());
$oz = (float) $r->json('items.0.xauPrice'); if ($oz <= 0) return SourceResult::fail('malformed payload');
return SourceResult::ok(Normalizer::ouncePkrToPaisaPerGram($oz), ['method'=>'xauPrice (PKR/oz) ÷ 31.1034768','pkr_per_oz'=>$oz,'source_ts'=>$r->json('ts')]);
```
Both `fetch()` methods first check `DemoSettings::get()['fail_primary' | 'fail_fallback']` and return `SourceResult::fail('Simulated outage (reviewer tools)')` when set.

- [ ] **Step 4: Failing `PriceServiceTest`** — use `Http::fake([...])` with the two payload shapes above and `travel()`:

```php
use App\Domain\Pricing\PriceService; use App\Domain\Demo\DemoSettings; use App\Models\PriceSnapshot; use Illuminate\Support\Facades\Http;
uses(\Illuminate\Foundation\Testing\RefreshDatabase::class);
function fakeBoth(float $xau = 4435.700195, float $fx = 277.363614, float $gpOz = 1229736.4553, bool $pOk = true, bool $fOk = true): void {
    Http::fake([
        'api.gold-api.com/*' => $pOk ? Http::response(['price'=>$xau,'updatedAt'=>'2026-09-04T19:28:27Z']) : Http::response('', 503),
        'open.er-api.com/*' => Http::response(['rates'=>['PKR'=>$fx],'time_last_update_utc'=>'x']),
        'data-asg.goldprice.org/*' => $fOk ? Http::response(['ts'=>1,'items'=>[['xauPrice'=>$gpOz]]]) : Http::response('Forbidden', 403),
    ]);
}
test('both ok & agree → LIVE, CROSS_CHECKED, primary selected', function () {
    fakeBoth(); $v = app(PriceService::class)->current();
    expect($v['status'])->toBe('LIVE')->and($v['source']['verification'])->toBe('CROSS_CHECKED')->and($v['source']['selected'])->toBe('pakgold')
      ->and($v['market_paisa_per_gram'])->toBe(3955512)->and($v['buy_paisa_per_gram'])->toBe(4351063)->and($v['trading']['enabled'])->toBeTrue()
      ->and($v['source']['divergence_bps'])->toBe(4);
});
test('disagree > 3% → PAUSED DISPUTED', function () {
    fakeBoth(gpOz: 1300000.0); $v = app(PriceService::class)->current();
    expect($v['status'])->toBe('PAUSED')->and($v['trading']['code'])->toBe('PRICE_DISPUTED')->and($v['market_paisa_per_gram'])->toBeNull();
});
test('primary down → DEGRADED on goldprice', function () {
    fakeBoth(pOk: false); $v = app(PriceService::class)->current();
    expect($v['status'])->toBe('DEGRADED')->and($v['source']['selected'])->toBe('goldprice')->and($v['trading']['enabled'])->toBeTrue()->and($v['market_paisa_per_gram'])->toBe(3953695);
});
test('fallback down → DEGRADED on pakgold', function () { fakeBoth(fOk: false); expect(app(PriceService::class)->current()['source']['selected'])->toBe('pakgold'); });
test('both down → PAUSED UNAVAILABLE, last known shown', function () {
    fakeBoth(); app(PriceService::class)->current();
    fakeBoth(pOk: false, fOk: false); $v = app(PriceService::class)->refresh(force: true) ? app(PriceService::class)->current() : null;
    expect($v['status'])->toBe('PAUSED')->and($v['trading']['code'])->toBe('PRICE_UNAVAILABLE')->and($v['last_known_market_paisa_per_gram'])->toBe(3955512);
});
test('no refetch within 5 minutes; refetch after', function () {
    fakeBoth(); $s = app(PriceService::class);
    $s->current(); $s->current(); $this->travel(299)->seconds(); $s->current();
    Http::assertSentCount(3);                       // one refresh = 3 requests
    $this->travel(2)->seconds(); $s->current(); Http::assertSentCount(6);
});
test('force_stale → PAUSED PRICE_STALE', function () {
    fakeBoth(); app(PriceService::class)->current(); app(DemoSettings::class)->set(['force_stale'=>true]);
    expect(app(PriceService::class)->current()['trading']['code'])->toBe('PRICE_STALE');
});
test('old snapshot beyond max age → PAUSED PRICE_STALE even without refetch', function () {
    fakeBoth(); app(PriceService::class)->current();
    Http::fake(fn () => throw new \RuntimeException('network'));    // refresh attempt fails → UNAVAILABLE row
    $this->travel(601)->seconds();
    expect(app(PriceService::class)->current()['status'])->toBe('PAUSED');
});
```

- [ ] **Step 5: Implement `PriceService`**

```php
public function current(): array {
    $latest = PriceSnapshot::latest('fetched_at')->first();
    $due = !$latest || $latest->fetched_at->diffInSeconds(now()) >= config('gold.price_refresh_seconds');
    if ($due) { $lock = Cache::lock('price-refresh', 20); if ($lock->get()) { try { $latest = $this->refresh(); } finally { $lock->release(); } } }
    return $this->view($latest);
}
public function refresh(bool $force = false): PriceSnapshot {
    $p = $this->primary->fetch(); $f = $this->fallback->fetch();
    $ver = 'UNAVAILABLE'; $sel = null; $market = null; $div = null;
    if ($p->ok && $f->ok) {
        $div = (int) round(abs($p->paisaPerGram - $f->paisaPerGram) * 10000 / $f->paisaPerGram);
        if ($div <= config('gold.divergence_max_bps')) { $ver='CROSS_CHECKED'; $sel='pakgold'; $market=$p->paisaPerGram; } else { $ver='DISPUTED'; }
    } elseif ($p->ok) { $ver='SINGLE_SOURCE'; $sel='pakgold'; $market=$p->paisaPerGram; }
    elseif ($f->ok) { $ver='SINGLE_SOURCE'; $sel='goldprice'; $market=$f->paisaPerGram; }
    return PriceSnapshot::create([... all columns from $p/$f/$ver/$sel/$market/$div, 'fetched_at'=>now()]);
}
```
`view($latest)` builds the PriceView per spec §4.4/§8: compute `age`, `trading` (`force_stale` → `PRICE_STALE`; `market===null` → `PRICE_DISPUTED`/`PRICE_UNAVAILABLE` by verification; `age >= max_age` → `PRICE_STALE`), status `LIVE|DEGRADED|PAUSED`, `reason` strings from spec §4.4, `last_known_*` from `PriceSnapshot::whereNotNull('market_paisa_per_gram')->latest('fetched_at')->first()`, guardrail via `Spread::compute` (buy/sell null when no market), `next_refresh_in_seconds = max(0, refresh - age)`, `server_now`. Source names `PakGold` and `GoldPrice.org`; primary `meta` includes `method`. When `$latest` is null: `UNAVAILABLE`/`PAUSED`.

- [ ] **Step 6: PASS; commit** — `git commit -am "feat(api): price sources, normalizer, spread+guardrail, cross-checked snapshot service"`

---

## Task 4: QuoteMath + QuoteService (issue / read / lazy expiry)

**Files:**
- Create: `app/Domain/Quotes/{QuoteMath,QuoteService,InsufficientBalance}.php`
- Test: `tests/Unit/QuoteMathTest.php`, `tests/Feature/QuoteIssueTest.php`

**Interfaces:**
- Consumes: `PriceService::current()`, `LedgerService::balances()`, `Spread`, `Money`, `Quote` model.
- Produces:
  - `QuoteMath::compute(string $side, string $inputMode, int $amount, int $buyPaisa, int $sellPaisa): array{gold_mg:int,total_paisa:int,unit_price:int}`; throws `ApiException('VALIDATION', ..., 422)` when `gold_mg < MIN_TRADE_MG` or `amount <= 0`.
  - `InsufficientBalance extends ApiException` — `static cash(int $required, int $available)`, `gold(...)`, `inventory(...)`: codes `INSUFFICIENT_CASH|INSUFFICIENT_GOLD|INSUFFICIENT_INVENTORY`, status 422, details `{required, available, unit:'paisa'|'mg'}`, messages e.g. `"You need PKR 52,300.00 but your wallet has PKR 5,000.00"` (format helpers in `Money::fmtPkr(int)`, `Money::fmtGold(int)` — add to Money).
  - `QuoteService::issue(string $side, string $inputMode, int $amount): Quote` — throws `ApiException('TRADING_PAUSED', reason, 409, ['code'=>trading.code])` when paused, `InsufficientBalance` when short.
  - `QuoteService::find(string $id): Quote` — 404 `NOT_FOUND`; marks `EXPIRED` if `ACTIVE && now >= expires_at`.
  - `QuoteService::checkAffordability(string $side, int $goldMg, int $totalPaisa, array $balances): void` (shared with settlement).
  - `QuoteService::toArray(Quote $q): array` → `{id, side, input_mode, input_amount, market_paisa_per_gram, unit_price_paisa_per_gram, spread_bps, guardrail_paisa_per_gram, guardrail_applied, gold_mg, total_paisa, status, created_at, expires_at, settled_at, seconds_remaining, server_now, source, price_fetched_at}`.

- [ ] **Step 1: Failing `QuoteMathTest`** (buy=4351063, sell=3559961 — from market 3955512):

```php
use App\Domain\Quotes\QuoteMath; use App\Exceptions\ApiException;
const BUY=4351063; const SELL=3559961;
test('BUY by PKR: floor grams, cost ≤ input', function () {
    $r = QuoteMath::compute('BUY','PKR', 10000000, BUY, SELL);          // PKR 100,000
    expect($r['gold_mg'])->toBe(2298)->and($r['total_paisa'])->toBe(9998743)->and($r['total_paisa'])->toBeLessThanOrEqual(10000000)->and($r['unit_price'])->toBe(BUY);
});
test('BUY by gold: ceil cost', fn () => expect(QuoteMath::compute('BUY','GOLD', 1000, BUY, SELL)['total_paisa'])->toBe(4351063));
test('SELL by gold: floor proceeds', fn () => expect(QuoteMath::compute('SELL','GOLD', 2500, BUY, SELL)['total_paisa'])->toBe(8899902));
test('SELL by PKR: ceil grams, proceeds ≥ input', function () {
    $r = QuoteMath::compute('SELL','PKR', 5000000, BUY, SELL);
    expect($r['gold_mg'])->toBe(1405)->and($r['total_paisa'])->toBeGreaterThanOrEqual(5000000)->and($r['unit_price'])->toBe(SELL);
});
test('property: BUY-PKR never overcharges, SELL-PKR never underpays, monotonic', function () {
    for ($a = 1000; $a <= 20000000; $a += 777777) {
        $b = QuoteMath::compute('BUY','PKR',$a,BUY,SELL); expect($b['total_paisa'])->toBeLessThanOrEqual($a);
        $s = QuoteMath::compute('SELL','PKR',$a,BUY,SELL); expect($s['total_paisa'])->toBeGreaterThanOrEqual($a);
    }
});
test('below minimum trade rejected', fn () => QuoteMath::compute('BUY','PKR', 100, BUY, SELL))->throws(ApiException::class);
test('non-positive rejected', fn () => QuoteMath::compute('BUY','GOLD', 0, BUY, SELL))->throws(ApiException::class);
```
(Compute expected numbers by hand: BUY-PKR 10,000,000×1000/4,351,063 = 2298.29 → 2298 mg; 2298×4,351,063/1000 = 9,998,742.77 → ceil 9,998,743. SELL-GOLD 2500×3,559,961/1000 = 8,899,902.5 → floor 8,899,902. SELL-PKR 5,000,000×1000/3,559,961 = 1404.51 → ceil 1405.)

- [ ] **Step 2: Implement `QuoteMath`**

```php
public static function compute(string $side, string $inputMode, int $amount, int $buy, int $sell): array {
    if ($amount <= 0) throw new ApiException('VALIDATION', 'Amount must be greater than zero', 422);
    $unit = $side === 'BUY' ? $buy : $sell;
    if ($side === 'BUY')  { [$mg, $total] = $inputMode === 'PKR' ? [Money::mulDivFloor($amount,1000,$unit), null] : [$amount, null]; $total = Money::mulDivCeil($mg,$unit,1000); }
    else                  { $mg = $inputMode === 'PKR' ? Money::mulDivCeil($amount,1000,$unit) : $amount; $total = Money::mulDivFloor($mg,$unit,1000); }
    if ($mg < config('gold.min_trade_mg')) throw new ApiException('VALIDATION', 'Minimum trade is 0.010 g', 422, ['min_trade_mg'=>config('gold.min_trade_mg')]);
    return ['gold_mg'=>$mg,'total_paisa'=>$total,'unit_price'=>$unit];
}
```

- [ ] **Step 3: Failing `QuoteIssueTest`** (reuse `fakeBoth()` from Task 3 — move it to `tests/Pest.php` as a global helper):

```php
beforeEach(fn () => $this->seed());
test('issues a 75s quote with server_now', function () {
    fakeBoth(); $r = $this->postJson('/api/quotes', ['side'=>'BUY','input_mode'=>'PKR','amount'=>10000000])->assertCreated();
    $r->assertJsonPath('status','ACTIVE')->assertJsonPath('gold_mg',2298)->assertJsonPath('total_paisa',9998743)->assertJsonPath('guardrail_applied',false);
    expect($r->json('seconds_remaining'))->toBeGreaterThan(73)->toBeLessThanOrEqual(75); expect($r->json('server_now'))->toMatch('/Z$/');
});
test('paused → 409 TRADING_PAUSED', function () {
    fakeBoth(pOk:false,fOk:false); $this->postJson('/api/quotes',['side'=>'BUY','input_mode'=>'GOLD','amount'=>1000])->assertStatus(409)->assertJsonPath('error.code','TRADING_PAUSED');
});
test('insufficient cash / gold / inventory name the shortfall', function () {
    fakeBoth();
    $this->postJson('/api/quotes',['side'=>'BUY','input_mode'=>'PKR','amount'=>25000001])->assertStatus(422)->assertJsonPath('error.code','INSUFFICIENT_CASH')->assertJsonPath('error.details.available',25000000);
    $this->postJson('/api/quotes',['side'=>'SELL','input_mode'=>'GOLD','amount'=>2501])->assertStatus(422)->assertJsonPath('error.code','INSUFFICIENT_GOLD')->assertJsonPath('error.details.available',2500);
    $this->postJson('/api/quotes',['side'=>'BUY','input_mode'=>'GOLD','amount'=>50001])->assertStatus(422)->assertJsonPath('error.code','INSUFFICIENT_CASH'); // cash runs out first at seed
    app(\App\Domain\Demo\DemoService::class)->adjustBalances(['customer_cash_paisa'=>100000000000]);
    $this->postJson('/api/quotes',['side'=>'BUY','input_mode'=>'GOLD','amount'=>50001])->assertStatus(422)->assertJsonPath('error.code','INSUFFICIENT_INVENTORY')->assertJsonPath('error.details.available',50000);
});
test('guardrail binds when raised', function () {
    fakeBoth(); app(\App\Domain\Demo\DemoSettings::class)->set(['guardrail_paisa_per_gram'=>5000000]);
    $this->postJson('/api/quotes',['side'=>'BUY','input_mode'=>'GOLD','amount'=>1000])->assertCreated()->assertJsonPath('unit_price_paisa_per_gram',5000000)->assertJsonPath('guardrail_applied',true);
    $this->postJson('/api/quotes',['side'=>'SELL','input_mode'=>'GOLD','amount'=>1000])->assertCreated()->assertJsonPath('unit_price_paisa_per_gram',3559961);
});
test('validation errors use the envelope', fn () => $this->postJson('/api/quotes',['side'=>'HOLD'])->assertStatus(422)->assertJsonPath('error.code','VALIDATION'));
test('reading an expired quote flips it to EXPIRED', function () {
    fakeBoth(); $id = $this->postJson('/api/quotes',['side'=>'BUY','input_mode'=>'GOLD','amount'=>1000])->json('id');
    $this->travel(76)->seconds(); $this->getJson("/api/quotes/$id")->assertOk()->assertJsonPath('status','EXPIRED')->assertJsonPath('seconds_remaining',0);
});
```
(`DemoService::adjustBalances` is Task 7 — create a minimal version now: it posts `ADJUSTMENT` entries against `external_*` to set the given accounts to the given absolute values.)

- [ ] **Step 4: Implement `QuoteService`** — `issue()`: `$view = price->current()`; if `!$view['trading']['enabled']` throw 409; `$m = QuoteMath::compute(...)`; `checkAffordability($side, $m['gold_mg'], $m['total_paisa'], $ledger->balances())`; `Quote::create([...,'status'=>'ACTIVE','created_at'=>now(),'expires_at'=>now()->addSeconds(config('gold.quote_ttl_seconds')),'price_snapshot_id'=>$view['snapshot_id']])` (add `snapshot_id` to PriceView). `checkAffordability`: BUY → `total > customer_cash` ⇒ `InsufficientBalance::cash`, `gold_mg > platform_gold` ⇒ `inventory`; SELL → `gold_mg > customer_gold` ⇒ `gold`. Controller: `QuoteController@store` validates `side in:BUY,SELL`, `input_mode in:PKR,GOLD`, `amount integer min:1`; `@show`. Routes in `routes/api.php` (no prefix needed — Laravel mounts at `/api`).

- [ ] **Step 5: PASS; commit** — `git commit -am "feat(api): quote math, quote issue/read with lazy expiry, affordability checks"`

---

## Task 5: Settlement (confirm), trades, integrity endpoint

**Files:**
- Create: `app/Domain/Quotes/SettlementService.php`, `app/Http/Controllers/{TradeController,IntegrityController}.php`
- Test: `tests/Feature/ConfirmTest.php`, `tests/Feature/IntegrityTest.php`

**Interfaces:**
- Produces: `SettlementService::confirm(string $quoteId): array` → Receipt per spec §8 (`trade`, `balances_before`, `balances_after`, `idempotent_replay`). `SettlementService::receipt(Trade $t, bool $replay=false): array`. Routes: `POST /api/quotes/{id}/confirm`, `GET /api/trades`, `GET /api/trades/{id}`, `GET /api/integrity`.

- [ ] **Step 1: Failing `ConfirmTest`**

```php
beforeEach(function () { $this->seed(); fakeBoth(); $this->q = fn ($side='BUY',$mode='GOLD',$amt=1000) => $this->postJson('/api/quotes',['side'=>$side,'input_mode'=>$mode,'amount'=>$amt])->assertCreated()->json('id'); });
test('confirm settles once, moves balances by stored legs, ledger balanced', function () {
    $id = ($this->q)(); $r = $this->postJson("/api/quotes/$id/confirm")->assertOk();
    $r->assertJsonPath('idempotent_replay', false)->assertJsonPath('trade.gold_mg',1000)->assertJsonPath('trade.total_paisa',4351063)
      ->assertJsonPath('balances_before.customer_gold_mg',2500)->assertJsonPath('balances_after.customer_gold_mg',3500)
      ->assertJsonPath('balances_after.customer_cash_paisa',25000000-4351063)->assertJsonPath('balances_after.platform_gold_mg',49000);
    expect(\App\Models\LedgerEntry::where('kind','TRADE')->count())->toBe(4);
    expect(app(\App\Domain\Ledger\LedgerService::class)->integrity()['ok'])->toBeTrue();
    $this->getJson("/api/quotes/$id")->assertJsonPath('status','SETTLED');
});
test('confirm twice → same trade, replay flag, no new entries', function () {
    $id = ($this->q)(); $a = $this->postJson("/api/quotes/$id/confirm")->json('trade.id');
    $b = $this->postJson("/api/quotes/$id/confirm")->assertOk()->assertJsonPath('idempotent_replay',true)->json('trade.id');
    expect($a)->toBe($b)->and(\App\Models\Trade::count())->toBe(1)->and(\App\Models\LedgerEntry::where('kind','TRADE')->count())->toBe(4);
});
test('expired → 409 QUOTE_EXPIRED, nothing moves', function () {
    $id = ($this->q)(); $this->travel(75)->seconds();
    $this->postJson("/api/quotes/$id/confirm")->assertStatus(409)->assertJsonPath('error.code','QUOTE_EXPIRED')->assertJsonPath('error.details.quote.side','BUY');
    expect(\App\Models\Trade::count())->toBe(0)->and(app(\App\Domain\Ledger\LedgerService::class)->balances()['customer_gold_mg'])->toBe(2500);
});
test('balances re-checked at confirm', function () {
    $id = ($this->q)('BUY','PKR',10000000); app(\App\Domain\Demo\DemoService::class)->adjustBalances(['customer_cash_paisa'=>500000]);
    $this->postJson("/api/quotes/$id/confirm")->assertStatus(422)->assertJsonPath('error.code','INSUFFICIENT_CASH');
    $this->getJson("/api/quotes/$id")->assertJsonPath('status','ACTIVE');
});
test('active quote is honoured even if feed pauses after issue', function () {
    $id = ($this->q)(); fakeBoth(pOk:false,fOk:false); app(\App\Domain\Pricing\PriceService::class)->refresh(force:true);
    expect($this->getJson('/api/price')->json('status'))->toBe('PAUSED');
    $this->postJson("/api/quotes/$id/confirm")->assertOk();
});
test('sell path', function () {
    $id = ($this->q)('SELL','GOLD',500); $this->postJson("/api/quotes/$id/confirm")->assertOk()
        ->assertJsonPath('balances_after.customer_gold_mg',2000)->assertJsonPath('balances_after.platform_gold_mg',50500)->assertJsonPath('balances_after.customer_cash_paisa',25000000+1779980);
});
test('unknown quote → 404', fn () => $this->postJson('/api/quotes/00000000-0000-0000-0000-000000000000/confirm')->assertNotFound()->assertJsonPath('error.code','NOT_FOUND'));
```

- [ ] **Step 2: Implement `SettlementService::confirm`** — exactly spec §7 in `DB::transaction(function () {...}, attempts: 1)`:

```php
$q = Quote::whereKey($id)->lockForUpdate()->first() ?? throw new ApiException('NOT_FOUND','Quote not found',404);
if ($q->status === 'SETTLED') return $this->receipt(Trade::where('quote_id',$q->id)->firstOrFail(), replay: true);
if ($q->status === 'EXPIRED' || now()->gte($q->expires_at)) {
    if ($q->status !== 'EXPIRED') $q->update(['status'=>'EXPIRED']);
    throw new ApiException('QUOTE_EXPIRED','This price lock has expired. Get a fresh quote to continue.',409,['quote'=>$this->quotes->toArray($q)]);
}
$bal = $this->ledger->lockTradeAccounts();                     // FOR UPDATE, stable order
$before = $this->ledger->balances();
$this->quotes->checkAffordability($q->side, $q->gold_mg, $q->total_paisa, $before);
$sign = $q->side === 'BUY' ? 1 : -1;
$trade = Trade::create([... 'quote_id'=>$q->id, 'balances_before'=>$before, 'balances_after'=>[] ...]);
$this->ledger->post('TRADE', $trade->id, [
    ['account'=>Account::CUSTOMER_CASH,'amount'=>-$sign*$q->total_paisa], ['account'=>Account::PLATFORM_CASH,'amount'=>$sign*$q->total_paisa],
    ['account'=>Account::CUSTOMER_GOLD,'amount'=>$sign*$q->gold_mg],     ['account'=>Account::PLATFORM_GOLD,'amount'=>-$sign*$q->gold_mg],
]);
$trade->update(['balances_after'=>$this->ledger->balances()]);
$q->update(['status'=>'SETTLED','settled_at'=>now()]);
return $this->receipt($trade);
```
Wrap the transaction in `try/catch (\Illuminate\Database\UniqueConstraintViolationException)` → re-read the trade by `quote_id` and return `receipt(..., replay: true)` (the second guard). `TradeController@index` newest 25 via `SettlementService::receipt` minus before/after (`trade` only); `@show` full receipt. `IntegrityController` returns `LedgerService::integrity()`.

- [ ] **Step 3: `IntegrityTest`** — 30 random BUY/SELL quotes+confirms (amounts within balances; skip if insufficient) then assert `GET /api/integrity` `ok:true`, and `customer_gold_mg + platform_gold_mg === 52500` (gold conserved across trades).

- [ ] **Step 4: PASS; commit** — `git commit -am "feat(api): transactional settlement with idempotent replay, trades, integrity endpoint"`

---

## Task 6: State + price controllers, routes, StateTest

**Files:**
- Create: `app/Http/Controllers/{StateController,PriceController}.php`; finalize `routes/api.php`
- Test: `tests/Feature/StateTest.php`

**Interfaces:**
- Produces: `GET /api/state` → `{price: PriceView, balances, trading, integrity: {ok, checked_at}, recent_trades: Trade[] (newest 10, trade objects only), server_now}`; `GET /api/price` → PriceView.

- [ ] **Step 1: Failing `StateTest`** — asserts the key set above, `balances` equals seed, `recent_trades` empty then length 1 after a confirm, `price.source.primary.name === 'PakGold'`, `price.source.fallback.name === 'GoldPrice.org'`, `price.refresh_interval_seconds === 300`, `price.max_age_seconds === 600`, and that two `GET /api/state` calls within 5 min make exactly 3 outbound requests total.
- [ ] **Step 2: Implement + full `routes/api.php`:**

```php
Route::get('/state', StateController::class);
Route::get('/price', [PriceController::class, 'show']);
Route::post('/quotes', [QuoteController::class, 'store']);
Route::get('/quotes/{id}', [QuoteController::class, 'show']);
Route::post('/quotes/{id}/confirm', [QuoteController::class, 'confirm']);
Route::get('/trades', [TradeController::class, 'index']);
Route::get('/trades/{id}', [TradeController::class, 'show']);
Route::get('/integrity', IntegrityController::class);
Route::prefix('demo')->group(function () {
    Route::get('/settings', [DemoController::class, 'settings']);
    Route::put('/settings', [DemoController::class, 'updateSettings']);
    Route::post('/price/refresh', [DemoController::class, 'refresh']);
    Route::post('/balances', [DemoController::class, 'balances']);
    Route::post('/quotes/{id}/expire', [DemoController::class, 'expireQuote']);
    Route::post('/reset', [DemoController::class, 'reset']);
});
```
- [ ] **Step 3: PASS; commit** — `git commit -am "feat(api): state + price endpoints, route table"`

---

## Task 7: Reviewer (demo) endpoints

**Files:**
- Create/finish: `app/Domain/Demo/DemoService.php`, `app/Http/Controllers/DemoController.php`
- Test: `tests/Feature/DemoTest.php`

**Interfaces:**
- Produces: `DemoService::adjustBalances(array $targets): array` (keys `customer_cash_paisa|customer_gold_mg|platform_gold_mg`, absolute values ≥ 0; posts `ADJUSTMENT` entries vs `external_*`; returns new balances). `DemoService::reset(): void` (truncate ledger_entries, trades, quotes, price_snapshots, demo_settings; reset account balances to 0; re-run seeder). `DemoService::expireQuote(string $id): Quote` (sets `expires_at = now()`, status `EXPIRED` if ACTIVE).
- Controller responses: `settings` → `DemoSettings::get()`; `updateSettings` validates booleans + `guardrail_paisa_per_gram integer min:0 max:100000000` → returns settings **and** `price: PriceService::view(latest)` so the UI updates guardrail instantly without a refetch; `refresh` → `PriceService::refresh(force:true)` then `current()`; `balances` → `{balances, integrity}`; `expireQuote` → quote array; `reset` → `{ok:true}`.

- [ ] **Step 1: Failing `DemoTest`** — toggling `fail_primary` then `POST /api/demo/price/refresh` yields `source.selected === 'goldprice'`; both flags → `PAUSED`; `PUT settings {guardrail_paisa_per_gram: 5000000}` → response `price.guardrail_applied === true` and `price.buy_paisa_per_gram === 5000000`; `POST balances {customer_cash_paisa: 500000}` → balances updated, `integrity.ok === true`, ledger sum still zero; `POST reset` after a trade → seed balances, zero trades, `demo settings` back to defaults; `expire` flips an ACTIVE quote and confirm then returns `QUOTE_EXPIRED`.
- [ ] **Step 2: Implement. Step 3: PASS; commit** — `git commit -am "feat(api): reviewer tools endpoints (outage toggles, guardrail, balances, reset)"`

---

## Task 8: API Dockerfile, Railway config, seed-on-boot, concurrency script

**Files:**
- Create: `api/Dockerfile`, `api/.dockerignore`, `api/scripts/double-confirm.sh`, `api/railway.json`
- Modify: `api/.env.example` (document prod vars), `api/routes/console.php` or a `Console` command `app:ensure-seeded`

- [ ] **Step 1: Dockerfile**

```dockerfile
FROM serversideup/php:8.4-fpm-nginx AS base
ENV PHP_OPCACHE_ENABLE=1 AUTORUN_ENABLED=true AUTORUN_LARAVEL_MIGRATION=true SSL_MODE=off
USER root
RUN install-php-extensions pdo_pgsql bcmath
USER www-data
WORKDIR /var/www/html
COPY --chown=www-data:www-data composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader --no-scripts
COPY --chown=www-data:www-data . .
RUN composer run-script post-autoload-dump --no-interaction && php artisan config:clear
EXPOSE 8080
```
Seed-on-boot: serversideup runs migrations when `AUTORUN_LARAVEL_MIGRATION=true`; add an artisan command `app:ensure-seeded` (calls `DatabaseSeeder` — it is idempotent) and hook it via the image's `/etc/entrypoint.d/60-seed.sh` (`COPY docker/60-seed.sh /etc/entrypoint.d/`; content: `php /var/www/html/artisan app:ensure-seeded`). `.dockerignore`: `vendor node_modules .env tests storage/logs/* database/database.sqlite`.
`railway.json`: `{"$schema":"https://railway.app/railway.schema.json","build":{"builder":"DOCKERFILE"},"deploy":{"healthcheckPath":"/up","restartPolicyType":"ON_FAILURE"}}`.

- [ ] **Step 2: `.env.example` prod block** (comments): `APP_ENV=production APP_DEBUG=false APP_URL=https://<railway-domain> DB_CONNECTION=pgsql DB_URL=${{Postgres.DATABASE_URL}} CACHE_STORE=database SESSION_DRIVER=file LOG_CHANNEL=stderr GUARDRAIL_PAISA_PER_GRAM=3500000`. Note `APP_KEY` must be generated (`php artisan key:generate --show`).

- [ ] **Step 3: `scripts/double-confirm.sh`**

```bash
#!/usr/bin/env bash
# Usage: scripts/double-confirm.sh https://host   — fires 10 parallel confirms at one quote, expects exactly 1 trade.
set -euo pipefail; H="${1:-http://localhost:8000}"
Q=$(curl -sS -X POST "$H/api/quotes" -H 'Content-Type: application/json' -d '{"side":"BUY","input_mode":"GOLD","amount":100}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
BEFORE=$(curl -sS "$H/api/trades" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')
for i in $(seq 1 10); do curl -sS -o /dev/null -w "%{http_code} " -X POST "$H/api/quotes/$Q/confirm" & done; wait; echo
AFTER=$(curl -sS "$H/api/trades" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')
IDS=$(curl -sS "$H/api/trades" | python3 -c "import sys,json;print(sum(1 for t in json.load(sys.stdin) if t['quote_id']=='$Q'))")
echo "trades before=$BEFORE after=$AFTER for_quote=$IDS"; [ "$IDS" = "1" ] && echo "PASS: exactly one trade" || { echo "FAIL"; exit 1; }
```
- [ ] **Step 4: Local proof** — `docker build -t asasa-api api/` succeeds; run `php artisan serve` (SQLite) and execute the script → `PASS`. Commit — `git commit -am "chore(api): Dockerfile for Railway, seed-on-boot, double-confirm script"`

---

## Task 9: Web scaffold — tokens, fonts, rewrites, types, api client, money formatters

**Files:**
- Modify: `web/next.config.ts`, `web/app/layout.tsx`, `web/app/globals.css`, `web/package.json` (vitest)
- Create: `web/lib/{types,api,money,useServerClock,useAppState}.ts`, `web/lib/money.test.ts`, `web/.env.example`, `web/components/ui/{Button,Card,Pill,Field,Drawer}.tsx`

**Interfaces:**
- Produces:
  - `next.config.ts`: `rewrites: async () => [{ source: '/api/:path*', destination: `${process.env.API_URL ?? 'http://localhost:8000'}/api/:path*` }]`.
  - `lib/types.ts`: TS types mirroring spec §8 exactly (`PriceView`, `Balances {customer_cash_paisa, customer_gold_mg, platform_cash_paisa, platform_gold_mg}`, `Quote`, `Trade`, `Receipt`, `StateResponse`, `DemoSettings`, `ApiErrorBody`).
  - `lib/api.ts`: `class ApiError extends Error { code: string; status: number; details?: Record<string, unknown> }`; `getState()`, `getPrice()`, `issueQuote(body)`, `getQuote(id)`, `confirmQuote(id)`, `getTrade(id)`, `getIntegrity()`, `demo.getSettings()`, `demo.updateSettings(p)`, `demo.refresh()`, `demo.setBalances(p)`, `demo.expireQuote(id)`, `demo.reset()`. All `fetch(..., { cache: 'no-store' })`, parse envelope → throw `ApiError`.
  - `lib/money.ts`: `formatPKR(paisa: number, opts?: {compact?: boolean}): string` → `"PKR 43,490.65"`; `formatGold(mg: number): string` → `"2.500 g"`; `formatPricePerGram(paisa)` → `"PKR 43,490.65 / g"`; `parsePKR(input: string): number | null` (accepts `1,25,000.5`, `250000`, rejects negatives/NaN → null) returns paisa; `parseGold(input: string): number | null` returns mg (max 3 decimals; more → null); `bpsToPercent(bps)` → `"0.05%"`.
  - `useServerClock(serverNow?: string)` → `{ now: () => number }` with offset = `Date.parse(serverNow) - Date.now()` recomputed whenever `serverNow` changes.
  - `useAppState()` → `{ state, error, loading, refresh(): Promise<void>, tick: number }` — fetches `/api/state` on mount and every 30 s; `tick` increments every 1 s so consumers can derive `age_seconds + elapsed`.
  - `globals.css` `@theme { --color-forest:#0D4A46; --color-forest-deep:#0A2E2B; --color-lime:#8CCB50; --color-lime-soft:#ACDF6F; --color-mist:#F9FAFA; --color-ink:#1A1F1B; --color-ink-muted:#7A847E; --color-gold:#E9CB78; --color-gold-soft:#F5DE7D; --color-coral:#E0807A; --radius-card:18px; --font-display: "Geist", ui-sans-serif, system-ui; --font-sans: "Inter", ui-sans-serif, system-ui; }`; body `bg-mist text-ink font-sans`.
  - Fonts via `next/font/google` (`Geist`, `Inter`) exposed as CSS variables in `layout.tsx`.

- [ ] **Step 1: `npm i -D vitest` + `"test": "vitest run"` script. Failing `lib/money.test.ts`:**

```ts
import { describe, it, expect } from 'vitest'
import { formatPKR, formatGold, parsePKR, parseGold } from './money'
describe('money', () => {
  it('formats paisa', () => { expect(formatPKR(4349065)).toBe('PKR 43,490.65'); expect(formatPKR(0)).toBe('PKR 0.00'); expect(formatPKR(25000000)).toBe('PKR 250,000.00') })
  it('formats mg', () => { expect(formatGold(2500)).toBe('2.500 g'); expect(formatGold(7)).toBe('0.007 g'); expect(formatGold(52500)).toBe('52.500 g') })
  it('parses PKR', () => { expect(parsePKR('250,000')).toBe(25000000); expect(parsePKR('99.999')).toBe(null); expect(parsePKR('-5')).toBe(null); expect(parsePKR('')).toBe(null); expect(parsePKR('0.01')).toBe(1) })
  it('parses gold', () => { expect(parseGold('2.5')).toBe(2500); expect(parseGold('0.001')).toBe(1); expect(parseGold('0.0001')).toBe(null); expect(parseGold('abc')).toBe(null) })
})
```
- [ ] **Step 2: Implement; `npm test` PASS; `npm run build` clean. Commit** — `git commit -am "feat(web): tokens, fonts, API proxy, typed client, money formatters"`

---

## Task 10: PriceCard, TrustBanner, BalancesCard, Stepper, Header, page shell

**Files:** `web/components/{Header,Stepper,TrustBanner,PriceCard,BalancesCard}.tsx`, `web/app/page.tsx`

**Interfaces:**
- `Stepper({ step }: { step: 1|2|3|4|5 })` labels exactly: See price · Enter · Review · Confirm · Complete.
- `TrustBanner({ price }: { price: PriceView })` renders nothing when `LIVE`; amber (`gold-soft` bg) for `DEGRADED`; coral for `PAUSED`; text = `price.trading.reason` or the DEGRADED reason; includes source name in use.
- `PriceCard({ price, elapsed }: { price: PriceView; elapsed: number })` — big market price (`formatPricePerGram`), or greyed `last_known_*` with "Last known · N min ago" when `market_paisa_per_gram` is null; Buy/Sell pills; source badge with `selected` name; verification chip: `Cross-checked ✓` (lime) / `Single source` (gold) / `Disputed` / `Unavailable` (coral); `"Updated {age+elapsed}s ago · next refresh in {mm:ss}"`; guardrail line `"Guardrail applied · floor {formatPKR(guardrail)}"` only when `guardrail_applied`; an ⓘ popover listing both sources' raw `paisa_per_gram`, `meta.method`, `divergence_bps` as %.
- `BalancesCard({ balances, previous? })` — three tiles: Wallet / Your gold / Platform inventory; when `previous` differs, show `▲/▼ delta` for 3 s.
- `page.tsx` composes: Header → Stepper → TrustBanner → PriceCard → BalancesCard → (Task 11 panel) → (Task 12 history). Layout: single column ≤ 1023 px, `lg:grid-cols-[1fr_420px]` with price+balances left and trade panel right at ≥ 1024 px. Max width 1120 px, padding 16/24.

- [ ] Steps: build each component with the props above; `npm run build` + `npm run lint` clean; commit `feat(web): price card, trust banner, balances, stepper`.

---

## Task 11: TradeForm + QuoteReview (countdown, confirm, expired, insufficiency)

**Files:** `web/components/{TradeForm,QuoteReview}.tsx`; wire into `page.tsx`

**Interfaces:**
- `TradeForm({ price, balances, disabledReason, onQuote })` — state: `side: 'BUY'|'SELL'` (segmented), `mode: 'PKR'|'GOLD'` (toggle inside the field, swaps label/placeholder), `raw: string`. Chips 25/50/Max compute from the relevant balance (BUY+PKR → wallet; BUY+GOLD → min(wallet/buy, inventory); SELL → customer gold; SELL+PKR → gold×sell). Live estimate line uses the same integer math as the server (port `QuoteMath` to `lib/quoteMath.ts` with the four cases; **display only** — the server's numbers win). Inline validation messages: parse failure, below min 0.010 g, exceeds balance ("You have PKR 250,000.00"). Submit → `onQuote({side, input_mode, amount})`. Button label `Lock price for 75 s`; disabled with `disabledReason` under it when trading paused.
- `QuoteReview({ quote, serverClock, onConfirm, onCancel, onRequote })` — shows locked unit price, breakdown rows: Market reference · Spread (+10 % / −10 %) · Guardrail (only if applied, with floor value) · **You pay / You receive** · **You get / You give**. Ring countdown (SVG circle, `stroke-dashoffset`) driven by `Math.max(0, Math.ceil((Date.parse(quote.expires_at) - serverClock.now())/1000))`. Confirm button: `disabled` while `submitting` or at 0; double-click guard via a `useRef` in-flight flag. States: `active` → `expired` (local zero **or** `ApiError.code === 'QUOTE_EXPIRED'`) shows "Price lock expired" + **Get a fresh quote** (calls `onRequote(quote)` — page re-issues with the same inputs and passes `previousUnitPrice` so the new review shows `▲/▼ PKR x since your last quote`); `insufficient` (`INSUFFICIENT_*`) shows the server message + required/available, with **Adjust amount** back to the form.
- `page.tsx` step mapping: 1 idle · 2 typing (raw non-empty) · 3 quote active · 4 confirming · 5 receipt shown.

- [ ] Steps: implement; manual check in the browser against local API for: quote, wait to 0, requote, confirm, double-click confirm; `npm run build` clean; commit `feat(web): trade form, locked quote review with server-clock countdown, expiry & insufficiency flows`.

---

## Task 12: Receipt + TradeHistory

**Files:** `web/components/{Receipt,TradeHistory}.tsx`

- `Receipt({ receipt, integrityOk, onNewTrade })` — success mark; "Bought 1.000 g" / "Sold 0.500 g"; rows: Trade ID (short + copy), Settled at, Unit price, Total, Market ref + source + price time, Guardrail (if applied); **Before → After** table for the three balances; footer `Books balanced ✓` / `Books check failed` (coral) from `/api/integrity`; `idempotent_replay` → small note "Already settled — showing the original receipt"; `@media print` styles; **New trade** button.
- `TradeHistory({ trades, onOpen })` — newest first, side badge, grams, total, time; tap → `getTrade(id)` → show `Receipt` in a modal/drawer.
- [ ] Build clean; commit `feat(web): receipt with before/after balances and trade history`.

---

## Task 13: ReviewerTools drawer

**Files:** `web/components/ReviewerTools.tsx`, `web/components/ui/Drawer.tsx`

- Drawer from the right (full-width sheet on mobile), title **Reviewer tools**, subtitle *"Demo controls — not part of the product. Use these to try the stress cases."* Sections:
  1. **Price sources**: switches Kill PakGold (`fail_primary`), Kill GoldPrice.org (`fail_fallback`), Force stale (`force_stale`); each change → `demo.updateSettings` then `demo.refresh()` then `refresh()`; a note *"Force refresh bypasses the 5-minute cache (demo only)."* and a **Force refresh now** button.
  2. **Guardrail**: number input in PKR/g (converted to paisa), buttons **Set above market** (= `ceil(market×1.25)`) and **Reset (35,000)**; shows whether it currently binds.
  3. **Balances**: presets *Wallet → PKR 5,000* · *Gold → 0.100 g* · *Inventory → 0.500 g* · custom inputs; **Apply**.
  4. **Quote**: **Expire current quote** (enabled when a quote is active).
  5. **Reset demo** (confirm dialog).
  Each action shows a toast with the result; errors surface the envelope message.
- [ ] Build clean; commit `feat(web): reviewer tools drawer`.

---

## Task 14: Visual QA at 390 px and 1280 px

- Run API (`php artisan serve`) + web (`npm run dev`); with Playwright (`example-skills:webapp-testing` or `mcp__playwright__*`) capture: idle, quote review, expired, paused (both killed), guardrail applied, receipt, drawer — at both widths. Fix overflow/contrast issues. Save to `docs/screenshots/`. Commit `chore: screenshots`.

---

## Task 15: README, WhatIDid.md, repo push, deploy verification

- `README.md`: what it is, architecture diagram (text), local setup (api + web, copy-paste), running tests, deploy to Railway (env table) and Vercel (root dir `web`, `API_URL`), reviewer guide (how to trigger each stress case), live links placeholders to fill.
- `WhatIDid.md`: understanding of the brief; **what I found** (pakgold.com parked → pakgold.pk pipeline; goldprice.org headers); assumptions (guardrail floor, DEGRADED still trades, honour active quotes when feed pauses, 5-min cache is strict, rounding favours platform, platform cash not gated); what was built; key decisions (integers, double-entry, once-rounding, idempotency via row lock + unique, server clock); known gaps (no auth, single user, no websocket price push, no cost-basis guardrail, demo endpoints unauthenticated by design); how to review in 3 minutes.
- Root `.gitignore` covering both apps. `gh repo create Mudasir1406/asasa-gold --public --source=. --push`.
- After the user deploys: run `api/scripts/double-confirm.sh https://<railway>` and a Playwright pass on the Vercel URL; record results in WhatIDid.md; final commit.
