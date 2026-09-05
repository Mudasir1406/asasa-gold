<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('quotes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('side', 4);
            $table->string('input_mode', 4);
            $table->bigInteger('input_amount');
            $table->bigInteger('market_paisa_per_gram');
            $table->bigInteger('unit_price_paisa_per_gram');
            $table->bigInteger('guardrail_paisa_per_gram');
            $table->boolean('guardrail_applied');
            $table->bigInteger('gold_mg');
            $table->bigInteger('total_paisa');
            $table->foreignId('price_snapshot_id')->constrained('price_snapshots');
            $table->string('status', 8)->index();
            $table->timestamp('created_at', 3);
            $table->timestamp('expires_at', 3);
            $table->timestamp('settled_at', 3)->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('quotes');
    }
};
