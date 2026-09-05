<?php

use App\Domain\Ledger\Account;
use App\Domain\Ledger\LedgerService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

test('seeder produces spec balances and a balanced ledger', function () {
    $this->seed();
    $b = app(LedgerService::class)->balances();
    expect($b)->toBe(['customer_cash_paisa' => 25000000, 'customer_gold_mg' => 2500, 'platform_cash_paisa' => 500000000, 'platform_gold_mg' => 50000]);
    expect(app(LedgerService::class)->integrity()['ok'])->toBeTrue();

    $this->seed(); // idempotent
    expect(app(LedgerService::class)->balances()['customer_gold_mg'])->toBe(2500);
});

test('post rejects unbalanced postings', function () {
    $this->seed();
    DB::transaction(fn () => app(LedgerService::class)->post('TRADE', null, [['account' => Account::CUSTOMER_CASH, 'amount' => -5]]));
})->throws(LogicException::class);

test('post moves balances and integrity holds', function () {
    $this->seed();
    DB::transaction(fn () => app(LedgerService::class)->post('TRADE', (string) Str::uuid(), [
        ['account' => Account::CUSTOMER_CASH, 'amount' => -100], ['account' => Account::PLATFORM_CASH, 'amount' => 100],
        ['account' => Account::CUSTOMER_GOLD, 'amount' => 7], ['account' => Account::PLATFORM_GOLD, 'amount' => -7],
    ]));
    $b = app(LedgerService::class)->balances();
    expect($b['customer_cash_paisa'])->toBe(24999900)->and($b['customer_gold_mg'])->toBe(2507)->and($b['platform_gold_mg'])->toBe(49993);
    expect(app(LedgerService::class)->integrity()['ok'])->toBeTrue();
});
