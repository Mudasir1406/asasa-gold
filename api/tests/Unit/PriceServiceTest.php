<?php

use App\Domain\Demo\DemoSettings;
use App\Domain\Pricing\PriceService;
use App\Models\PriceSnapshot;
use Illuminate\Support\Facades\Http;

test('both ok & agree → LIVE, CROSS_CHECKED, primary selected', function () {
    fakeBoth();
    $v = app(PriceService::class)->current();
    expect($v['status'])->toBe('LIVE')
        ->and($v['source']['verification'])->toBe('CROSS_CHECKED')
        ->and($v['source']['selected'])->toBe('pakgold')
        ->and($v['market_paisa_per_gram'])->toBe(3955512)
        ->and($v['buy_paisa_per_gram'])->toBe(4351063)
        ->and($v['sell_paisa_per_gram'])->toBe(3559961)
        ->and($v['trading']['enabled'])->toBeTrue()
        ->and($v['trading']['code'])->toBeNull()
        ->and($v['source']['divergence_bps'])->toBe(5)   // 4.596 bps, rounded up: we err toward distrust
        ->and($v['source']['primary']['name'])->toBe('PakGold')
        ->and($v['source']['fallback']['name'])->toBe('GoldPrice.org')
        ->and($v['source']['fallback']['paisa_per_gram'])->toBe(3953695)
        ->and($v['snapshot_id'])->toBe(PriceSnapshot::first()->id)
        ->and($v['guardrail_paisa_per_gram'])->toBe(3500000)
        ->and($v['guardrail_applied'])->toBeFalse()
        ->and($v['refresh_interval_seconds'])->toBe(300)
        ->and($v['max_age_seconds'])->toBe(600)
        ->and($v['server_now'])->toMatch('/\.\d{3}Z$/');
});

test('disagree > 3% → PAUSED DISPUTED', function () {
    fakeBoth(gpOz: 1300000.0);
    $v = app(PriceService::class)->current();
    expect($v['status'])->toBe('PAUSED')
        ->and($v['trading']['code'])->toBe('PRICE_DISPUTED')
        ->and($v['trading']['enabled'])->toBeFalse()
        ->and($v['market_paisa_per_gram'])->toBeNull()
        ->and($v['buy_paisa_per_gram'])->toBeNull()
        ->and($v['source']['verification'])->toBe('DISPUTED')
        ->and($v['source']['selected'])->toBeNull()
        ->and($v['trading']['reason'])->toStartWith('Sources disagree by');
});

test('primary down → DEGRADED on goldprice', function () {
    fakeBoth(pOk: false);
    $v = app(PriceService::class)->current();
    expect($v['status'])->toBe('DEGRADED')
        ->and($v['source']['selected'])->toBe('goldprice')
        ->and($v['source']['verification'])->toBe('SINGLE_SOURCE')
        ->and($v['trading']['enabled'])->toBeTrue()
        ->and($v['market_paisa_per_gram'])->toBe(3953695)
        ->and($v['source']['primary']['ok'])->toBeFalse()
        ->and($v['source']['primary']['error'])->not->toBeNull()
        ->and($v['trading']['reason'])->toBe('Primary source down — using GoldPrice.org');
});

test('fallback down → DEGRADED on pakgold', function () {
    fakeBoth(fOk: false);
    $v = app(PriceService::class)->current();
    expect($v['status'])->toBe('DEGRADED')
        ->and($v['source']['selected'])->toBe('pakgold')
        ->and($v['trading']['reason'])->toBe('Cross-check unavailable — using PakGold only');
});

test('both down → PAUSED UNAVAILABLE, last known shown', function () {
    fakeBoth();
    app(PriceService::class)->current();
    fakeBoth(pOk: false, fOk: false);
    $v = app(PriceService::class)->refresh(force: true) ? app(PriceService::class)->current() : null;
    expect($v['status'])->toBe('PAUSED')
        ->and($v['trading']['code'])->toBe('PRICE_UNAVAILABLE')
        ->and($v['market_paisa_per_gram'])->toBeNull()
        ->and($v['last_known_market_paisa_per_gram'])->toBe(3955512)
        ->and($v['last_known_at'])->not->toBeNull()
        ->and(PriceSnapshot::count())->toBe(2);
});

test('no snapshot yet → PAUSED UNAVAILABLE without touching the network', function () {
    Http::fake();
    $v = app(PriceService::class)->view(null);
    expect($v['status'])->toBe('PAUSED')
        ->and($v['trading']['code'])->toBe('PRICE_UNAVAILABLE')
        ->and($v['snapshot_id'])->toBeNull()
        ->and($v['last_known_market_paisa_per_gram'])->toBeNull();
    Http::assertNothingSent();
});

test('no refetch within 5 minutes; refetch after', function () {
    fakeBoth();
    $s = app(PriceService::class);
    $s->current();
    $s->current();
    $this->travel(299)->seconds();
    $s->current();
    Http::assertSentCount(3);                       // one refresh = 3 requests
    $this->travel(2)->seconds();
    $s->current();
    Http::assertSentCount(6);
});

test('refresh without force honours the cache; demo refresh bypasses it', function () {
    fakeBoth();
    $s = app(PriceService::class);
    $first = $s->refresh();
    expect($s->refresh()->id)->toBe($first->id);
    Http::assertSentCount(3);
    expect($s->refresh(force: true)->id)->not->toBe($first->id);
    Http::assertSentCount(6);
});

test('force_stale → PAUSED PRICE_STALE', function () {
    fakeBoth();
    app(PriceService::class)->current();
    app(DemoSettings::class)->set(['force_stale' => true]);
    $v = app(PriceService::class)->current();
    expect($v['trading']['code'])->toBe('PRICE_STALE')
        ->and($v['status'])->toBe('PAUSED')
        ->and($v['trading']['reason'])->toBe('Price data is stale (forced for demo)')
        ->and($v['last_known_market_paisa_per_gram'])->toBe(3955512);
});

test('old snapshot beyond max age → PAUSED PRICE_STALE even without refetch', function () {
    fakeBoth();
    app(PriceService::class)->current();
    Http::fake(fn () => throw new RuntimeException('network'));    // refresh attempt fails → UNAVAILABLE row
    $this->travel(601)->seconds();
    expect(app(PriceService::class)->current()['status'])->toBe('PAUSED');
});

test('a snapshot older than max age is PRICE_STALE when no refresh can happen', function () {
    fakeBoth();
    app(PriceService::class)->current();
    $this->travel(601)->seconds();
    $v = app(PriceService::class)->view(PriceSnapshot::first());
    expect($v['trading']['code'])->toBe('PRICE_STALE')
        ->and($v['trading']['reason'])->toBe('Price is 10 min old')
        ->and($v['age_seconds'])->toBeGreaterThanOrEqual(601)
        ->and($v['next_refresh_in_seconds'])->toBe(0);
});

test('demo outage flags simulate source failures', function () {
    fakeBoth();
    app(DemoSettings::class)->set(['fail_primary' => true]);
    $v = app(PriceService::class)->current();
    expect($v['source']['selected'])->toBe('goldprice')
        ->and($v['source']['primary']['error'])->toBe('Simulated outage (reviewer tools)');
    Http::assertSentCount(1);
});

test('guardrail from demo settings shapes the buy price', function () {
    fakeBoth();
    app(DemoSettings::class)->set(['guardrail_paisa_per_gram' => 5000000]);
    $v = app(PriceService::class)->current();
    expect($v['buy_paisa_per_gram'])->toBe(5000000)
        ->and($v['guardrail_applied'])->toBeTrue()
        ->and($v['sell_paisa_per_gram'])->toBe(3559961);
});

test('demo settings default and merge', function () {
    $d = app(DemoSettings::class);
    expect($d->get())->toBe(['fail_primary' => false, 'fail_fallback' => false, 'force_stale' => false, 'guardrail_paisa_per_gram' => 3500000]);
    expect($d->set(['fail_fallback' => true])['fail_fallback'])->toBeTrue();
    expect($d->get()['fail_primary'])->toBeFalse();
    $d->set(['unknown' => 1]);
})->throws(InvalidArgumentException::class);

test('a gap just over 3 % is disputed, not rounded down into tolerance', function () {
    // 3.004 % apart: floor() would give 300 bps and wrongly pass the <= 300 check.
    fakeBoth(gpOz: 1229736.4553, xau: 4435.700195, fx: 277.363614);
    $base = app(PriceService::class)->current()['source']['fallback']['paisa_per_gram'];

    // Re-fake with the fallback moved just past the 3 % tolerance.
    $overOz = 1229736.4553 * (1 / 1.03004);
    fakeBoth(gpOz: $overOz);
    $v = app(PriceService::class)->refresh(force: true) ? app(PriceService::class)->view(app(PriceService::class)->latest()) : null;

    expect($v['source']['divergence_bps'])->toBeGreaterThan(300)
        ->and($v['source']['verification'])->toBe('DISPUTED')
        ->and($v['trading']['code'])->toBe('PRICE_DISPUTED')
        ->and($base)->toBe(3953695);
});
