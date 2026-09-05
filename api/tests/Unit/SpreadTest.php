<?php

use App\Domain\Pricing\Spread;

test('spread without guardrail', function () {
    $s = Spread::compute(3953695, 3500000);
    expect($s)->toBe(['buy' => 4349065, 'sell' => 3558326, 'guardrail_applied' => false, 'buy_before_guardrail' => 4349065]);
});

test('guardrail binds on buy only', function () {
    $s = Spread::compute(3953695, 5000000);
    expect($s['buy'])->toBe(5000000)
        ->and($s['guardrail_applied'])->toBeTrue()
        ->and($s['sell'])->toBe(3558326)
        ->and($s['buy_before_guardrail'])->toBe(4349065);
});

test('guardrail equal to buy is not "applied"', fn () => expect(Spread::compute(3953695, 4349065)['guardrail_applied'])->toBeFalse());
