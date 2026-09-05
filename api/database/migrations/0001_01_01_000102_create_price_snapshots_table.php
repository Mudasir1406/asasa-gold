<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('price_snapshots', function (Blueprint $table) {
            $table->id();
            $table->timestamp('fetched_at', 3)->index();
            $table->string('verification', 16);
            $table->string('selected_source', 16)->nullable();
            $table->bigInteger('market_paisa_per_gram')->nullable();
            $table->integer('divergence_bps')->nullable();
            $table->boolean('primary_ok');
            $table->bigInteger('primary_paisa_per_gram')->nullable();
            $table->text('primary_error')->nullable();
            $table->json('primary_meta')->nullable();
            $table->boolean('fallback_ok');
            $table->bigInteger('fallback_paisa_per_gram')->nullable();
            $table->text('fallback_error')->nullable();
            $table->json('fallback_meta')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('price_snapshots');
    }
};
