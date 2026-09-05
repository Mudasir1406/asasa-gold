<?php

namespace App\Domain\Demo;

use App\Domain\Ledger\Account;
use App\Domain\Ledger\LedgerService;
use App\Exceptions\ApiException;
use App\Models\Account as AccountModel;
use App\Models\DemoSetting;
use App\Models\LedgerEntry;
use App\Models\PriceSnapshot;
use App\Models\Quote;
use App\Models\Trade;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/** Reviewer tools that touch the books. Every write is a balanced ledger posting. */
class DemoService
{
    /** Request keys → the ledger accounts a reviewer may set. */
    private const ADJUSTABLE = [
        'customer_cash_paisa' => Account::CUSTOMER_CASH,
        'customer_gold_mg' => Account::CUSTOMER_GOLD,
        'platform_gold_mg' => Account::PLATFORM_GOLD,
    ];

    public function __construct(private readonly LedgerService $ledger) {}

    /**
     * Set accounts to absolute balances by posting ADJUSTMENT entries against
     * the external_* accounts, so the ledger stays balanced per asset.
     *
     * @param  array<string, int>  $targets  keys customer_cash_paisa|customer_gold_mg|platform_gold_mg, values ≥ 0
     * @return array{customer_cash_paisa: int, customer_gold_mg: int, platform_cash_paisa: int, platform_gold_mg: int}
     */
    public function adjustBalances(array $targets): array
    {
        foreach ($targets as $key => $target) {
            if (! isset(self::ADJUSTABLE[$key])) {
                throw new InvalidArgumentException("unknown balance: {$key}");
            }
            if ($target < 0) {
                throw new InvalidArgumentException("{$key} must be zero or more");
            }
        }

        return DB::transaction(function () use ($targets) {
            $current = $this->ledger->lockTradeAccounts();
            $postings = [];

            foreach ($targets as $key => $target) {
                $account = self::ADJUSTABLE[$key];
                $delta = $target - $current[$account];

                if ($delta === 0) {
                    continue;
                }

                $external = Account::assetOf($account) === Account::ASSET_PKR ? Account::EXTERNAL_CASH : Account::EXTERNAL_GOLD;
                $postings[] = ['account' => $account, 'amount' => $delta];
                $postings[] = ['account' => $external, 'amount' => -$delta];
            }

            if ($postings !== []) {
                $this->ledger->post('ADJUSTMENT', null, $postings);
            }

            return $this->ledger->balances();
        });
    }

    /**
     * Expire a quote immediately so a reviewer need not wait out the 75-second
     * lock. Settled quotes are left alone — settlement is final.
     */
    public function expireQuote(string $id): Quote
    {
        $quote = Quote::find($id) ?? throw new ApiException('NOT_FOUND', 'Quote not found', 404);

        if ($quote->status === 'ACTIVE') {
            $quote->update(['status' => 'EXPIRED', 'expires_at' => now()]);
        }

        return $quote->refresh();
    }

    /** Wipe every trace of the demo session and re-seed the opening balances. */
    public function reset(): void
    {
        DB::transaction(function () {
            Trade::query()->delete();
            Quote::query()->delete();
            LedgerEntry::query()->delete();
            PriceSnapshot::query()->delete();
            DemoSetting::query()->delete();
            AccountModel::query()->update(['balance' => 0]);
        });

        app()->call([new DatabaseSeeder, 'run']);
    }
}
