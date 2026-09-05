<?php

namespace App\Domain\Quotes;

use App\Exceptions\ApiException;
use App\Support\Money;

/**
 * The four quote input cases (spec §3). Rounding always favours the platform:
 * the customer's grams are floored on BUY and ceiled on SELL, then the total is
 * recomputed from the rounded grams so both stored legs agree exactly.
 */
final class QuoteMath
{
    /**
     * @return array{gold_mg: int, total_paisa: int, unit_price: int}
     */
    public static function compute(string $side, string $inputMode, int $amount, int $buyPaisa, int $sellPaisa): array
    {
        if ($amount <= 0) {
            throw new ApiException('VALIDATION', 'Amount must be greater than zero', 422);
        }

        $unit = $side === 'BUY' ? $buyPaisa : $sellPaisa;

        if ($side === 'BUY') {
            $mg = $inputMode === 'PKR' ? Money::mulDivFloor($amount, 1000, $unit) : $amount;
            $total = Money::mulDivCeil($mg, $unit, 1000);
        } else {
            $mg = $inputMode === 'PKR' ? Money::mulDivCeil($amount, 1000, $unit) : $amount;
            $total = Money::mulDivFloor($mg, $unit, 1000);
        }

        $minimum = config('gold.min_trade_mg');
        if ($mg < $minimum) {
            throw new ApiException('VALIDATION', 'Minimum trade is '.Money::fmtGold($minimum), 422, ['min_trade_mg' => $minimum]);
        }

        return ['gold_mg' => $mg, 'total_paisa' => $total, 'unit_price' => $unit];
    }

    /** The spread applied to the market price for a side, in basis points. */
    public static function spreadBps(string $side): int
    {
        return config($side === 'BUY' ? 'gold.buy_spread_bps' : 'gold.sell_spread_bps');
    }
}
