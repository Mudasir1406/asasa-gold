<?php

namespace App\Http\Controllers;

use App\Domain\Ledger\LedgerService;
use App\Domain\Pricing\PriceService;
use App\Domain\Quotes\SettlementService;
use App\Models\Trade;
use Illuminate\Http\JsonResponse;

/** Everything the single page needs in one poll (spec §8). */
class StateController extends Controller
{
    private const RECENT_TRADES = 10;

    public function __invoke(PriceService $price, LedgerService $ledger, SettlementService $settlement): JsonResponse
    {
        $view = $price->current();
        $integrity = $ledger->integrity();

        $recent = Trade::newestFirst()
            ->limit(self::RECENT_TRADES)
            ->get()
            ->map(fn (Trade $trade) => $settlement->tradeArray($trade))
            ->values();

        return response()->json([
            'price' => $view,
            'balances' => $ledger->balances(),
            'trading' => $view['trading'],
            'integrity' => ['ok' => $integrity['ok'], 'checked_at' => $integrity['checked_at']],
            'recent_trades' => $recent,
            'server_now' => $view['server_now'],
        ]);
    }
}
