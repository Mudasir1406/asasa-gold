<?php

use App\Domain\Demo\DemoService;
use App\Domain\Ledger\LedgerService;
use App\Domain\Pricing\PriceService;
use App\Models\LedgerEntry;
use App\Models\Quote;
use App\Models\Trade;

beforeEach(function () {
    $this->seed();
    fakeBoth();
    $this->q = fn ($side = 'BUY', $mode = 'GOLD', $amt = 1000) => $this->postJson('/api/quotes', ['side' => $side, 'input_mode' => $mode, 'amount' => $amt])->assertCreated()->json('id');
});

test('confirm settles once, moves balances by stored legs, ledger balanced', function () {
    $id = ($this->q)();
    $r = $this->postJson("/api/quotes/$id/confirm")->assertOk();
    $r->assertJsonPath('idempotent_replay', false)
        ->assertJsonPath('trade.quote_id', $id)
        ->assertJsonPath('trade.side', 'BUY')
        ->assertJsonPath('trade.gold_mg', 1000)
        ->assertJsonPath('trade.total_paisa', 4351063)
        ->assertJsonPath('trade.unit_price_paisa_per_gram', 4351063)
        ->assertJsonPath('trade.market_paisa_per_gram', 3955512)
        ->assertJsonPath('trade.spread_bps', 11000)
        ->assertJsonPath('trade.guardrail_applied', false)
        ->assertJsonPath('trade.guardrail_paisa_per_gram', 3500000)
        ->assertJsonPath('trade.source', 'pakgold')
        ->assertJsonPath('balances_before.customer_gold_mg', 2500)
        ->assertJsonPath('balances_before.customer_cash_paisa', 25000000)
        ->assertJsonPath('balances_after.customer_gold_mg', 3500)
        ->assertJsonPath('balances_after.customer_cash_paisa', 25000000 - 4351063)
        ->assertJsonPath('balances_after.platform_cash_paisa', 500000000 + 4351063)
        ->assertJsonPath('balances_after.platform_gold_mg', 49000)
        ->assertJsonStructure(['trade' => ['id', 'price_fetched_at', 'settled_at'], 'balances_before', 'balances_after', 'idempotent_replay']);
    expect($r->json('trade.settled_at'))->toMatch('/\.\d{3}Z$/');
    expect(LedgerEntry::where('kind', 'TRADE')->count())->toBe(4);
    expect(LedgerEntry::where('trade_id', $r->json('trade.id'))->count())->toBe(4);
    expect(app(LedgerService::class)->integrity()['ok'])->toBeTrue();
    expect(app(LedgerService::class)->balances())->toBe($r->json('balances_after'));
    $this->getJson("/api/quotes/$id")->assertJsonPath('status', 'SETTLED')->assertJsonPath('seconds_remaining', 0);
    expect(Quote::find($id)->settled_at)->not->toBeNull();
});

test('confirm twice → same trade, replay flag, no new entries', function () {
    $id = ($this->q)();
    $a = $this->postJson("/api/quotes/$id/confirm")->json('trade.id');
    $b = $this->postJson("/api/quotes/$id/confirm")->assertOk()->assertJsonPath('idempotent_replay', true)->assertJsonPath('balances_after.customer_gold_mg', 3500)->json('trade.id');
    expect($a)->toBe($b)->and(Trade::count())->toBe(1)->and(LedgerEntry::where('kind', 'TRADE')->count())->toBe(4);
});

test('second guard: the unique quote_id constraint still yields the existing receipt', function () {
    $id = ($this->q)();
    $quote = Quote::find($id);
    // Simulate a settlement that beat the row lock without flipping the quote status.
    $ghost = Trade::create([
        'quote_id' => $id, 'side' => 'BUY', 'gold_mg' => 1000, 'total_paisa' => 4351063,
        'unit_price_paisa_per_gram' => 4351063, 'market_paisa_per_gram' => 3955512, 'spread_bps' => 11000,
        'guardrail_applied' => false, 'guardrail_paisa_per_gram' => 3500000, 'source' => 'pakgold',
        'price_fetched_at' => $quote->snapshot->fetched_at, 'balances_before' => [], 'balances_after' => [], 'created_at' => now(),
    ]);
    $this->postJson("/api/quotes/$id/confirm")->assertOk()->assertJsonPath('idempotent_replay', true)->assertJsonPath('trade.id', $ghost->id);
    expect(Trade::count())->toBe(1)->and(LedgerEntry::where('kind', 'TRADE')->count())->toBe(0);
});

test('expired → 409 QUOTE_EXPIRED, nothing moves', function () {
    $id = ($this->q)();
    $this->travel(75)->seconds();
    $this->postJson("/api/quotes/$id/confirm")
        ->assertStatus(409)
        ->assertJsonPath('error.code', 'QUOTE_EXPIRED')
        ->assertJsonPath('error.details.quote.id', $id)
        ->assertJsonPath('error.details.quote.side', 'BUY')
        ->assertJsonPath('error.details.quote.input_mode', 'GOLD')
        ->assertJsonPath('error.details.quote.input_amount', 1000)
        ->assertJsonPath('error.details.quote.status', 'EXPIRED');
    expect(Trade::count())->toBe(0)
        ->and(app(LedgerService::class)->balances()['customer_gold_mg'])->toBe(2500)
        ->and(Quote::find($id)->status)->toBe('EXPIRED');
});

test('balances re-checked at confirm', function () {
    $id = ($this->q)('BUY', 'PKR', 10000000);
    app(DemoService::class)->adjustBalances(['customer_cash_paisa' => 500000]);
    $this->postJson("/api/quotes/$id/confirm")
        ->assertStatus(422)
        ->assertJsonPath('error.code', 'INSUFFICIENT_CASH')
        ->assertJsonPath('error.details.required', 9998743)
        ->assertJsonPath('error.details.available', 500000);
    $this->getJson("/api/quotes/$id")->assertJsonPath('status', 'ACTIVE');
    expect(Trade::count())->toBe(0);
});

test('inventory and holdings are re-checked at confirm too', function () {
    $buy = ($this->q)('BUY', 'GOLD', 1000);
    app(DemoService::class)->adjustBalances(['platform_gold_mg' => 500]);
    $this->postJson("/api/quotes/$buy/confirm")->assertStatus(422)->assertJsonPath('error.code', 'INSUFFICIENT_INVENTORY');

    $sell = ($this->q)('SELL', 'GOLD', 500);
    app(DemoService::class)->adjustBalances(['customer_gold_mg' => 100]);
    $this->postJson("/api/quotes/$sell/confirm")->assertStatus(422)->assertJsonPath('error.code', 'INSUFFICIENT_GOLD');
    expect(Trade::count())->toBe(0);
});

test('active quote is honoured even if feed pauses after issue', function () {
    $id = ($this->q)();
    fakeBoth(pOk: false, fOk: false);
    app(PriceService::class)->refresh(force: true);
    expect($this->getJson('/api/price')->assertOk()->json('status'))->toBe('PAUSED');
    $this->postJson("/api/quotes/$id/confirm")->assertOk()->assertJsonPath('trade.source', 'pakgold');
});

test('a quote issued while DEGRADED records the source that backed it', function () {
    fakeBoth(pOk: false);
    app(PriceService::class)->refresh(force: true);
    $id = ($this->q)('SELL', 'GOLD', 100);
    $this->postJson("/api/quotes/$id/confirm")->assertOk()->assertJsonPath('trade.source', 'goldprice')->assertJsonPath('trade.market_paisa_per_gram', 3953695);
});

test('sell path', function () {
    $id = ($this->q)('SELL', 'GOLD', 500);
    $this->postJson("/api/quotes/$id/confirm")->assertOk()
        ->assertJsonPath('trade.side', 'SELL')
        ->assertJsonPath('trade.spread_bps', 9000)
        ->assertJsonPath('trade.total_paisa', 1779980)
        ->assertJsonPath('balances_after.customer_gold_mg', 2000)
        ->assertJsonPath('balances_after.platform_gold_mg', 50500)
        ->assertJsonPath('balances_after.customer_cash_paisa', 25000000 + 1779980)
        ->assertJsonPath('balances_after.platform_cash_paisa', 500000000 - 1779980);
    expect(app(LedgerService::class)->integrity()['ok'])->toBeTrue();
});

test('unknown quote → 404', fn () => $this->postJson('/api/quotes/00000000-0000-0000-0000-000000000000/confirm')->assertNotFound()->assertJsonPath('error.code', 'NOT_FOUND'));

test('trades list newest first without balances; trade show is the full receipt', function () {
    $first = $this->postJson('/api/quotes/'.($this->q)().'/confirm')->json('trade.id');
    $this->travel(1)->seconds();
    $second = $this->postJson('/api/quotes/'.($this->q)('SELL', 'GOLD', 200).'/confirm')->json('trade.id');

    $list = $this->getJson('/api/trades')->assertOk()->json();
    expect($list)->toHaveCount(2)
        ->and($list[0]['id'])->toBe($second)
        ->and($list[1]['id'])->toBe($first)
        ->and($list[0])->toHaveKeys(['id', 'side', 'gold_mg', 'total_paisa', 'unit_price_paisa_per_gram', 'market_paisa_per_gram', 'spread_bps', 'guardrail_applied', 'guardrail_paisa_per_gram', 'source', 'price_fetched_at', 'quote_id', 'settled_at'])
        ->and($list[0])->not->toHaveKey('balances_before');

    $this->getJson("/api/trades/$first")->assertOk()
        ->assertJsonPath('trade.id', $first)
        ->assertJsonPath('idempotent_replay', false)
        ->assertJsonPath('balances_before.customer_gold_mg', 2500)
        ->assertJsonPath('balances_after.customer_gold_mg', 3500);
    $this->getJson('/api/trades/00000000-0000-0000-0000-000000000000')->assertNotFound()->assertJsonPath('error.code', 'NOT_FOUND');
});
