<?php

namespace App\Domain\Demo;

use App\Models\DemoSetting;
use InvalidArgumentException;

/** Reviewer-tool flags and the guardrail, persisted in demo_settings. */
final class DemoSettings
{
    public const SIMULATED_OUTAGE = 'Simulated outage (reviewer tools)';

    /**
     * @return array{fail_primary: bool, fail_fallback: bool, force_stale: bool, guardrail_paisa_per_gram: int}
     */
    public function get(): array
    {
        $stored = DemoSetting::query()->pluck('value', 'key');

        return [
            'fail_primary' => (bool) ($stored['fail_primary'] ?? false),
            'fail_fallback' => (bool) ($stored['fail_fallback'] ?? false),
            'force_stale' => (bool) ($stored['force_stale'] ?? false),
            'guardrail_paisa_per_gram' => (int) ($stored['guardrail_paisa_per_gram'] ?? config('gold.guardrail_paisa_per_gram')),
        ];
    }

    /**
     * @param  array<string, bool|int>  $partial
     * @return array{fail_primary: bool, fail_fallback: bool, force_stale: bool, guardrail_paisa_per_gram: int}
     */
    public function set(array $partial): array
    {
        foreach ($partial as $key => $value) {
            $value = match ($key) {
                'fail_primary', 'fail_fallback', 'force_stale' => (bool) $value,
                'guardrail_paisa_per_gram' => (int) $value,
                default => throw new InvalidArgumentException("unknown demo setting: {$key}"),
            };

            DemoSetting::updateOrCreate(['key' => $key], ['value' => $value]);
        }

        return $this->get();
    }
}
