<?php

namespace App\Domain\Ledger;

use App\Models\Account as AccountModel;
use App\Models\LedgerEntry;
use App\Support\Timestamp;
use Illuminate\Support\Facades\DB;
use LogicException;

/** Double-entry ledger. Entries are the truth; accounts.balance is a locked cache. */
class LedgerService
{
    /**
     * Post a balanced batch of entries. Must be called inside an open transaction.
     *
     * @param  list<array{account: string, amount: int}>  $postings
     */
    public function post(string $kind, ?string $tradeId, array $postings): void
    {
        if (DB::transactionLevel() === 0) {
            throw new LogicException('post() requires an open transaction');
        }

        $sums = [];
        foreach ($postings as $posting) {
            $asset = Account::assetOf($posting['account']);
            $sums[$asset] = ($sums[$asset] ?? 0) + $posting['amount'];
        }
        foreach ($sums as $asset => $sum) {
            if ($sum !== 0) {
                throw new LogicException("unbalanced postings for {$asset}: {$sum}");
            }
        }

        $ids = array_values(array_unique(array_column($postings, 'account')));
        sort($ids); // stable lock order across concurrent posters

        $rows = AccountModel::whereIn('id', $ids)->lockForUpdate()->get()->keyBy('id');
        if ($rows->count() !== count($ids)) {
            throw new LogicException('ledger accounts are not seeded');
        }

        $now = now();
        foreach ($postings as $posting) {
            LedgerEntry::create([
                'trade_id' => $tradeId,
                'kind' => $kind,
                'account_id' => $posting['account'],
                'asset' => Account::assetOf($posting['account']),
                'amount' => $posting['amount'],
                'created_at' => $now,
            ]);
            $rows[$posting['account']]->balance += $posting['amount'];
        }

        foreach ($rows as $row) {
            $row->save();
        }
    }

    /**
     * @return array{customer_cash_paisa: int, customer_gold_mg: int, platform_cash_paisa: int, platform_gold_mg: int}
     */
    public function balances(): array
    {
        $b = AccountModel::whereIn('id', Account::TRADE_ACCOUNTS)->pluck('balance', 'id');

        return [
            'customer_cash_paisa' => (int) $b[Account::CUSTOMER_CASH],
            'customer_gold_mg' => (int) $b[Account::CUSTOMER_GOLD],
            'platform_cash_paisa' => (int) $b[Account::PLATFORM_CASH],
            'platform_gold_mg' => (int) $b[Account::PLATFORM_GOLD],
        ];
    }

    /**
     * Lock the four trade accounts FOR UPDATE (stable order) and return their balances by id.
     *
     * @return array<string, int>
     */
    public function lockTradeAccounts(): array
    {
        return AccountModel::whereIn('id', Account::TRADE_ACCOUNTS)
            ->orderBy('id')
            ->lockForUpdate()
            ->pluck('balance', 'id')
            ->map(fn ($balance) => (int) $balance)
            ->all();
    }

    /**
     * @return array{ok: bool, checked_at: string, ledger_sums: array{PKR: int, GOLD: int}, account_mismatches: list<string>, unbalanced_trades: list<string>, entry_count: int}
     */
    public function integrity(): array
    {
        $sums = LedgerEntry::selectRaw('asset, SUM(amount) as s')
            ->groupBy('asset')
            ->pluck('s', 'asset')
            ->map(fn ($sum) => (int) $sum)
            ->all();

        $perAccount = LedgerEntry::selectRaw('account_id, SUM(amount) as s')
            ->groupBy('account_id')
            ->pluck('s', 'account_id');

        $mismatches = [];
        foreach (AccountModel::all() as $account) {
            if ((int) ($perAccount[$account->id] ?? 0) !== $account->balance) {
                $mismatches[] = $account->id;
            }
        }

        $unbalancedTrades = LedgerEntry::whereNotNull('trade_id')
            ->selectRaw('trade_id, asset, SUM(amount) as s')
            ->groupBy('trade_id', 'asset')
            ->havingRaw('SUM(amount) <> 0')
            ->pluck('trade_id')
            ->unique()
            ->values()
            ->all();

        $pkr = $sums[Account::ASSET_PKR] ?? 0;
        $gold = $sums[Account::ASSET_GOLD] ?? 0;

        return [
            'ok' => $pkr === 0 && $gold === 0 && $mismatches === [] && $unbalancedTrades === [],
            'checked_at' => Timestamp::iso(now()),
            'ledger_sums' => [Account::ASSET_PKR => $pkr, Account::ASSET_GOLD => $gold],
            'account_mismatches' => $mismatches,
            'unbalanced_trades' => $unbalancedTrades,
            'entry_count' => LedgerEntry::count(),
        ];
    }
}
