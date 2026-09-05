<?php

namespace App\Domain\Pricing;

use App\Support\Money;

/** Customer buy/sell prices from the market price; the guardrail floors buy only. */
final class Spread
{
    /**
     * @return array{buy: int, sell: int, guardrail_applied: bool, buy_before_guardrail: int}
     */
    public static function compute(int $marketPaisa, int $guardrailPaisa): array
    {
        $buy = Money::applyBps($marketPaisa, config('gold.buy_spread_bps'));
        $sell = Money::applyBps($marketPaisa, config('gold.sell_spread_bps'));

        return [
            'buy' => max($buy, $guardrailPaisa),
            'sell' => $sell,
            'guardrail_applied' => $guardrailPaisa > $buy,
            'buy_before_guardrail' => $buy,
        ];
    }
}
