<?php

use App\Domain\Pricing\PriceService;
use Illuminate\Support\Facades\Http;

beforeEach(function () {
    $this->seed();
    fakeBoth();
});

test('state carries the price view, balances, trading, integrity and recent trades', function () {
    $r = $this->getJson('/api/state')->assertOk();

    expect(array_keys($r->json()))->toBe(['price', 'balances', 'trading', 'integrity', 'recent_trades', 'server_now']);
    $r->assertJsonPath('balances', ['customer_cash_paisa' => 25000000, 'customer_gold_mg' => 2500, 'platform_cash_paisa' => 500000000, 'platform_gold_mg' => 50000])
        ->assertJsonPath('price.status', 'LIVE')
        ->assertJsonPath('price.market_paisa_per_gram', 3955512)
        ->assertJsonPath('price.source.primary.name', 'PakGold')
        ->assertJsonPath('price.source.fallback.name', 'GoldPrice.org')
        ->assertJsonPath('price.refresh_interval_seconds', 300)
        ->assertJsonPath('price.max_age_seconds', 600)
        ->assertJsonPath('trading', ['enabled' => true, 'code' => null, 'reason' => null])
        ->assertJsonPath('integrity.ok', true)
        ->assertJsonPath('recent_trades', []);
    expect(array_keys($r->json('integrity')))->toBe(['ok', 'checked_at'])
        ->and($r->json('trading'))->toBe($r->json('price.trading'))
        ->and($r->json('server_now'))->toMatch('/\.\d{3}Z$/');
});

test('recent trades are the newest ten trade objects, without balance snapshots', function () {
    $confirm = function (): string {
        $quote = $this->postJson('/api/quotes', ['side' => 'BUY', 'input_mode' => 'GOLD', 'amount' => 10])->assertCreated()->json('id');

        return $this->postJson("/api/quotes/$quote/confirm")->assertOk()->json('trade.id');
    };

    $ids = [$confirm()];
    $trades = $this->getJson('/api/state')->assertOk()->json('recent_trades');
    expect($trades)->toHaveCount(1)
        ->and($trades[0]['id'])->toBe($ids[0])
        ->and($trades[0])->toHaveKeys(['id', 'side', 'gold_mg', 'total_paisa', 'unit_price_paisa_per_gram', 'market_paisa_per_gram', 'spread_bps', 'guardrail_applied', 'guardrail_paisa_per_gram', 'source', 'price_fetched_at', 'quote_id', 'settled_at'])
        ->and($trades[0])->not->toHaveKey('balances_before');

    for ($i = 0; $i < 10; $i++) {
        $this->travel(1)->seconds();
        $ids[] = $confirm();
    }

    $trades = $this->getJson('/api/state')->assertOk()->json('recent_trades');
    expect($trades)->toHaveCount(10)
        ->and(array_column($trades, 'id'))->toBe(array_reverse(array_slice($ids, 1)));
});

test('state polls inside the refresh window make no outbound requests', function () {
    $this->getJson('/api/state')->assertOk();
    $this->getJson('/api/state')->assertOk();
    $this->getJson('/api/price')->assertOk();
    Http::assertSentCount(3);   // one refresh = gold-api + er-api + goldprice.org
});

test('state reports a paused market with the last known price and untouched balances', function () {
    $this->getJson('/api/state')->assertJsonPath('price.status', 'LIVE');

    fakeBoth(pOk: false, fOk: false);
    app(PriceService::class)->refresh(force: true);

    $this->getJson('/api/state')->assertOk()
        ->assertJsonPath('price.status', 'PAUSED')
        ->assertJsonPath('price.market_paisa_per_gram', null)
        ->assertJsonPath('price.last_known_market_paisa_per_gram', 3955512)
        ->assertJsonPath('trading.enabled', false)
        ->assertJsonPath('trading.code', 'PRICE_UNAVAILABLE')
        ->assertJsonPath('trading.reason', 'Neither price source is responding')
        ->assertJsonPath('balances.customer_gold_mg', 2500);
});

test('GET /api/price is the same PriceView the state embeds', function () {
    $state = $this->getJson('/api/state')->assertOk()->json('price');
    $price = $this->getJson('/api/price')->assertOk()->json();

    expect(array_keys($price))->toBe(array_keys($state))
        ->and($price['snapshot_id'])->toBe($state['snapshot_id'])
        ->and($price['status'])->toBe('LIVE');
});
