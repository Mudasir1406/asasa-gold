<?php

use App\Domain\Ledger\LedgerService;
use App\Models\DemoSetting;
use App\Models\LedgerEntry;
use App\Models\PriceSnapshot;
use App\Models\Quote;
use App\Models\Trade;
use Illuminate\Support\Facades\Http;

const DEFAULT_SETTINGS = ['fail_primary' => false, 'fail_fallback' => false, 'force_stale' => false, 'guardrail_paisa_per_gram' => 3500000];

const SEED_BALANCES = ['customer_cash_paisa' => 25000000, 'customer_gold_mg' => 2500, 'platform_cash_paisa' => 500000000, 'platform_gold_mg' => 50000];

beforeEach(function () {
    $this->seed();
    fakeBoth();
});

test('settings default to no outages and the configured guardrail', function () {
    $this->getJson('/api/demo/settings')->assertOk()->assertExactJson(DEFAULT_SETTINGS);
});

test('killing PakGold and forcing a refresh fails over to GoldPrice.org', function () {
    $this->getJson('/api/price')->assertJsonPath('source.selected', 'pakgold');

    $this->putJson('/api/demo/settings', ['fail_primary' => true])->assertOk()
        ->assertJsonPath('settings.fail_primary', true)
        ->assertJsonPath('settings.fail_fallback', false)
        ->assertJsonPath('price.source.selected', 'pakgold');   // still the cached snapshot until a refresh
    $this->getJson('/api/price')->assertJsonPath('source.selected', 'pakgold');
    Http::assertSentCount(3);   // the normal path stays inside its 5-minute window

    $this->postJson('/api/demo/price/refresh')->assertOk()
        ->assertJsonPath('status', 'DEGRADED')
        ->assertJsonPath('source.selected', 'goldprice')
        ->assertJsonPath('source.verification', 'SINGLE_SOURCE')
        ->assertJsonPath('source.primary.ok', false)
        ->assertJsonPath('source.primary.error', 'Simulated outage (reviewer tools)')
        ->assertJsonPath('trading.enabled', true)
        ->assertJsonPath('trading.reason', 'Primary source down — using GoldPrice.org')
        ->assertJsonPath('market_paisa_per_gram', 3953695);
    Http::assertSentCount(4);   // only GoldPrice.org was called this time
    expect(PriceSnapshot::count())->toBe(2);
});

test('killing both sources pauses trading and keeps the last known price', function () {
    $this->getJson('/api/price')->assertJsonPath('status', 'LIVE');
    $this->putJson('/api/demo/settings', ['fail_primary' => true, 'fail_fallback' => true])->assertOk();

    $this->postJson('/api/demo/price/refresh')->assertOk()
        ->assertJsonPath('status', 'PAUSED')
        ->assertJsonPath('trading.enabled', false)
        ->assertJsonPath('trading.code', 'PRICE_UNAVAILABLE')
        ->assertJsonPath('market_paisa_per_gram', null)
        ->assertJsonPath('last_known_market_paisa_per_gram', 3955512)
        ->assertJsonPath('source.fallback.error', 'Simulated outage (reviewer tools)');
    Http::assertSentCount(3);

    $this->postJson('/api/quotes', ['side' => 'BUY', 'input_mode' => 'GOLD', 'amount' => 1000])
        ->assertStatus(409)
        ->assertJsonPath('error.code', 'TRADING_PAUSED');

    $this->putJson('/api/demo/settings', ['fail_primary' => false, 'fail_fallback' => false])->assertOk();
    $this->postJson('/api/demo/price/refresh')->assertOk()->assertJsonPath('status', 'LIVE');
});

test('force stale pauses trading immediately, without a refetch', function () {
    $this->getJson('/api/price')->assertJsonPath('status', 'LIVE');

    $this->putJson('/api/demo/settings', ['force_stale' => true])->assertOk()
        ->assertJsonPath('settings.force_stale', true)
        ->assertJsonPath('price.status', 'PAUSED')
        ->assertJsonPath('price.trading.code', 'PRICE_STALE')
        ->assertJsonPath('price.trading.reason', 'Price data is stale (forced for demo)')
        ->assertJsonPath('price.last_known_market_paisa_per_gram', 3955512);
    Http::assertSentCount(3);

    $this->getJson('/api/state')->assertJsonPath('trading.code', 'PRICE_STALE');
});

test('raising the guardrail reprices buys instantly and leaves sells alone', function () {
    $this->getJson('/api/price')->assertJsonPath('buy_paisa_per_gram', 4351063);

    $this->putJson('/api/demo/settings', ['guardrail_paisa_per_gram' => 5000000])->assertOk()
        ->assertJsonPath('settings.guardrail_paisa_per_gram', 5000000)
        ->assertJsonPath('price.guardrail_paisa_per_gram', 5000000)
        ->assertJsonPath('price.guardrail_applied', true)
        ->assertJsonPath('price.buy_paisa_per_gram', 5000000)
        ->assertJsonPath('price.sell_paisa_per_gram', 3559961)
        ->assertJsonPath('price.market_paisa_per_gram', 3955512);
    Http::assertSentCount(3);

    $this->postJson('/api/quotes', ['side' => 'BUY', 'input_mode' => 'GOLD', 'amount' => 1000])
        ->assertCreated()
        ->assertJsonPath('unit_price_paisa_per_gram', 5000000)
        ->assertJsonPath('guardrail_applied', true);

    $this->putJson('/api/demo/settings', ['guardrail_paisa_per_gram' => 3500000])->assertOk()
        ->assertJsonPath('price.guardrail_applied', false)
        ->assertJsonPath('price.buy_paisa_per_gram', 4351063);
});

test('settings updates are validated with the envelope', function () {
    $this->putJson('/api/demo/settings', ['guardrail_paisa_per_gram' => -1])->assertStatus(422)->assertJsonPath('error.code', 'VALIDATION');
    $this->putJson('/api/demo/settings', ['guardrail_paisa_per_gram' => 100000001])->assertStatus(422)->assertJsonPath('error.code', 'VALIDATION');
    $this->putJson('/api/demo/settings', ['guardrail_paisa_per_gram' => 12.5])->assertStatus(422)->assertJsonPath('error.code', 'VALIDATION');
    $this->putJson('/api/demo/settings', ['fail_primary' => 'maybe'])->assertStatus(422)->assertJsonPath('error.code', 'VALIDATION');
    $this->putJson('/api/demo/settings', [])->assertOk()->assertJsonPath('settings', DEFAULT_SETTINGS);
    $this->getJson('/api/demo/settings')->assertExactJson(DEFAULT_SETTINGS);
});

test('balance presets post balanced adjustments and name what is short afterwards', function () {
    $this->postJson('/api/demo/balances', ['customer_cash_paisa' => 500000])->assertOk()
        ->assertJsonPath('balances', ['customer_cash_paisa' => 500000, 'customer_gold_mg' => 2500, 'platform_cash_paisa' => 500000000, 'platform_gold_mg' => 50000])
        ->assertJsonPath('integrity.ok', true)
        ->assertJsonPath('integrity.ledger_sums.PKR', 0)
        ->assertJsonPath('integrity.ledger_sums.GOLD', 0);
    expect(LedgerEntry::where('kind', 'ADJUSTMENT')->count())->toBe(2)
        ->and((int) LedgerEntry::where('kind', 'ADJUSTMENT')->where('account_id', 'external_cash')->sum('amount'))->toBe(24500000);

    $this->postJson('/api/quotes', ['side' => 'BUY', 'input_mode' => 'PKR', 'amount' => 600000])
        ->assertStatus(422)
        ->assertJsonPath('error.code', 'INSUFFICIENT_CASH')
        ->assertJsonPath('error.details.available', 500000);

    $this->postJson('/api/demo/balances', ['customer_gold_mg' => 100, 'platform_gold_mg' => 500])->assertOk()
        ->assertJsonPath('balances.customer_gold_mg', 100)
        ->assertJsonPath('balances.platform_gold_mg', 500)
        ->assertJsonPath('integrity.ok', true);
    $this->getJson('/api/integrity')->assertJsonPath('ok', true)->assertJsonPath('entry_count', 12);
});

test('balance adjustments are validated', function () {
    $this->postJson('/api/demo/balances', [])->assertStatus(422)->assertJsonPath('error.code', 'VALIDATION');
    $this->postJson('/api/demo/balances', ['customer_gold_mg' => -1])->assertStatus(422)->assertJsonPath('error.code', 'VALIDATION');
    $this->postJson('/api/demo/balances', ['customer_cash_paisa' => 12.5])->assertStatus(422)->assertJsonPath('error.code', 'VALIDATION');
    $this->postJson('/api/demo/balances', ['platform_cash_paisa' => 1])->assertStatus(422)->assertJsonPath('error.code', 'VALIDATION');   // the float is not adjustable
    expect(LedgerEntry::count())->toBe(6);
});

test('expire flips an active quote so confirm returns QUOTE_EXPIRED', function () {
    $id = $this->postJson('/api/quotes', ['side' => 'BUY', 'input_mode' => 'GOLD', 'amount' => 1000])->assertCreated()->json('id');

    $this->postJson("/api/demo/quotes/$id/expire")->assertOk()
        ->assertJsonPath('id', $id)
        ->assertJsonPath('status', 'EXPIRED')
        ->assertJsonPath('seconds_remaining', 0)
        ->assertJsonPath('side', 'BUY')
        ->assertJsonPath('input_amount', 1000);
    expect(Quote::find($id)->expires_at->lte(now()))->toBeTrue();

    $this->postJson("/api/quotes/$id/confirm")
        ->assertStatus(409)
        ->assertJsonPath('error.code', 'QUOTE_EXPIRED')
        ->assertJsonPath('error.details.quote.input_amount', 1000);
    $this->getJson("/api/quotes/$id")->assertJsonPath('status', 'EXPIRED');
    expect(Trade::count())->toBe(0);
});

test('expire leaves a settled quote settled and 404s on unknown ids', function () {
    $id = $this->postJson('/api/quotes', ['side' => 'SELL', 'input_mode' => 'GOLD', 'amount' => 100])->json('id');
    $this->postJson("/api/quotes/$id/confirm")->assertOk();

    $this->postJson("/api/demo/quotes/$id/expire")->assertOk()->assertJsonPath('status', 'SETTLED');
    expect(Quote::find($id)->status)->toBe('SETTLED');

    $this->postJson('/api/demo/quotes/00000000-0000-0000-0000-000000000000/expire')->assertNotFound()->assertJsonPath('error.code', 'NOT_FOUND');
});

test('reset wipes trades, quotes, snapshots and settings, then restores the seed', function () {
    $id = $this->postJson('/api/quotes', ['side' => 'BUY', 'input_mode' => 'GOLD', 'amount' => 1000])->json('id');
    $this->postJson("/api/quotes/$id/confirm")->assertOk();
    $this->putJson('/api/demo/settings', ['fail_primary' => true, 'guardrail_paisa_per_gram' => 5000000])->assertOk();
    $this->postJson('/api/demo/balances', ['customer_gold_mg' => 100])->assertOk();
    expect(Trade::count())->toBe(1)->and(LedgerEntry::count())->toBe(12);

    $this->postJson('/api/demo/reset')->assertOk()->assertExactJson(['ok' => true]);

    expect(Trade::count())->toBe(0)
        ->and(Quote::count())->toBe(0)
        ->and(PriceSnapshot::count())->toBe(0)
        ->and(DemoSetting::count())->toBe(0)
        ->and(LedgerEntry::count())->toBe(6)
        ->and(LedgerEntry::where('kind', 'SEED')->count())->toBe(6)
        ->and(app(LedgerService::class)->balances())->toBe(SEED_BALANCES);
    $this->getJson('/api/demo/settings')->assertExactJson(DEFAULT_SETTINGS);
    $this->getJson('/api/integrity')->assertJsonPath('ok', true)->assertJsonPath('entry_count', 6);

    $this->getJson('/api/state')->assertOk()
        ->assertJsonPath('price.status', 'LIVE')
        ->assertJsonPath('trading.enabled', true)
        ->assertJsonPath('balances', SEED_BALANCES)
        ->assertJsonPath('recent_trades', []);
    $this->getJson("/api/quotes/$id")->assertNotFound();
});
