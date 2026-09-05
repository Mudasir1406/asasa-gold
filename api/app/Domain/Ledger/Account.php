<?php

namespace App\Domain\Ledger;

use InvalidArgumentException;

/** The six ledger accounts, their assets, and the seed balances (paisa / mg). */
final class Account
{
    public const CUSTOMER_CASH = 'customer_cash';

    public const CUSTOMER_GOLD = 'customer_gold';

    public const PLATFORM_CASH = 'platform_cash';

    public const PLATFORM_GOLD = 'platform_gold';

    public const EXTERNAL_CASH = 'external_cash';

    public const EXTERNAL_GOLD = 'external_gold';

    public const ASSET_PKR = 'PKR';

    public const ASSET_GOLD = 'GOLD';

    /** The accounts a trade posts to; trades never touch external_*. */
    public const TRADE_ACCOUNTS = [
        self::CUSTOMER_CASH,
        self::CUSTOMER_GOLD,
        self::PLATFORM_CASH,
        self::PLATFORM_GOLD,
    ];

    public const ALL = [
        ...self::TRADE_ACCOUNTS,
        self::EXTERNAL_CASH,
        self::EXTERNAL_GOLD,
    ];

    /** Opening balances; external_* absorb the negative offsets. */
    public const SEED = [
        self::CUSTOMER_CASH => 25000000,
        self::CUSTOMER_GOLD => 2500,
        self::PLATFORM_CASH => 500000000,
        self::PLATFORM_GOLD => 50000,
    ];

    public static function assetOf(string $id): string
    {
        if (! in_array($id, self::ALL, true)) {
            throw new InvalidArgumentException("unknown account: {$id}");
        }

        return str_ends_with($id, '_cash') ? self::ASSET_PKR : self::ASSET_GOLD;
    }
}
