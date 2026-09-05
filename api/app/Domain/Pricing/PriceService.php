<?php

namespace App\Domain\Pricing;

use App\Domain\Demo\DemoSettings;
use App\Domain\Pricing\Sources\GoldPriceOrgSource;
use App\Domain\Pricing\Sources\PakGoldSource;
use App\Models\PriceSnapshot;
use App\Support\Money;
use Illuminate\Support\Facades\Cache;

/**
 * Owns price snapshots: lazy refresh on read (at most once per refresh
 * interval, stampede-guarded), the cross-check state machine (spec §4.3),
 * and the PriceView the API returns.
 */
class PriceService
{
    public function __construct(
        private readonly PakGoldSource $primary,
        private readonly GoldPriceOrgSource $fallback,
        private readonly DemoSettings $demo,
    ) {}

    /**
     * The PriceView for the newest snapshot, refreshing first if it is due.
     *
     * @return array<string, mixed>
     */
    public function current(): array
    {
        $latest = $this->latest();

        if ($this->isDue($latest)) {
            $lock = Cache::lock('price-refresh', 20);

            if ($lock->get()) {
                try {
                    $latest = $this->takeSnapshot();
                } finally {
                    $lock->release();
                }
            }
        }

        return $this->view($latest);
    }

    /** Fetch a new snapshot if due — or unconditionally when forced (reviewer tools). */
    public function refresh(bool $force = false): PriceSnapshot
    {
        $latest = $this->latest();

        if ($force || $this->isDue($latest)) {
            return $this->takeSnapshot();
        }

        return $latest;
    }

    public function latest(): ?PriceSnapshot
    {
        return PriceSnapshot::query()->orderByDesc('fetched_at')->orderByDesc('id')->first();
    }

    /**
     * @return array<string, mixed>
     */
    public function view(?PriceSnapshot $latest): array
    {
        $lastKnown = $latest?->market_paisa_per_gram !== null
            ? $latest
            : PriceSnapshot::query()->whereNotNull('market_paisa_per_gram')->orderByDesc('fetched_at')->orderByDesc('id')->first();

        return PriceView::build($latest, $lastKnown, $this->demo->get(), now());
    }

    private function isDue(?PriceSnapshot $latest): bool
    {
        return $latest === null || $latest->ageSeconds(now()) >= config('gold.price_refresh_seconds');
    }

    /** Fetch both sources and write one snapshot row — always, so outages are visible in history. */
    private function takeSnapshot(): PriceSnapshot
    {
        $primary = $this->primary->fetch();
        $fallback = $this->fallback->fetch();

        $verification = 'UNAVAILABLE';
        $selected = null;
        $market = null;
        $divergence = null;

        if ($primary->ok && $fallback->ok) {
            // Ceil, not floor: a 3.004 % gap must fail the 300 bps check rather than
            // round down into it. When the two sources disagree we err toward distrust.
            $divergence = Money::mulDivCeil(abs($primary->paisaPerGram - $fallback->paisaPerGram), 10000, $fallback->paisaPerGram);

            if ($divergence <= config('gold.divergence_max_bps')) {
                [$verification, $selected, $market] = ['CROSS_CHECKED', $this->primary->id(), $primary->paisaPerGram];
            } else {
                $verification = 'DISPUTED';
            }
        } elseif ($primary->ok) {
            [$verification, $selected, $market] = ['SINGLE_SOURCE', $this->primary->id(), $primary->paisaPerGram];
        } elseif ($fallback->ok) {
            [$verification, $selected, $market] = ['SINGLE_SOURCE', $this->fallback->id(), $fallback->paisaPerGram];
        }

        return PriceSnapshot::create([
            'fetched_at' => now(),
            'verification' => $verification,
            'selected_source' => $selected,
            'market_paisa_per_gram' => $market,
            'divergence_bps' => $divergence,
            'primary_ok' => $primary->ok,
            'primary_paisa_per_gram' => $primary->paisaPerGram,
            'primary_error' => $primary->error,
            'primary_meta' => $primary->ok ? $primary->meta : null,
            'fallback_ok' => $fallback->ok,
            'fallback_paisa_per_gram' => $fallback->paisaPerGram,
            'fallback_error' => $fallback->error,
            'fallback_meta' => $fallback->ok ? $fallback->meta : null,
        ]);
    }
}
