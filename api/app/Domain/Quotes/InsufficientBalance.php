<?php

namespace App\Domain\Quotes;

use App\Exceptions\ApiException;
use App\Support\Money;

/**
 * One of the three balances the brief gates on is short. The envelope names
 * what is short, with required/available in the same integer unit.
 */
final class InsufficientBalance extends ApiException
{
    private function __construct(string $code, string $message, string $unit, int $required, int $available)
    {
        parent::__construct($code, $message, 422, ['required' => $required, 'available' => $available, 'unit' => $unit]);
    }

    public static function cash(int $required, int $available): self
    {
        return new self(
            'INSUFFICIENT_CASH',
            sprintf('You need %s but your wallet has %s', Money::fmtPkr($required), Money::fmtPkr($available)),
            'paisa',
            $required,
            $available,
        );
    }

    public static function gold(int $required, int $available): self
    {
        return new self(
            'INSUFFICIENT_GOLD',
            sprintf('You need %s but you hold %s', Money::fmtGold($required), Money::fmtGold($available)),
            'mg',
            $required,
            $available,
        );
    }

    public static function inventory(int $required, int $available): self
    {
        return new self(
            'INSUFFICIENT_INVENTORY',
            sprintf('You asked for %s but the platform only has %s in inventory', Money::fmtGold($required), Money::fmtGold($available)),
            'mg',
            $required,
            $available,
        );
    }
}
