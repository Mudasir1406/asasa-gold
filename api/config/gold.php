<?php

return [
    'troy_ounce_grams' => 31.1034768,
    'buy_spread_bps' => 11000,
    'sell_spread_bps' => 9000,
    'divergence_max_bps' => 300,
    'price_refresh_seconds' => 300,
    'price_max_age_seconds' => 600,
    'quote_ttl_seconds' => 75,
    'min_trade_mg' => 10,
    'source_timeout_sec' => 6,
    'guardrail_paisa_per_gram' => (int) env('GUARDRAIL_PAISA_PER_GRAM', 3500000),
];
