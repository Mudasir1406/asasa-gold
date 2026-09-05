import { describe, it, expect } from "vitest";
import {
  applyBps,
  checkAffordability,
  computeQuote,
  maxAmount,
  mulDivCeil,
  mulDivFloor,
  mulDivRound,
  MIN_TRADE_MG,
  QuoteMathError,
} from "./quoteMath";
import type { Balances } from "./types";

// Same fixtures as api/tests/Unit/QuoteMathTest.php: market 3955512 → buy/sell.
const BUY = 4351063;
const SELL = 3559961;

const seed: Balances = {
  customer_cash_paisa: 25000000,
  customer_gold_mg: 2500,
  platform_cash_paisa: 500000000,
  platform_gold_mg: 50000,
};

describe("integer helpers", () => {
  it("mulDivFloor / Ceil / Round match the PHP Money helpers", () => {
    expect(mulDivFloor(7, 10, 3)).toBe(23);
    expect(mulDivCeil(7, 10, 3)).toBe(24);
    expect(mulDivRound(7, 10, 3)).toBe(23);
    expect(mulDivRound(5, 10, 4)).toBe(13);
    expect(mulDivFloor(0, 10, 3)).toBe(0);
    expect(mulDivCeil(6, 10, 3)).toBe(20);
  });

  it("applyBps rounds half up", () => {
    expect(applyBps(3953695, 11000)).toBe(4349065);
    expect(applyBps(3953695, 9000)).toBe(3558326);
  });

  it("rejects non-positive divisors and unsafe products", () => {
    expect(() => mulDivFloor(1, 1, 0)).toThrow(RangeError);
    expect(() => mulDivFloor(2 ** 40, 2 ** 40, 1)).toThrow(RangeError);
    expect(() => mulDivFloor(1.5, 1, 1)).toThrow(RangeError);
  });
});

describe("computeQuote", () => {
  it("BUY by PKR: floors grams, cost ≤ input", () => {
    const r = computeQuote("BUY", "PKR", 10000000, BUY, SELL);
    expect(r).toEqual({ gold_mg: 2298, total_paisa: 9998743, unit_price: BUY });
    expect(r.total_paisa).toBeLessThanOrEqual(10000000);
  });

  it("BUY by gold: ceils cost", () => {
    expect(computeQuote("BUY", "GOLD", 1000, BUY, SELL).total_paisa).toBe(4351063);
  });

  it("SELL by gold: floors proceeds", () => {
    expect(computeQuote("SELL", "GOLD", 2500, BUY, SELL).total_paisa).toBe(8899902);
  });

  it("SELL by PKR: ceils grams, proceeds ≥ input", () => {
    const r = computeQuote("SELL", "PKR", 5000000, BUY, SELL);
    expect(r.gold_mg).toBe(1405);
    expect(r.total_paisa).toBe(5001745);
    expect(r.total_paisa).toBeGreaterThanOrEqual(5000000);
    expect(r.unit_price).toBe(SELL);
  });

  it("property: BUY-PKR never overcharges, SELL-PKR never underpays, monotonic", () => {
    let lastBuyMg = 0;
    let lastSellMg = 0;
    // From PKR 1,000 — smaller BUY-PKR amounts fall under MIN_TRADE_MG.
    for (let a = 100000; a <= 20000000; a += 777777) {
      const b = computeQuote("BUY", "PKR", a, BUY, SELL);
      expect(b.total_paisa).toBeLessThanOrEqual(a);
      expect(b.gold_mg).toBeGreaterThanOrEqual(lastBuyMg);
      lastBuyMg = b.gold_mg;

      const s = computeQuote("SELL", "PKR", a, BUY, SELL);
      expect(s.total_paisa).toBeGreaterThanOrEqual(a);
      expect(s.gold_mg).toBeGreaterThanOrEqual(lastSellMg);
      lastSellMg = s.gold_mg;
    }
  });

  it("accepts exactly the minimum trade", () => {
    expect(MIN_TRADE_MG).toBe(10);
    expect(computeQuote("SELL", "GOLD", 10, BUY, SELL).gold_mg).toBe(10);
  });

  it("rejects trades below the minimum", () => {
    expect(() => computeQuote("BUY", "PKR", 100, BUY, SELL)).toThrow(QuoteMathError);
    try {
      computeQuote("BUY", "GOLD", 9, BUY, SELL);
    } catch (err) {
      expect(err).toBeInstanceOf(QuoteMathError);
      expect((err as QuoteMathError).code).toBe("BELOW_MINIMUM");
    }
  });

  it("rejects non-positive amounts", () => {
    expect(() => computeQuote("BUY", "GOLD", 0, BUY, SELL)).toThrow(QuoteMathError);
    try {
      computeQuote("SELL", "PKR", -5, BUY, SELL);
    } catch (err) {
      expect((err as QuoteMathError).code).toBe("NON_POSITIVE");
    }
  });
});

describe("checkAffordability", () => {
  it("mirrors the server: only cash, gold and inventory gate a trade", () => {
    expect(checkAffordability("BUY", 1000, 4351063, seed)).toBeNull();
    expect(checkAffordability("SELL", 2500, 8899902, seed)).toBeNull();

    expect(checkAffordability("BUY", 5745, 25000001, seed)).toEqual({
      code: "INSUFFICIENT_CASH",
      required: 25000001,
      available: 25000000,
      unit: "paisa",
    });
    expect(checkAffordability("SELL", 2501, 1, seed)).toEqual({
      code: "INSUFFICIENT_GOLD",
      required: 2501,
      available: 2500,
      unit: "mg",
    });
    const rich = { ...seed, customer_cash_paisa: 100000000000 };
    expect(checkAffordability("BUY", 50001, 1, rich)).toEqual({
      code: "INSUFFICIENT_INVENTORY",
      required: 50001,
      available: 50000,
      unit: "mg",
    });
  });

  it("reports cash before inventory when both are short", () => {
    expect(checkAffordability("BUY", 50001, 25000001, seed)?.code).toBe(
      "INSUFFICIENT_CASH",
    );
  });
});

describe("maxAmount", () => {
  it("derives the Max chip from the relevant balance", () => {
    expect(maxAmount("BUY", "PKR", seed, BUY, SELL)).toBe(25000000);
    expect(maxAmount("BUY", "GOLD", seed, BUY, SELL)).toBe(5745);
    expect(maxAmount("SELL", "GOLD", seed, BUY, SELL)).toBe(2500);
    expect(maxAmount("SELL", "PKR", seed, BUY, SELL)).toBe(8899902);
  });

  it("caps both BUY modes at platform inventory", () => {
    const thin = { ...seed, platform_gold_mg: 500 };
    expect(maxAmount("BUY", "GOLD", thin, BUY, SELL)).toBe(500);
    // 500 mg costs ceil(500 × 4351063 / 1000) = 2175532 paisa, which buys back exactly 500 mg.
    expect(maxAmount("BUY", "PKR", thin, BUY, SELL)).toBe(2175532);
    expect(computeQuote("BUY", "PKR", 2175532, BUY, SELL).gold_mg).toBe(500);
  });

  it("property: a quote at Max is always affordable", () => {
    const cases: Balances[] = [
      seed,
      { ...seed, customer_cash_paisa: 500000, customer_gold_mg: 100, platform_gold_mg: 500 },
      { ...seed, customer_cash_paisa: 1, customer_gold_mg: 1 },
      { ...seed, customer_cash_paisa: 999999999, platform_gold_mg: 7 },
    ];
    for (const balances of cases) {
      for (const side of ["BUY", "SELL"] as const) {
        for (const mode of ["PKR", "GOLD"] as const) {
          const max = maxAmount(side, mode, balances, BUY, SELL);
          if (max <= 0) continue;
          let legs;
          try {
            legs = computeQuote(side, mode, max, BUY, SELL);
          } catch (err) {
            expect((err as QuoteMathError).code).toBe("BELOW_MINIMUM");
            continue;
          }
          expect(checkAffordability(side, legs.gold_mg, legs.total_paisa, balances)).toBeNull();
        }
      }
    }
  });
});
