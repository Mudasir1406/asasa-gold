<?php

namespace App\Domain\Pricing\Sources;

/** Outcome of one source fetch: a normalised paisa/gram price or an error string. */
final readonly class SourceResult
{
    /**
     * @param  array<string, mixed>  $meta
     */
    private function __construct(
        public bool $ok,
        public ?int $paisaPerGram,
        public ?string $error,
        public array $meta,
    ) {}

    /**
     * @param  array<string, mixed>  $meta
     */
    public static function ok(int $paisaPerGram, array $meta = []): self
    {
        return new self(true, $paisaPerGram, null, $meta);
    }

    public static function fail(string $error): self
    {
        return new self(false, null, $error, []);
    }
}
