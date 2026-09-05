/**
 * Client-side port of the API's quote arithmetic (spec §3, §6), used only for
 * the live estimate and inline validation in the trade form. The server rounds
 * once at quote issue and its numbers always win; this file exists so the
 * estimate the customer sees while typing is the number they will be quoted.
 *
 * Everything is integer paisa / milligrams / paisa-per-gram. Products are
 * checked against `Number.MAX_SAFE_INTEGER` and quotients are derived with
 * `%`, so no floating-point rounding can leak into a displayed amount.
 */
import type { Balances, InputMode, Side } from "./types";

export const MIN_TRADE_MG = 10;

export type QuoteMathCode = "NON_POSITIVE" | "BELOW_MINIMUM";

export class QuoteMathError extends Error {
  readonly code: QuoteMathCode;

  constructor(code: QuoteMathCode, message: string) {
    super(message);
    this.name = "QuoteMathError";
    this.code = code;
  }
}

export interface QuoteLegs {
  gold_mg: number;
  total_paisa: number;
  unit_price: number;
}

export type ShortfallCode =
  | "INSUFFICIENT_CASH"
  | "INSUFFICIENT_GOLD"
  | "INSUFFICIENT_INVENTORY";

/** What is short, with required/available in the same integer unit. */
export interface Shortfall {
  code: ShortfallCode;
  required: number;
  available: number;
  unit: "paisa" | "mg";
}

function safeProduct(a: number, b: number): number {
  const product = a * b;
  if (
    !Number.isSafeInteger(a) ||
    !Number.isSafeInteger(b) ||
    !Number.isSafeInteger(product)
  ) {
    throw new RangeError(`${a} × ${b} is not a safe integer`);
  }
  return product;
}

function guardDivisor(div: number): void {
  if (!Number.isSafeInteger(div) || div <= 0) {
    throw new RangeError("divisor must be a positive integer");
  }
}

/** Exact quotient truncated toward zero, like PHP's `intdiv`. */
function intDiv(dividend: number, div: number): number {
  return (dividend - (dividend % div)) / div;
}

/** `floor(a × b ÷ div)` in integers. */
export function mulDivFloor(a: number, b: number, div: number): number {
  guardDivisor(div);
  const product = safeProduct(a, b);
  return intDiv(product, div) - (product % div < 0 ? 1 : 0);
}

/** `ceil(a × b ÷ div)` in integers. */
export function mulDivCeil(a: number, b: number, div: number): number {
  guardDivisor(div);
  const product = safeProduct(a, b);
  const quotient = intDiv(product, div);
  return product % div > 0 ? quotient + 1 : quotient;
}

/** `round(a × b ÷ div)`, half up, in integers. */
export function mulDivRound(a: number, b: number, div: number): number {
  guardDivisor(div);
  const doubled = safeProduct(safeProduct(a, b), 2) + div;
  return intDiv(doubled, div * 2);
}

/** Scale by basis points (10000 = ×1.00), rounding half up — the spread rule. */
export function applyBps(amount: number, bps: number): number {
  return mulDivRound(amount, bps, 10000);
}

/**
 * The four input cases. Rounding favours the platform: grams are floored on
 * BUY and ceiled on SELL, then the total is recomputed from the rounded grams
 * so both legs agree exactly.
 */
export function computeQuote(
  side: Side,
  inputMode: InputMode,
  amount: number,
  buyPaisa: number,
  sellPaisa: number,
): QuoteLegs {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new QuoteMathError("NON_POSITIVE", "Amount must be greater than zero");
  }

  const unit = side === "BUY" ? buyPaisa : sellPaisa;
  let goldMg: number;
  let totalPaisa: number;

  if (side === "BUY") {
    goldMg = inputMode === "PKR" ? mulDivFloor(amount, 1000, unit) : amount;
    totalPaisa = mulDivCeil(goldMg, unit, 1000);
  } else {
    goldMg = inputMode === "PKR" ? mulDivCeil(amount, 1000, unit) : amount;
    totalPaisa = mulDivFloor(goldMg, unit, 1000);
  }

  if (goldMg < MIN_TRADE_MG) {
    throw new QuoteMathError("BELOW_MINIMUM", "Minimum trade is 0.010 g");
  }

  return { gold_mg: goldMg, total_paisa: totalPaisa, unit_price: unit };
}

/**
 * The server's affordability rule (`QuoteService::checkAffordability`): only
 * customer cash, customer gold and platform inventory gate a trade; platform
 * cash is an ungated float. Returns `null` when the trade is affordable.
 */
export function checkAffordability(
  side: Side,
  goldMg: number,
  totalPaisa: number,
  balances: Balances,
): Shortfall | null {
  if (side === "BUY") {
    if (totalPaisa > balances.customer_cash_paisa) {
      return {
        code: "INSUFFICIENT_CASH",
        required: totalPaisa,
        available: balances.customer_cash_paisa,
        unit: "paisa",
      };
    }
    if (goldMg > balances.platform_gold_mg) {
      return {
        code: "INSUFFICIENT_INVENTORY",
        required: goldMg,
        available: balances.platform_gold_mg,
        unit: "mg",
      };
    }
    return null;
  }

  if (goldMg > balances.customer_gold_mg) {
    return {
      code: "INSUFFICIENT_GOLD",
      required: goldMg,
      available: balances.customer_gold_mg,
      unit: "mg",
    };
  }
  return null;
}

/**
 * The largest input (paisa or mg) the relevant balances allow — the Max chip.
 * BUY is bounded by the wallet and by what platform inventory is worth at the
 * buy price; SELL+GOLD is the holding; SELL+PKR is what the holding fetches.
 * Every result, when quoted, passes `checkAffordability`.
 */
export function maxAmount(
  side: Side,
  inputMode: InputMode,
  balances: Balances,
  buyPaisa: number,
  sellPaisa: number,
): number {
  if (side === "BUY") {
    if (inputMode === "PKR") {
      return Math.min(
        balances.customer_cash_paisa,
        mulDivCeil(balances.platform_gold_mg, buyPaisa, 1000),
      );
    }
    return Math.min(
      mulDivFloor(balances.customer_cash_paisa, 1000, buyPaisa),
      balances.platform_gold_mg,
    );
  }
  if (inputMode === "GOLD") return balances.customer_gold_mg;
  return mulDivFloor(balances.customer_gold_mg, sellPaisa, 1000);
}
