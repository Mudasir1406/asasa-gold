<?php

namespace App\Http\Controllers;

use App\Domain\Quotes\SettlementService;
use App\Exceptions\ApiException;
use App\Models\Trade;
use Illuminate\Http\JsonResponse;

class TradeController extends Controller
{
    /** Newest 25 trades, trade objects only (no balance snapshots). */
    public function index(SettlementService $settlement): JsonResponse
    {
        $trades = Trade::newestFirst()
            ->limit(25)
            ->get()
            ->map(fn (Trade $trade) => $settlement->tradeArray($trade));

        return response()->json($trades);
    }

    public function show(string $id, SettlementService $settlement): JsonResponse
    {
        $trade = Trade::find($id) ?? throw new ApiException('NOT_FOUND', 'Trade not found', 404);

        return response()->json($settlement->receipt($trade));
    }
}
