<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ledger_entries', function (Blueprint $table) {
            $table->id();
            $table->uuid('trade_id')->nullable()->index();
            $table->string('kind', 16);
            $table->string('account_id')->index();
            $table->foreign('account_id')->references('id')->on('accounts');
            $table->string('asset', 8);
            $table->bigInteger('amount');
            $table->timestamp('created_at', 3);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ledger_entries');
    }
};
