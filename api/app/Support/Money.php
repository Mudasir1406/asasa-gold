<?php

namespace App\Support;

use InvalidArgumentException;

/**
 * Integer arithmetic for money (paisa) and metal (milligrams).
 *
 * floatToPaisa() is the single float→integer boundary in the codebase; every
 * other helper stays in 64-bit integer space.
 */
final class Money
{
    public static function mulDivFloor(int $a, int $b, int $div): int
    {
        self::guard($div);

        $product = $a * $b;

        return intdiv($product, $div) - ($product % $div < 0 ? 1 : 0);
    }

    public static function mulDivCeil(int $a, int $b, int $div): int
    {
        self::guard($div);

        $product = $a * $b;
        $quotient = intdiv($product, $div);

        return $product % $div > 0 ? $quotient + 1 : $quotient;
    }

    /** Round half up. */
    public static function mulDivRound(int $a, int $b, int $div): int
    {
        self::guard($div);

        return intdiv($a * $b * 2 + $div, $div * 2);
    }

    /** Scale an amount by basis points (10000 = ×1.00), rounding half up. */
    public static function applyBps(int $amount, int $bps): int
    {
        return self::mulDivRound($amount, $bps, 10000);
    }

    public static function floatToPaisa(float $pkr): int
    {
        return (int) round($pkr * 100, 0, PHP_ROUND_HALF_UP);
    }

    /** 4349064 → "PKR 43,490.64". */
    public static function fmtPkr(int $paisa): string
    {
        return self::fmt($paisa, 100, 'PKR %s.%02d');
    }

    /** 2500 → "2.500 g". */
    public static function fmtGold(int $mg): string
    {
        return self::fmt($mg, 1000, '%s.%03d g');
    }

    private static function fmt(int $amount, int $scale, string $format): string
    {
        $magnitude = abs($amount);

        return ($amount < 0 ? '-' : '').sprintf($format, number_format(intdiv($magnitude, $scale)), $magnitude % $scale);
    }

    private static function guard(int $div): void
    {
        if ($div <= 0) {
            throw new InvalidArgumentException('divisor must be positive');
        }
    }
}
