<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Trade extends Model
{
    use HasUuids;

    public $timestamps = false;

    /** Millisecond precision, matching the timestamp(…, 3) columns and the API's ISO output. */
    protected $dateFormat = 'Y-m-d H:i:s.v';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'gold_mg' => 'integer',
            'total_paisa' => 'integer',
            'unit_price_paisa_per_gram' => 'integer',
            'market_paisa_per_gram' => 'integer',
            'spread_bps' => 'integer',
            'guardrail_applied' => 'boolean',
            'guardrail_paisa_per_gram' => 'integer',
            'price_fetched_at' => 'datetime',
            'balances_before' => 'array',
            'balances_after' => 'array',
            'created_at' => 'datetime',
        ];
    }

    /** Newest first, with a stable tiebreak for trades settled in the same millisecond. */
    #[Scope]
    protected function newestFirst(Builder $query): void
    {
        $query->orderByDesc('created_at')->orderByDesc('id');
    }
}
