<?php

use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature', 'Unit');

/**
 * Fake both upstream price sources. The defaults reproduce the spec's live
 * cross-check: PakGold → 3955512 paisa/g, GoldPrice.org → 3953695 paisa/g.
 *
 * Safe to call again mid-test (e.g. to kill both sources after a quote was
 * issued): Http::fake() accumulates stubs and the first match wins, so each
 * call starts from a fresh HTTP factory.
 */
function fakeBoth(
    float $xau = 4435.700195,
    float $fx = 277.363614,
    float $gpOz = 1229736.4553,
    bool $pOk = true,
    bool $fOk = true,
): void {
    Http::swap(new HttpFactory(app(Dispatcher::class)));

    Http::fake([
        'api.gold-api.com/*' => $pOk
            ? Http::response(['price' => $xau, 'updatedAt' => '2026-09-04T19:28:27Z'])
            : Http::response('', 503),
        'open.er-api.com/*' => Http::response([
            'rates' => ['PKR' => $fx],
            'time_last_update_utc' => 'Fri, 04 Sep 2026 00:02:31 +0000',
        ]),
        'data-asg.goldprice.org/*' => $fOk
            ? Http::response(['ts' => 1757007000000, 'items' => [['xauPrice' => $gpOz]]])
            : Http::response('Forbidden', 403),
    ]);
}
