<?php

namespace App\Domain\Pricing;

use App\Domain\Pricing\Sources\GoldPriceOrgSource;
use App\Domain\Pricing\Sources\PakGoldSource;
use App\Models\PriceSnapshot;
use App\Support\Timestamp;
use Illuminate\Support\Carbon;

/** Shapes the PriceView JSON (spec §8) from the newest snapshot and demo flags. */
final class PriceView
{
    /**
     * @param  array{fail_primary: bool, fail_fallback: bool, force_stale: bool, guardrail_paisa_per_gram: int}  $demo
     * @return array<string, mixed>
     */
    public static function build(?PriceSnapshot $latest, ?PriceSnapshot $lastKnown, array $demo, Carbon $now): array
    {
        $refresh = config('gold.price_refresh_seconds');
        $maxAge = config('gold.price_max_age_seconds');
        $guardrail = $demo['guardrail_paisa_per_gram'];

        $age = $latest?->ageSeconds($now);
        $verification = $latest?->verification ?? 'UNAVAILABLE';
        $market = $latest?->market_paisa_per_gram;

        [$code, $reason] = match (true) {
            $demo['force_stale'] => ['PRICE_STALE', 'Price data is stale (forced for demo)'],
            $verification === 'DISPUTED' => ['PRICE_DISPUTED', 'Sources disagree by '.self::bpsToPercent($latest->divergence_bps).' %'],
            $market === null => ['PRICE_UNAVAILABLE', 'Neither price source is responding'],
            $age >= $maxAge => ['PRICE_STALE', sprintf('Price is %d min old', intdiv($age, 60))],
            default => [null, null],
        };
        $enabled = $code === null;

        $status = match (true) {
            ! $enabled => 'PAUSED',
            $verification === 'CROSS_CHECKED' => 'LIVE',
            default => 'DEGRADED',
        };
        if ($status === 'DEGRADED') {
            $reason = $latest->selected_source === GoldPriceOrgSource::ID
                ? 'Primary source down — using '.GoldPriceOrgSource::NAME
                : 'Cross-check unavailable — using '.PakGoldSource::NAME.' only';
        }

        $spread = $enabled ? Spread::compute($market, $guardrail) : null;

        return [
            'status' => $status,
            'trading' => ['enabled' => $enabled, 'code' => $code, 'reason' => $reason],
            'market_paisa_per_gram' => $enabled ? $market : null,
            'buy_paisa_per_gram' => $spread['buy'] ?? null,
            'sell_paisa_per_gram' => $spread['sell'] ?? null,
            'last_known_market_paisa_per_gram' => $lastKnown?->market_paisa_per_gram,
            'last_known_at' => $lastKnown ? Timestamp::iso($lastKnown->fetched_at) : null,
            'guardrail_paisa_per_gram' => $guardrail,
            'guardrail_applied' => $spread['guardrail_applied'] ?? false,
            'source' => [
                'selected' => $latest?->selected_source,
                'verification' => $verification,
                'divergence_bps' => $latest?->divergence_bps,
                'primary' => [
                    'name' => PakGoldSource::NAME,
                    'ok' => $latest?->primary_ok ?? false,
                    'paisa_per_gram' => $latest?->primary_paisa_per_gram,
                    'error' => $latest?->primary_error,
                    'meta' => $latest?->primary_meta,
                ],
                'fallback' => [
                    'name' => GoldPriceOrgSource::NAME,
                    'ok' => $latest?->fallback_ok ?? false,
                    'paisa_per_gram' => $latest?->fallback_paisa_per_gram,
                    'error' => $latest?->fallback_error,
                    'meta' => $latest?->fallback_meta,
                ],
            ],
            'fetched_at' => $latest ? Timestamp::iso($latest->fetched_at) : null,
            'age_seconds' => $age,
            'next_refresh_in_seconds' => $age === null ? 0 : max(0, $refresh - $age),
            'refresh_interval_seconds' => $refresh,
            'max_age_seconds' => $maxAge,
            'snapshot_id' => $latest?->id,
            'server_now' => Timestamp::iso($now),
        ];
    }

    /** 536 bps → "5.36" without going through floats. */
    private static function bpsToPercent(int $bps): string
    {
        return sprintf('%d.%02d', intdiv($bps, 100), $bps % 100);
    }
}
