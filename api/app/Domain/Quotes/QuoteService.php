<?php

namespace App\Domain\Quotes;

use App\Domain\Ledger\LedgerService;
use App\Domain\Pricing\PriceService;
use App\Exceptions\ApiException;
use App\Models\Quote;
use App\Support\Timestamp;

/**
 * Issues and reads quotes. A quote freezes the unit price and both legs at
 * issue; settlement replays those stored integers and never recomputes.
 */
class QuoteService
{
    public function __construct(
        private readonly PriceService $price,
        private readonly LedgerService $ledger,
    ) {}

    /**
     * @throws ApiException TRADING_PAUSED (409) when no trusted price backs a quote
     * @throws InsufficientBalance when the customer or the platform cannot cover the trade now
     */
    public function issue(string $side, string $inputMode, int $amount): Quote
    {
        $view = $this->price->current();

        if (! $view['trading']['enabled']) {
            throw new ApiException('TRADING_PAUSED', $view['trading']['reason'], 409, ['code' => $view['trading']['code']]);
        }

        $legs = QuoteMath::compute($side, $inputMode, $amount, $view['buy_paisa_per_gram'], $view['sell_paisa_per_gram']);

        $this->checkAffordability($side, $legs['gold_mg'], $legs['total_paisa'], $this->ledger->balances());

        $now = now();

        return Quote::create([
            'side' => $side,
            'input_mode' => $inputMode,
            'input_amount' => $amount,
            'market_paisa_per_gram' => $view['market_paisa_per_gram'],
            'unit_price_paisa_per_gram' => $legs['unit_price'],
            'guardrail_paisa_per_gram' => $view['guardrail_paisa_per_gram'],
            'guardrail_applied' => $side === 'BUY' && $view['guardrail_applied'],
            'gold_mg' => $legs['gold_mg'],
            'total_paisa' => $legs['total_paisa'],
            'price_snapshot_id' => $view['snapshot_id'],
            'status' => 'ACTIVE',
            'created_at' => $now,
            'expires_at' => $now->copy()->addSeconds(config('gold.quote_ttl_seconds')),
        ]);
    }

    /**
     * Find a quote, materialising expiry on read: an ACTIVE quote past its
     * expires_at is marked EXPIRED before it is returned.
     *
     * @throws ApiException NOT_FOUND (404)
     */
    public function find(string $id): Quote
    {
        $quote = Quote::find($id) ?? throw new ApiException('NOT_FOUND', 'Quote not found', 404);

        if ($quote->status === 'ACTIVE' && now()->gte($quote->expires_at)) {
            // Conditional so a concurrent settlement holding the row lock is never overwritten.
            Quote::whereKey($quote->id)->where('status', 'ACTIVE')->update(['status' => 'EXPIRED']);
            $quote->refresh();
        }

        return $quote;
    }

    /**
     * Only customer cash, customer gold and platform inventory gate a trade;
     * platform cash is an ungated float (spec §6).
     *
     * @param  array{customer_cash_paisa: int, customer_gold_mg: int, platform_cash_paisa: int, platform_gold_mg: int}  $balances
     *
     * @throws InsufficientBalance
     */
    public function checkAffordability(string $side, int $goldMg, int $totalPaisa, array $balances): void
    {
        if ($side === 'BUY') {
            if ($totalPaisa > $balances['customer_cash_paisa']) {
                throw InsufficientBalance::cash($totalPaisa, $balances['customer_cash_paisa']);
            }
            if ($goldMg > $balances['platform_gold_mg']) {
                throw InsufficientBalance::inventory($goldMg, $balances['platform_gold_mg']);
            }

            return;
        }

        if ($goldMg > $balances['customer_gold_mg']) {
            throw InsufficientBalance::gold($goldMg, $balances['customer_gold_mg']);
        }
    }

    /**
     * The Quote JSON shape (spec §7/§8), with server_now so clients can correct clock skew.
     *
     * @return array<string, mixed>
     */
    public function toArray(Quote $quote): array
    {
        $now = now();
        $expired = $quote->status === 'ACTIVE' && $now->gte($quote->expires_at);
        $remainingMs = $quote->expires_at->getTimestampMs() - $now->getTimestampMs();
        $snapshot = $quote->snapshot;

        return [
            'id' => $quote->id,
            'side' => $quote->side,
            'input_mode' => $quote->input_mode,
            'input_amount' => $quote->input_amount,
            'market_paisa_per_gram' => $quote->market_paisa_per_gram,
            'unit_price_paisa_per_gram' => $quote->unit_price_paisa_per_gram,
            'spread_bps' => QuoteMath::spreadBps($quote->side),
            'guardrail_paisa_per_gram' => $quote->guardrail_paisa_per_gram,
            'guardrail_applied' => $quote->guardrail_applied,
            'gold_mg' => $quote->gold_mg,
            'total_paisa' => $quote->total_paisa,
            'status' => $expired ? 'EXPIRED' : $quote->status,
            'created_at' => Timestamp::iso($quote->created_at),
            'expires_at' => Timestamp::iso($quote->expires_at),
            'settled_at' => $quote->settled_at ? Timestamp::iso($quote->settled_at) : null,
            'seconds_remaining' => $quote->status === 'ACTIVE' ? max(0, intdiv($remainingMs + 999, 1000)) : 0,
            'server_now' => Timestamp::iso($now),
            'source' => $snapshot->selected_source,
            'price_fetched_at' => Timestamp::iso($snapshot->fetched_at),
        ];
    }
}
