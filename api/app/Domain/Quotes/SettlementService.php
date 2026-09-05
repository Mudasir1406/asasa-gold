<?php

namespace App\Domain\Quotes;

use App\Domain\Ledger\Account;
use App\Domain\Ledger\LedgerService;
use App\Exceptions\ApiException;
use App\Models\Quote;
use App\Models\Trade;
use App\Support\Timestamp;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

/**
 * Settles a quote in one transaction (spec §7). Two independent guards stop a
 * double settlement: the quote row lock + status check, and the UNIQUE
 * constraint on trades.quote_id.
 */
class SettlementService
{
    public function __construct(
        private readonly QuoteService $quotes,
        private readonly LedgerService $ledger,
    ) {}

    /**
     * @return array<string, mixed> Receipt
     *
     * @throws ApiException NOT_FOUND (404), QUOTE_EXPIRED (409)
     * @throws InsufficientBalance when a balance moved since issue
     */
    public function confirm(string $quoteId): array
    {
        // 404 for unknown ids, and expiry materialised outside the settlement
        // transaction so the EXPIRED mark survives the 409 below.
        $this->quotes->find($quoteId);

        try {
            return DB::transaction(fn () => $this->settle($quoteId), attempts: 1);
        } catch (UniqueConstraintViolationException) {
            // A settlement that beat the row lock still cannot insert a second trade.
            return $this->receipt(Trade::where('quote_id', $quoteId)->firstOrFail(), replay: true);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function settle(string $quoteId): array
    {
        $quote = Quote::whereKey($quoteId)->lockForUpdate()->firstOrFail();

        if ($quote->status === 'SETTLED') {
            return $this->receipt(Trade::where('quote_id', $quote->id)->firstOrFail(), replay: true);
        }

        $now = now();

        if ($quote->status === 'EXPIRED' || $now->gte($quote->expires_at)) {
            throw new ApiException(
                'QUOTE_EXPIRED',
                'This price lock has expired. Get a fresh quote to continue.',
                409,
                ['quote' => $this->quotes->toArray($quote)],
            );
        }

        $this->ledger->lockTradeAccounts();   // FOR UPDATE in stable order; balances() reads under that lock
        $before = $this->ledger->balances();

        $this->quotes->checkAffordability($quote->side, $quote->gold_mg, $quote->total_paisa, $before);

        $snapshot = $quote->snapshot;
        $trade = Trade::create([
            'quote_id' => $quote->id,
            'side' => $quote->side,
            'gold_mg' => $quote->gold_mg,
            'total_paisa' => $quote->total_paisa,
            'unit_price_paisa_per_gram' => $quote->unit_price_paisa_per_gram,
            'market_paisa_per_gram' => $quote->market_paisa_per_gram,
            'spread_bps' => QuoteMath::spreadBps($quote->side),
            'guardrail_applied' => $quote->guardrail_applied,
            'guardrail_paisa_per_gram' => $quote->guardrail_paisa_per_gram,
            'source' => $snapshot->selected_source,
            'price_fetched_at' => $snapshot->fetched_at,
            'balances_before' => $before,
            'balances_after' => $before,
            'created_at' => $now,
        ]);

        $sign = $quote->side === 'BUY' ? 1 : -1;
        $this->ledger->post('TRADE', $trade->id, [
            ['account' => Account::CUSTOMER_CASH, 'amount' => -$sign * $quote->total_paisa],
            ['account' => Account::PLATFORM_CASH, 'amount' => $sign * $quote->total_paisa],
            ['account' => Account::CUSTOMER_GOLD, 'amount' => $sign * $quote->gold_mg],
            ['account' => Account::PLATFORM_GOLD, 'amount' => -$sign * $quote->gold_mg],
        ]);

        $trade->update(['balances_after' => $this->ledger->balances()]);
        $quote->update(['status' => 'SETTLED', 'settled_at' => $now]);

        return $this->receipt($trade);
    }

    /**
     * Receipt (spec §8): the trade plus the balances either side of it.
     *
     * @return array<string, mixed>
     */
    public function receipt(Trade $trade, bool $replay = false): array
    {
        return [
            'trade' => $this->tradeArray($trade),
            'balances_before' => $trade->balances_before,
            'balances_after' => $trade->balances_after,
            'idempotent_replay' => $replay,
        ];
    }

    /**
     * The Trade JSON shape used by the receipt and the trade list.
     *
     * @return array<string, mixed>
     */
    public function tradeArray(Trade $trade): array
    {
        return [
            'id' => $trade->id,
            'side' => $trade->side,
            'gold_mg' => $trade->gold_mg,
            'total_paisa' => $trade->total_paisa,
            'unit_price_paisa_per_gram' => $trade->unit_price_paisa_per_gram,
            'market_paisa_per_gram' => $trade->market_paisa_per_gram,
            'spread_bps' => $trade->spread_bps,
            'guardrail_applied' => $trade->guardrail_applied,
            'guardrail_paisa_per_gram' => $trade->guardrail_paisa_per_gram,
            'source' => $trade->source,
            'price_fetched_at' => Timestamp::iso($trade->price_fetched_at),
            'quote_id' => $trade->quote_id,
            'settled_at' => Timestamp::iso($trade->created_at),
        ];
    }
}
