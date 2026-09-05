<?php

namespace App\Http\Controllers;

use App\Domain\Demo\DemoService;
use App\Domain\Demo\DemoSettings;
use App\Domain\Ledger\LedgerService;
use App\Domain\Pricing\PriceService;
use App\Domain\Quotes\QuoteService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Reviewer tools. These exist so the stress cases in the brief can be tried on
 * the deployed app without changing code. They are deliberately unauthenticated
 * — the brief puts authentication out of scope — and are labelled as demo-only
 * in the UI. A real product would never ship these open.
 */
class DemoController extends Controller
{
    public function settings(DemoSettings $settings): JsonResponse
    {
        return response()->json($settings->get());
    }

    /**
     * Flags apply instantly. The response carries the recomputed price view so
     * a guardrail change repriced buys without the client refetching, and so a
     * force_stale toggle pauses trading without waiting for the next refresh.
     */
    public function updateSettings(Request $request, DemoSettings $settings, PriceService $price): JsonResponse
    {
        $data = $request->validate([
            'fail_primary' => ['sometimes', 'boolean'],
            'fail_fallback' => ['sometimes', 'boolean'],
            'force_stale' => ['sometimes', 'boolean'],
            'guardrail_paisa_per_gram' => ['sometimes', 'integer', 'min:0', 'max:100000000'],
        ]);

        $updated = $settings->set($data);

        return response()->json([
            'settings' => $updated,
            'price' => $price->view($price->latest()),
        ]);
    }

    /** Bypasses the five-minute cache. Demo only — the normal path never does this. */
    public function refresh(PriceService $price): JsonResponse
    {
        $price->refresh(force: true);

        return response()->json($price->view($price->latest()));
    }

    public function balances(Request $request, DemoService $demo, LedgerService $ledger): JsonResponse
    {
        $data = $request->validate([
            'customer_cash_paisa' => ['sometimes', 'integer', 'min:0'],
            'customer_gold_mg' => ['sometimes', 'integer', 'min:0'],
            'platform_gold_mg' => ['sometimes', 'integer', 'min:0'],
        ]);

        if ($data === []) {
            return response()->json([
                'error' => [
                    'code' => 'VALIDATION',
                    'message' => 'Set at least one of customer_cash_paisa, customer_gold_mg, platform_gold_mg.',
                ],
            ], 422);
        }

        return response()->json([
            'balances' => $demo->adjustBalances($data),
            'integrity' => $ledger->integrity(),
        ]);
    }

    public function expireQuote(string $id, DemoService $demo, QuoteService $quotes): JsonResponse
    {
        return response()->json($quotes->toArray($demo->expireQuote($id)));
    }

    public function reset(DemoService $demo): JsonResponse
    {
        $demo->reset();

        return response()->json(['ok' => true]);
    }
}
