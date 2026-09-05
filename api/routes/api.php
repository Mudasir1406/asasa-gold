<?php

use App\Http\Controllers\DemoController;
use App\Http\Controllers\IntegrityController;
use App\Http\Controllers\PriceController;
use App\Http\Controllers\QuoteController;
use App\Http\Controllers\StateController;
use App\Http\Controllers\TradeController;
use Illuminate\Support\Facades\Route;

Route::get('/state', StateController::class);
Route::get('/price', [PriceController::class, 'show']);
Route::post('/quotes', [QuoteController::class, 'store']);
Route::get('/quotes/{id}', [QuoteController::class, 'show']);
Route::post('/quotes/{id}/confirm', [QuoteController::class, 'confirm']);
Route::get('/trades', [TradeController::class, 'index']);
Route::get('/trades/{id}', [TradeController::class, 'show']);
Route::get('/integrity', IntegrityController::class);

// Reviewer tools — demo-only, unauthenticated by design (spec §8, §11).
Route::prefix('demo')->group(function () {
    Route::get('/settings', [DemoController::class, 'settings']);
    Route::put('/settings', [DemoController::class, 'updateSettings']);
    Route::post('/price/refresh', [DemoController::class, 'refresh']);
    Route::post('/balances', [DemoController::class, 'balances']);
    Route::post('/quotes/{id}/expire', [DemoController::class, 'expireQuote']);
    Route::post('/reset', [DemoController::class, 'reset']);
});
