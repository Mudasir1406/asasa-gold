<?php

use App\Domain\Demo\DemoService;
use App\Domain\Demo\DemoSettings;
use App\Domain\Ledger\LedgerService;
use App\Models\LedgerEntry;
use App\Models\Quote;

beforeEach(fn () => $this->seed());

test('issues a 75s quote with server_now', function () {
    fakeBoth();
    $r = $this->postJson('/api/quotes', ['side' => 'BUY', 'input_mode' => 'PKR', 'amount' => 10000000])->assertCreated();
    $r->assertJsonPath('status', 'ACTIVE')
        ->assertJsonPath('side', 'BUY')
        ->assertJsonPath('input_mode', 'PKR')
        ->assertJsonPath('input_amount', 10000000)
        ->assertJsonPath('gold_mg', 2298)
        ->assertJsonPath('total_paisa', 9998743)
        ->assertJsonPath('unit_price_paisa_per_gram', 4351063)
        ->assertJsonPath('market_paisa_per_gram', 3955512)
        ->assertJsonPath('spread_bps', 11000)
        ->assertJsonPath('guardrail_paisa_per_gram', 3500000)
        ->assertJsonPath('guardrail_applied', false)
        ->assertJsonPath('source', 'pakgold')
        ->assertJsonPath('settled_at', null)
        ->assertJsonStructure(['id', 'created_at', 'expires_at', 'price_fetched_at', 'seconds_remaining', 'server_now']);
    expect($r->json('seconds_remaining'))->toBeGreaterThan(73)->toBeLessThanOrEqual(75);
    expect($r->json('server_now'))->toMatch('/\.\d{3}Z$/');
    expect($r->json('expires_at'))->toMatch('/\.\d{3}Z$/');
    expect(Quote::count())->toBe(1);
});

test('the issue response and a later read agree on expires_at to the millisecond', function () {
    fakeBoth();
    $issued = $this->postJson('/api/quotes', ['side' => 'BUY', 'input_mode' => 'GOLD', 'amount' => 1000])->assertCreated()->json();
    $read = $this->getJson("/api/quotes/{$issued['id']}")->assertOk()->json();
    expect($read['expires_at'])->toBe($issued['expires_at'])->and($read['created_at'])->toBe($issued['created_at']);
});

test('paused → 409 TRADING_PAUSED', function () {
    fakeBoth(pOk: false, fOk: false);
    $this->postJson('/api/quotes', ['side' => 'BUY', 'input_mode' => 'GOLD', 'amount' => 1000])
        ->assertStatus(409)
        ->assertJsonPath('error.code', 'TRADING_PAUSED')
        ->assertJsonPath('error.message', 'Neither price source is responding')
        ->assertJsonPath('error.details.code', 'PRICE_UNAVAILABLE');
    expect(Quote::count())->toBe(0);
});

test('insufficient cash / gold / inventory name the shortfall', function () {
    fakeBoth();
    $this->postJson('/api/quotes', ['side' => 'BUY', 'input_mode' => 'PKR', 'amount' => 26000000])
        ->assertStatus(422)
        ->assertJsonPath('error.code', 'INSUFFICIENT_CASH')
        ->assertJsonPath('error.details.required', 25997602)
        ->assertJsonPath('error.details.available', 25000000)
        ->assertJsonPath('error.details.unit', 'paisa')
        ->assertJsonPath('error.message', 'You need PKR 259,976.02 but your wallet has PKR 250,000.00');
    $this->postJson('/api/quotes', ['side' => 'SELL', 'input_mode' => 'GOLD', 'amount' => 2501])
        ->assertStatus(422)
        ->assertJsonPath('error.code', 'INSUFFICIENT_GOLD')
        ->assertJsonPath('error.details.required', 2501)
        ->assertJsonPath('error.details.available', 2500)
        ->assertJsonPath('error.details.unit', 'mg')
        ->assertJsonPath('error.message', 'You need 2.501 g but you hold 2.500 g');
    $this->postJson('/api/quotes', ['side' => 'BUY', 'input_mode' => 'GOLD', 'amount' => 50001])
        ->assertStatus(422)
        ->assertJsonPath('error.code', 'INSUFFICIENT_CASH'); // cash runs out first at seed

    app(DemoService::class)->adjustBalances(['customer_cash_paisa' => 100000000000]);
    $this->postJson('/api/quotes', ['side' => 'BUY', 'input_mode' => 'GOLD', 'amount' => 50001])
        ->assertStatus(422)
        ->assertJsonPath('error.code', 'INSUFFICIENT_INVENTORY')
        ->assertJsonPath('error.details.required', 50001)
        ->assertJsonPath('error.details.available', 50000)
        ->assertJsonPath('error.message', 'You asked for 50.001 g but the platform only has 50.000 g in inventory');
    expect(Quote::count())->toBe(0);
});

test('BUY by PKR one paisa over the wallet still fits: grams are floored so cost never exceeds input', function () {
    fakeBoth();
    $r = $this->postJson('/api/quotes', ['side' => 'BUY', 'input_mode' => 'PKR', 'amount' => 25000001])->assertCreated();
    expect($r->json('total_paisa'))->toBe(24996857)->toBeLessThanOrEqual(25000000);
});

test('demo balance adjustments are absolute and keep the ledger balanced', function () {
    $after = app(DemoService::class)->adjustBalances(['customer_cash_paisa' => 500000, 'customer_gold_mg' => 100, 'platform_gold_mg' => 500]);
    expect($after)->toBe(['customer_cash_paisa' => 500000, 'customer_gold_mg' => 100, 'platform_cash_paisa' => 500000000, 'platform_gold_mg' => 500]);
    expect(app(LedgerService::class)->integrity()['ok'])->toBeTrue();
    expect(LedgerEntry::where('kind', 'ADJUSTMENT')->count())->toBe(6);

    // Setting an account to its current value posts nothing.
    app(DemoService::class)->adjustBalances(['customer_cash_paisa' => 500000]);
    expect(LedgerEntry::where('kind', 'ADJUSTMENT')->count())->toBe(6);
});

test('demo balance adjustments reject unknown keys and negative targets', function () {
    expect(fn () => app(DemoService::class)->adjustBalances(['platform_cash_paisa' => 1]))->toThrow(InvalidArgumentException::class);
    expect(fn () => app(DemoService::class)->adjustBalances(['customer_gold_mg' => -1]))->toThrow(InvalidArgumentException::class);
});

test('guardrail binds when raised', function () {
    fakeBoth();
    app(DemoSettings::class)->set(['guardrail_paisa_per_gram' => 5000000]);
    $this->postJson('/api/quotes', ['side' => 'BUY', 'input_mode' => 'GOLD', 'amount' => 1000])
        ->assertCreated()
        ->assertJsonPath('unit_price_paisa_per_gram', 5000000)
        ->assertJsonPath('guardrail_paisa_per_gram', 5000000)
        ->assertJsonPath('guardrail_applied', true)
        ->assertJsonPath('total_paisa', 5000000);
    $this->postJson('/api/quotes', ['side' => 'SELL', 'input_mode' => 'GOLD', 'amount' => 1000])
        ->assertCreated()
        ->assertJsonPath('unit_price_paisa_per_gram', 3559961)
        ->assertJsonPath('guardrail_applied', false);
});

test('validation errors use the envelope', function () {
    fakeBoth();
    $this->postJson('/api/quotes', ['side' => 'HOLD'])
        ->assertStatus(422)
        ->assertJsonPath('error.code', 'VALIDATION')
        ->assertJsonStructure(['error' => ['details' => ['side', 'input_mode', 'amount']]]);
    $this->postJson('/api/quotes', ['side' => 'BUY', 'input_mode' => 'PKR', 'amount' => 12.5])->assertStatus(422)->assertJsonPath('error.code', 'VALIDATION');
    $this->postJson('/api/quotes', ['side' => 'BUY', 'input_mode' => 'PKR', 'amount' => 0])->assertStatus(422)->assertJsonPath('error.code', 'VALIDATION');
    $this->postJson('/api/quotes', ['side' => 'BUY', 'input_mode' => 'PKR', 'amount' => 100])
        ->assertStatus(422)
        ->assertJsonPath('error.code', 'VALIDATION')
        ->assertJsonPath('error.message', 'Minimum trade is 0.010 g');
    expect(Quote::count())->toBe(0);
});

test('reading an expired quote flips it to EXPIRED', function () {
    fakeBoth();
    $id = $this->postJson('/api/quotes', ['side' => 'BUY', 'input_mode' => 'GOLD', 'amount' => 1000])->json('id');
    $this->travel(74)->seconds();
    $this->getJson("/api/quotes/$id")->assertOk()->assertJsonPath('status', 'ACTIVE')->assertJsonPath('seconds_remaining', 1);
    $this->travel(2)->seconds();
    $this->getJson("/api/quotes/$id")->assertOk()->assertJsonPath('status', 'EXPIRED')->assertJsonPath('seconds_remaining', 0);
    expect(Quote::find($id)->status)->toBe('EXPIRED');
});

test('unknown quote → 404 NOT_FOUND', function () {
    $this->getJson('/api/quotes/00000000-0000-0000-0000-000000000000')->assertNotFound()->assertJsonPath('error.code', 'NOT_FOUND');
});
