<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trades', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('quote_id')->unique()->constrained('quotes');
            $table->string('side', 4);
            $table->bigInteger('gold_mg');
            $table->bigInteger('total_paisa');
            $table->bigInteger('unit_price_paisa_per_gram');
            $table->bigInteger('market_paisa_per_gram');
            $table->integer('spread_bps');
            $table->boolean('guardrail_applied');
            $table->bigInteger('guardrail_paisa_per_gram');
            $table->string('source', 16);
            $table->timestamp('price_fetched_at', 3);
            $table->json('balances_before');
            $table->json('balances_after');
            $table->timestamp('created_at', 3)->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('trades');
    }
};
