<?php

namespace App\Domain\Pricing\Sources;

use App\Domain\Demo\DemoSettings;
use App\Domain\Pricing\Normalizer;
use Illuminate\Http\Client\Pool;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * The pakgold.pk method: XAU/USD per troy ounce (gold-api.com) × USD→PKR
 * (open.er-api.com) ÷ 31.1034768. Both upstream calls must succeed.
 */
final class PakGoldSource implements PriceSource
{
    public const ID = 'pakgold';

    public const NAME = 'PakGold';

    public const METHOD = 'gold-api.com XAU/USD × open.er-api.com USD/PKR ÷ 31.1034768';

    public function __construct(private readonly DemoSettings $demo) {}

    public function id(): string
    {
        return self::ID;
    }

    public function name(): string
    {
        return self::NAME;
    }

    public function fetch(): SourceResult
    {
        if ($this->demo->get()['fail_primary']) {
            return SourceResult::fail(DemoSettings::SIMULATED_OUTAGE);
        }

        try {
            $timeout = config('gold.source_timeout_sec');

            $responses = Http::pool(fn (Pool $pool) => [
                $pool->as('xau')->timeout($timeout)->acceptJson()->get('https://api.gold-api.com/price/XAU'),
                $pool->as('fx')->timeout($timeout)->acceptJson()->get('https://open.er-api.com/v6/latest/USD'),
            ]);

            foreach (['xau', 'fx'] as $key) {
                $response = $responses[$key];

                if ($response instanceof Throwable) {
                    return SourceResult::fail("{$key} request failed: {$response->getMessage()}");
                }
                if (! $response->ok()) {
                    return SourceResult::fail("{$key} request failed: HTTP {$response->status()}");
                }
            }

            $xau = (float) $responses['xau']->json('price');
            $fx = (float) $responses['fx']->json('rates.PKR');

            if ($xau <= 0 || $fx <= 0) {
                return SourceResult::fail('malformed payload');
            }

            return SourceResult::ok(Normalizer::usdOunceToPaisaPerGram($xau, $fx), [
                'method' => self::METHOD,
                'xau_usd_per_oz' => $xau,
                'usd_to_pkr' => $fx,
                'xau_updated_at' => $responses['xau']->json('updatedAt'),
                'fx_updated_at' => $responses['fx']->json('time_last_update_utc'),
            ]);
        } catch (Throwable $e) {
            return SourceResult::fail($e->getMessage());
        }
    }
}
