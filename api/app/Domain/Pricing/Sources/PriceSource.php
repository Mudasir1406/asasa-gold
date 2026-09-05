<?php

namespace App\Domain\Pricing\Sources;

interface PriceSource
{
    /** Stable identifier stored on snapshots: pakgold | goldprice. */
    public function id(): string;

    /** Display name: PakGold | GoldPrice.org. */
    public function name(): string;

    /** Never throws — every failure is returned as SourceResult::fail(). */
    public function fetch(): SourceResult;
}
