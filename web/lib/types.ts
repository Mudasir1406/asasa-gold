/**
 * Wire types for the gold-trading API (spec §8). Every money field is integer
 * paisa, every metal field integer milligrams, every unit price integer paisa
 * per gram. Timestamps are ISO-8601 UTC strings with milliseconds.
 */

export type PriceStatus = "LIVE" | "DEGRADED" | "PAUSED";

export type TradingCode =
  | null
  | "PRICE_UNAVAILABLE"
  | "PRICE_DISPUTED"
  | "PRICE_STALE";

export type Verification =
  | "CROSS_CHECKED"
  | "SINGLE_SOURCE"
  | "DISPUTED"
  | "UNAVAILABLE";

export type SourceId = "pakgold" | "goldprice";

export type Side = "BUY" | "SELL";

export type InputMode = "PKR" | "GOLD";

export type QuoteStatus = "ACTIVE" | "SETTLED" | "EXPIRED";

export interface Trading {
  enabled: boolean;
  code: TradingCode;
  reason: string | null;
}

/** One upstream reading inside a snapshot; `meta.method` describes the derivation. */
export interface SourceReading {
  name: string;
  ok: boolean;
  paisa_per_gram: number | null;
  error: string | null;
  meta: Record<string, unknown> | null;
}

export interface PriceSourceInfo {
  selected: SourceId | null;
  verification: Verification;
  divergence_bps: number | null;
  primary: SourceReading;
  fallback: SourceReading;
}

export interface PriceView {
  status: PriceStatus;
  trading: Trading;
  /** Null when no trusted price backs trading (disputed, unavailable, stale). */
  market_paisa_per_gram: number | null;
  buy_paisa_per_gram: number | null;
  sell_paisa_per_gram: number | null;
  /** The most recent trusted price, kept for the greyed-out paused view. */
  last_known_market_paisa_per_gram: number | null;
  last_known_at: string | null;
  guardrail_paisa_per_gram: number;
  guardrail_applied: boolean;
  source: PriceSourceInfo;
  fetched_at: string | null;
  age_seconds: number | null;
  next_refresh_in_seconds: number;
  refresh_interval_seconds: number;
  max_age_seconds: number;
  server_now: string;
}

export interface Balances {
  customer_cash_paisa: number;
  customer_gold_mg: number;
  platform_cash_paisa: number;
  platform_gold_mg: number;
}

export interface QuoteRequest {
  side: Side;
  input_mode: InputMode;
  amount: number;
}

export interface Quote {
  id: string;
  side: Side;
  input_mode: InputMode;
  input_amount: number;
  market_paisa_per_gram: number;
  unit_price_paisa_per_gram: number;
  spread_bps: number;
  guardrail_paisa_per_gram: number;
  guardrail_applied: boolean;
  gold_mg: number;
  total_paisa: number;
  status: QuoteStatus;
  created_at: string;
  expires_at: string;
  settled_at: string | null;
  seconds_remaining: number;
  server_now: string;
  source: SourceId;
  price_fetched_at: string;
}

export interface Trade {
  id: string;
  side: Side;
  gold_mg: number;
  total_paisa: number;
  unit_price_paisa_per_gram: number;
  market_paisa_per_gram: number;
  spread_bps: number;
  guardrail_applied: boolean;
  guardrail_paisa_per_gram: number;
  source: SourceId;
  price_fetched_at: string;
  quote_id: string;
  settled_at: string;
}

export interface Receipt {
  trade: Trade;
  balances_before: Balances;
  balances_after: Balances;
  /** True when a confirm was replayed: no new ledger entries were written. */
  idempotent_replay: boolean;
}

export interface IntegritySummary {
  ok: boolean;
  checked_at: string;
}

export interface IntegrityReport extends IntegritySummary {
  ledger_sums: { PKR: number; GOLD: number };
  account_mismatches: string[];
  unbalanced_trades: string[];
  entry_count: number;
}

export interface StateResponse {
  price: PriceView;
  balances: Balances;
  trading: Trading;
  integrity: IntegritySummary;
  recent_trades: Trade[];
  server_now: string;
}

export interface DemoSettings {
  fail_primary: boolean;
  fail_fallback: boolean;
  force_stale: boolean;
  guardrail_paisa_per_gram: number;
}

export type DemoSettingsPatch = Partial<DemoSettings>;

/** `PUT /api/demo/settings` echoes the settings and the price view they now produce. */
export interface DemoSettingsResponse {
  settings: DemoSettings;
  price: PriceView;
}

export interface DemoBalancesRequest {
  customer_cash_paisa?: number;
  customer_gold_mg?: number;
  platform_gold_mg?: number;
}

export interface DemoBalancesResponse {
  balances: Balances;
  integrity: IntegritySummary;
}

export type ApiErrorCode =
  | "TRADING_PAUSED"
  | "QUOTE_EXPIRED"
  | "INSUFFICIENT_CASH"
  | "INSUFFICIENT_GOLD"
  | "INSUFFICIENT_INVENTORY"
  | "VALIDATION"
  | "NOT_FOUND";

/** The error envelope every non-2xx API response uses. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode | string;
    message: string;
    details?: Record<string, unknown>;
  };
}
