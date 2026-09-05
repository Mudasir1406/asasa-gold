<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Quote extends Model
{
    use HasUuids;

    public $timestamps = false;

    /** Millisecond precision, matching the timestamp(…, 3) columns and the API's ISO output. */
    protected $dateFormat = 'Y-m-d H:i:s.v';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'input_amount' => 'integer',
            'market_paisa_per_gram' => 'integer',
            'unit_price_paisa_per_gram' => 'integer',
            'guardrail_paisa_per_gram' => 'integer',
            'guardrail_applied' => 'boolean',
            'gold_mg' => 'integer',
            'total_paisa' => 'integer',
            'price_snapshot_id' => 'integer',
            'created_at' => 'datetime',
            'expires_at' => 'datetime',
            'settled_at' => 'datetime',
        ];
    }

    /** The price snapshot this quote's market price was verified against. */
    public function snapshot(): BelongsTo
    {
        return $this->belongsTo(PriceSnapshot::class, 'price_snapshot_id');
    }
}
