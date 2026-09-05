<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Cached balance per ledger account; the ledger entries are the truth. */
class Account extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];

    protected function casts(): array
    {
        return ['balance' => 'integer'];
    }
}
