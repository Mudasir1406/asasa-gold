<?php

use App\Domain\Ledger\LedgerService;
use App\Models\LedgerEntry;
use App\Models\Trade;

beforeEach(fn () => $this->seed());

test('integrity endpoint reports a balanced seed', function () {
    $this->getJson('/api/integrity')->assertOk()
        ->assertJsonPath('ok', true)
        ->assertJsonPath('ledger_sums.PKR', 0)
        ->assertJsonPath('ledger_sums.GOLD', 0)
        ->assertJsonPath('account_mismatches', [])
        ->assertJsonPath('unbalanced_trades', [])
        ->assertJsonPath('entry_count', 6)
        ->assertJsonStructure(['checked_at']);
});

test('all four invariants hold after a randomised sequence of buys and sells', function () {
    fakeBoth();
    mt_srand(20260905);
    $settled = 0;

    for ($i = 0; $i < 30; $i++) {
        $side = mt_rand(0, 1) ? 'BUY' : 'SELL';
        $mode = mt_rand(0, 1) ? 'PKR' : 'GOLD';
        $amount = $mode === 'PKR' ? mt_rand(100000, 6000000) : mt_rand(10, 1500);

        $quote = $this->postJson('/api/quotes', ['side' => $side, 'input_mode' => $mode, 'amount' => $amount]);
        if ($quote->status() === 422) {
            expect($quote->json('error.code'))->toStartWith('INSUFFICIENT_');

            continue;
        }

        $this->postJson('/api/quotes/'.$quote->assertCreated()->json('id').'/confirm')->assertOk();
        $settled++;
    }

    expect($settled)->toBeGreaterThan(10);

    $report = $this->getJson('/api/integrity')->assertOk()->assertJsonPath('ok', true)->json();
    expect($report['ledger_sums'])->toBe(['PKR' => 0, 'GOLD' => 0])            // 1. per-asset ledger sums to zero
        ->and($report['account_mismatches'])->toBe([])                          // 2. cached balances equal entry sums
        ->and($report['unbalanced_trades'])->toBe([])                           // 3. each trade sums to zero per asset
        ->and($report['entry_count'])->toBe(6 + 4 * $settled);

    $balances = app(LedgerService::class)->balances();
    expect($balances['customer_gold_mg'] + $balances['platform_gold_mg'])->toBe(52500)   // 4. gold is conserved, never minted
        ->and($balances['customer_cash_paisa'] + $balances['platform_cash_paisa'])->toBe(525000000)
        ->and(LedgerEntry::where('kind', 'TRADE')->whereIn('account_id', ['external_cash', 'external_gold'])->count())->toBe(0)
        ->and(Trade::count())->toBe($settled);

    expect($this->getJson('/api/trades')->assertOk()->json())->toHaveCount(min(25, $settled));
});
