<?php

namespace App\Http\Controllers;

use App\Domain\Quotes\QuoteService;
use App\Domain\Quotes\SettlementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class QuoteController extends Controller
{
    /**
     * Upper bound on an input amount (PKR 100,000,000 or 10 tonnes of gold):
     * keeps amount × unit price inside 64-bit integer range for any guardrail.
     */
    private const MAX_AMOUNT = 10_000_000_000;

    public function store(Request $request, QuoteService $quotes): JsonResponse
    {
        $data = $request->validate([
            'side' => ['required', Rule::in(['BUY', 'SELL'])],
            'input_mode' => ['required', Rule::in(['PKR', 'GOLD'])],
            'amount' => ['required', 'integer', 'min:1', 'max:'.self::MAX_AMOUNT],
        ]);

        $quote = $quotes->issue($data['side'], $data['input_mode'], (int) $data['amount']);

        return response()->json($quotes->toArray($quote), 201);
    }

    public function show(string $id, QuoteService $quotes): JsonResponse
    {
        return response()->json($quotes->toArray($quotes->find($id)));
    }

    public function confirm(string $id, SettlementService $settlement): JsonResponse
    {
        return response()->json($settlement->confirm($id));
    }
}
