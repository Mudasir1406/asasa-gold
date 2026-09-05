<?php

use App\Exceptions\ApiException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

test('unknown API routes return the NOT_FOUND envelope', function () {
    $this->get('/api/does-not-exist')
        ->assertNotFound()
        ->assertExactJson(['error' => ['code' => 'NOT_FOUND', 'message' => 'Not found']]);
});

test('ApiException renders as the envelope with its status and details', function () {
    Route::middleware('api')->get('/api/boom', fn () => throw new ApiException('TRADING_PAUSED', 'Paused', 409, ['code' => 'PRICE_STALE']));

    $this->get('/api/boom')
        ->assertStatus(409)
        ->assertExactJson(['error' => ['code' => 'TRADING_PAUSED', 'message' => 'Paused', 'details' => ['code' => 'PRICE_STALE']]]);
});

test('validation failures are JSON envelopes even without an Accept header', function () {
    Route::middleware('api')->post('/api/echo', fn (Request $request) => $request->validate(['side' => 'required|in:BUY,SELL']));

    $this->post('/api/echo', ['side' => 'HOLD'])
        ->assertStatus(422)
        ->assertJsonPath('error.code', 'VALIDATION')
        ->assertJsonStructure(['error' => ['code', 'message', 'details' => ['side']]]);
});
