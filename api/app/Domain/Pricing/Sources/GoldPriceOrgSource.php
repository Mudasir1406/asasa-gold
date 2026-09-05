<?php

namespace App\Domain\Pricing\Sources;

use App\Domain\Demo\DemoSettings;
use App\Domain\Pricing\Normalizer;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * GoldPrice.org's PKR/troy-ounce feed ÷ 31.1034768. The endpoint answers
 * Forbidden unless the request looks like it came from goldprice.org itself.
 */
final class GoldPriceOrgSource implements PriceSource
{
    public const ID = 'goldprice';

    public const NAME = 'GoldPrice.org';

    public const METHOD = 'xauPrice (PKR/oz) ÷ 31.1034768';

    private const HEADERS = [
        'User-Agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36',
        'Accept' => 'application/json, text/plain, */*',
        'Referer' => 'https://goldprice.org/',
        'Origin' => 'https://goldprice.org',
    ];

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
        if ($this->demo->get()['fail_fallback']) {
            return SourceResult::fail(DemoSettings::SIMULATED_OUTAGE);
        }

        try {
            $response = Http::timeout(config('gold.source_timeout_sec'))
                ->withHeaders(self::HEADERS)
                ->get('https://data-asg.goldprice.org/dbXRates/PKR');

            if (! $response->ok()) {
                return SourceResult::fail("HTTP {$response->status()}");
            }

            $pkrPerOz = (float) $response->json('items.0.xauPrice');

            if ($pkrPerOz <= 0) {
                return SourceResult::fail('malformed payload');
            }

            return SourceResult::ok(Normalizer::ouncePkrToPaisaPerGram($pkrPerOz), [
                'method' => self::METHOD,
                'pkr_per_oz' => $pkrPerOz,
                'source_ts' => $response->json('ts'),
            ]);
        } catch (Throwable $e) {
            return SourceResult::fail($e->getMessage());
        }
    }
}
