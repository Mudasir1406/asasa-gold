<?php

use App\Domain\Quotes\QuoteMath;
use App\Exceptions\ApiException;

// Customer prices derived from market 3955512 paisa/g (the fakeBoth() default).
const BUY = 4351063;
const SELL = 3559961;

test('BUY by PKR: floor grams, cost ≤ input', function () {
    $r = QuoteMath::compute('BUY', 'PKR', 10000000, BUY, SELL);          // PKR 100,000
    expect($r['gold_mg'])->toBe(2298)
        ->and($r['total_paisa'])->toBe(9998743)
        ->and($r['total_paisa'])->toBeLessThanOrEqual(10000000)
        ->and($r['unit_price'])->toBe(BUY);
});

test('BUY by gold: ceil cost', fn () => expect(QuoteMath::compute('BUY', 'GOLD', 1000, BUY, SELL))->toBe(['gold_mg' => 1000, 'total_paisa' => 4351063, 'unit_price' => BUY]));

test('SELL by gold: floor proceeds', fn () => expect(QuoteMath::compute('SELL', 'GOLD', 2500, BUY, SELL)['total_paisa'])->toBe(8899902));

test('SELL by PKR: ceil grams, proceeds ≥ input', function () {
    $r = QuoteMath::compute('SELL', 'PKR', 5000000, BUY, SELL);
    expect($r['gold_mg'])->toBe(1405)
        ->and($r['total_paisa'])->toBeGreaterThanOrEqual(5000000)
        ->and($r['unit_price'])->toBe(SELL);
});

test('property: BUY-PKR never overcharges, SELL-PKR never underpays, monotonic', function () {
    $lastBuyMg = 0;
    $lastSellMg = 0;
    for ($a = 100000; $a <= 20000000; $a += 777777) {   // from PKR 1,000 — smaller BUY-PKR amounts fall under MIN_TRADE_MG
        $b = QuoteMath::compute('BUY', 'PKR', $a, BUY, SELL);
        expect($b['total_paisa'])->toBeLessThanOrEqual($a)->and($b['gold_mg'])->toBeGreaterThanOrEqual($lastBuyMg);
        $lastBuyMg = $b['gold_mg'];

        $s = QuoteMath::compute('SELL', 'PKR', $a, BUY, SELL);
        expect($s['total_paisa'])->toBeGreaterThanOrEqual($a)->and($s['gold_mg'])->toBeGreaterThanOrEqual($lastSellMg);
        $lastSellMg = $s['gold_mg'];
    }
});

test('exactly the minimum trade is accepted', fn () => expect(QuoteMath::compute('SELL', 'GOLD', 10, BUY, SELL)['gold_mg'])->toBe(10));

test('below minimum trade rejected', fn () => QuoteMath::compute('BUY', 'PKR', 100, BUY, SELL))->throws(ApiException::class, 'Minimum trade is 0.010 g');

test('non-positive rejected', fn () => QuoteMath::compute('BUY', 'GOLD', 0, BUY, SELL))->throws(ApiException::class, 'Amount must be greater than zero');

test('spread_bps follows the side', function () {
    expect(QuoteMath::spreadBps('BUY'))->toBe(11000)->and(QuoteMath::spreadBps('SELL'))->toBe(9000);
});
