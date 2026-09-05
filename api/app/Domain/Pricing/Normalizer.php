<?php

namespace App\Domain\Pricing;

use App\Support\Money;
use InvalidArgumentException;

/** Troy ounce → gram and the single float→paisa conversion for source prices. */
final class Normalizer
{
    public static function ouncePkrToPaisaPerGram(float $pkrPerOz): int
    {
        if ($pkrPerOz <= 0) {
            throw new InvalidArgumentException('price must be positive');
        }

        return Money::floatToPaisa($pkrPerOz / config('gold.troy_ounce_grams'));
    }

    public static function usdOunceToPaisaPerGram(float $usdPerOz, float $usdToPkr): int
    {
        if ($usdPerOz <= 0 || $usdToPkr <= 0) {
            throw new InvalidArgumentException('inputs must be positive');
        }

        return Money::floatToPaisa($usdPerOz * $usdToPkr / config('gold.troy_ounce_grams'));
    }
}
