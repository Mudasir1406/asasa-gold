<?php

namespace App\Http\Controllers;

use App\Domain\Pricing\PriceService;
use Illuminate\Http\JsonResponse;

class PriceController extends Controller
{
    /** PriceView for the newest snapshot; triggers the lazy refresh when one is due. */
    public function show(PriceService $price): JsonResponse
    {
        return response()->json($price->current());
    }
}
