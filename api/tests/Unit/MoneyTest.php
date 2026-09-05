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

test('fmtPkr renders paisa with two decimals and thousands separators', function () {
    expect(Money::fmtPkr(4349064))->toBe('PKR 43,490.64');
    expect(Money::fmtPkr(25000000))->toBe('PKR 250,000.00');
    expect(Money::fmtPkr(500000))->toBe('PKR 5,000.00');
    expect(Money::fmtPkr(5))->toBe('PKR 0.05');
    expect(Money::fmtPkr(0))->toBe('PKR 0.00');
    expect(Money::fmtPkr(-4349064))->toBe('-PKR 43,490.64');
});

test('fmtGold renders milligrams with three decimals', function () {
    expect(Money::fmtGold(2500))->toBe('2.500 g');
    expect(Money::fmtGold(7))->toBe('0.007 g');
    expect(Money::fmtGold(52500))->toBe('52.500 g');
    expect(Money::fmtGold(1000000))->toBe('1,000.000 g');
    expect(Money::fmtGold(-10))->toBe('-0.010 g');
});
