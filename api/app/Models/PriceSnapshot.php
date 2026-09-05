<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

class PriceSnapshot extends Model
{
    public $timestamps = false;

    protected $guarded = [];

    protected $dateFormat = 'Y-m-d H:i:s.v';

    protected function casts(): array
    {
        return [
            'fetched_at' => 'datetime',
            'market_paisa_per_gram' => 'integer',
            'divergence_bps' => 'integer',
            'primary_ok' => 'boolean',
            'primary_paisa_per_gram' => 'integer',
            'primary_meta' => 'array',
            'fallback_ok' => 'boolean',
            'fallback_paisa_per_gram' => 'integer',
            'fallback_meta' => 'array',
        ];
    }

    /** Whole seconds since this snapshot was fetched, never negative. */
    public function ageSeconds(Carbon $now): int
    {
        return max(0, $now->getTimestamp() - $this->fetched_at->getTimestamp());
    }
}
