<?php

use App\Domain\Pricing\Normalizer;

test('goldprice ounce → paisa/gram', fn () => expect(Normalizer::ouncePkrToPaisaPerGram(1229736.4553))->toBe(3953695));

test('gold-api × fx → paisa/gram', fn () => expect(Normalizer::usdOunceToPaisaPerGram(4435.700195, 277.363614))->toBe(3955512));

test('rejects non-positive', fn () => Normalizer::ouncePkrToPaisaPerGram(0))->throws(InvalidArgumentException::class);

test('rejects non-positive fx', fn () => Normalizer::usdOunceToPaisaPerGram(4435.7, 0))->throws(InvalidArgumentException::class);
