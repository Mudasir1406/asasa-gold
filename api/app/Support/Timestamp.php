<?php

namespace App\Support;

use Carbon\CarbonInterface;

/** API timestamps: ISO-8601, UTC, millisecond precision (2026-09-05T10:11:12.345Z). */
final class Timestamp
{
    public static function iso(CarbonInterface $time): string
    {
        return $time->copy()->utc()->format('Y-m-d\TH:i:s.v\Z');
    }
}
