<?php

namespace App\Http\Controllers;

use App\Domain\Ledger\LedgerService;
use Illuminate\Http\JsonResponse;

class IntegrityController extends Controller
{
    public function __invoke(LedgerService $ledger): JsonResponse
    {
        return response()->json($ledger->integrity());
    }
}
